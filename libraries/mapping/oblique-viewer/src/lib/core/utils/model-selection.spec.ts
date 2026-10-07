import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { degToRadNumeric, type Radians } from "@carma-units";
import { getProj4Converter } from "@carma-geo/proj";
import {
  TEST_LEGACY_SERIES,
  TEST_INPHO_SERIES,
  TEST_SAMPLE_SERIES,
} from "./synthetic-series.test-fixture";
import { resolveSeries } from "../config";
import type {
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueMetadata,
  ObliqueSelectionData,
} from "../types";
import {
  buildImageRecords,
  qualifiedImageId,
  summarizeObliquePitch,
} from "./imageRecord";
import {
  estimateGroundCenter,
  estimateGroundFootprint,
  rankImagesForView,
} from "./selection";
import { calibrationFromMetadata } from "./calibration";
import { CardinalDirectionEnum } from "./orientation";
import { getImageUrls } from "../../runtime/utils/imageUrls";

const converter = getProj4Converter("EPSG:25832", "EPSG:4326");
const camera = {
  widthPx: 1000,
  heightPx: 1000,
  focalLengthMm: 10,
  imageMmToPixelAffine: [
    [100, 0, 499.5],
    [0, -100, 499.5],
  ] as [[number, number, number], [number, number, number]],
  mountRotationDeg: 270,
  view: "front",
};

const matrix = (bearingDeg = 0, pitchDeg = 45) => {
  const heading = degToRadNumeric(bearingDeg),
    pitch = degToRadNumeric(pitchDeg);
  const direction = new Vector3(
    Math.sin(heading) * Math.sin(pitch),
    Math.cos(heading) * Math.sin(pitch),
    -Math.cos(pitch)
  );
  const up = new Vector3(0, 0, 1).addScaledVector(direction, direction.z * -1);
  if (up.lengthSq() < 1e-12) up.set(0, 1, 0);
  up.normalize();
  const right = new Vector3().crossVectors(direction, up).normalize();
  return [right.toArray(), up.toArray(), direction.negate().toArray()] as [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
};

const metadata = (
  seriesId: string,
  sourceId = "same",
  bearingDeg = 0,
  pitchDeg = 45
): ObliqueMetadata => ({
  schemaVersion: 1,
  seriesId,
  conventions: {
    ...TEST_INPHO_SERIES.sourceConventions,
    verticalDatum: "dhhn2016",
  },
  cameras: { camera },
  images: {
    [sourceId]: {
      cameraId: "camera",
      positionM: [370000, 5680000, 900],
      rotationMatrixRows: matrix(bearingDeg, pitchDeg),
    },
  },
});
const dataset = (id: string): ObliqueDataset => ({
  ...TEST_INPHO_SERIES,
  id,
  metadataFormat: "inpho-v1",
  heightDatum: "unknown",
});
const selectionData = (
  entries: [ObliqueMetadata, ObliqueDataset][]
): ObliqueSelectionData => {
  const data: ObliqueSelectionData = {
    imageRecords: new Map(),
    datasets: new Map(),
    centers: new Map(),
  };
  for (const [source, config] of entries) {
    const built = buildImageRecords(source, config);
    data.datasets.set(config.id, built.dataset);
    for (const [id, record] of built.imageRecords) {
      data.imageRecords.set(id, record);
      data.centers.set(id, estimateGroundCenter(record, built.dataset));
    }
  }
  return data;
};
const queryTarget = (x = 370000, y = 5680900) => {
  const [longitude, latitude] = converter.forward([x, y]) as [number, number];
  return {
    longitude,
    latitude,
    heightMeters: 0,
    heightDatum: "dhhn2016" as const,
  };
};

describe("calibrated browsing pitch summaries", () => {
  it("stores radian sums and image counts per series for an image-weighted mean", () => {
    const data = selectionData([
      [metadata("old", "one", 0, 20), dataset("old")],
      [metadata("old", "two", 0, 30), dataset("old")],
      [metadata("old", "three", 0, 40), dataset("old")],
      [metadata("new", "one", 0, 60), dataset("new")],
    ]);
    const totals = summarizeObliquePitch(data);
    expect(totals.get("old")?.imageCount).toBe(3);
    expect(totals.get("old")?.pitchSumRad).toBeCloseTo(degToRadNumeric(90), 12);
    expect(totals.get("new")?.imageCount).toBe(1);
    expect(totals.get("new")?.pitchSumRad).toBeCloseTo(degToRadNumeric(60), 12);
    const sum = [...totals.values()].reduce(
      (value, total) => value + total.pitchSumRad,
      0
    );
    const count = [...totals.values()].reduce(
      (value, total) => value + total.imageCount,
      0
    );
    expect(sum / count).toBeCloseTo(degToRadNumeric(37.5), 12);
  });

  it("excludes nadir cameras, missing datasets and absent, non-finite or non-oblique angles", () => {
    const data = selectionData([
      [metadata("series", "valid", 0, 40), dataset("series")],
    ]);
    const valid = [...data.imageRecords.values()][0];
    data.datasets.get("series")!.cameras.nadir = {
      ...data.datasets.get("series")!.cameras.camera,
      view: "nadir",
    };
    data.imageRecords.set("nadir", {
      ...valid,
      id: "nadir",
      cameraId: "nadir",
    });
    data.imageRecords.set("orphan", {
      ...valid,
      id: "orphan",
      seriesId: "not-loaded",
    });
    data.imageRecords.set("no-pose", {
      ...valid,
      id: "no-pose",
      pose: undefined,
    } as unknown as ObliqueImageRecord);
    for (const [index, pitchDeg] of [
      undefined,
      NaN,
      Infinity,
      -Infinity,
      -1,
      0,
      90,
      91,
    ].entries())
      data.imageRecords.set("invalid-" + index, {
        ...valid,
        id: "invalid-" + index,
        pose: { ...valid.pose, pitchDeg },
      } as ObliqueImageRecord);
    const totals = summarizeObliquePitch(data);
    expect([...totals.keys()]).toEqual(["series"]);
    expect(totals.get("series")?.imageCount).toBe(1);
    expect(totals.get("series")?.pitchSumRad).toBeCloseTo(
      degToRadNumeric(40),
      12
    );
  });
});

describe("normalized image series", () => {
  it("keeps identical opaque source IDs independently addressable across series", () => {
    const data = selectionData([
      [metadata("old", "same:id"), dataset("old")],
      [metadata("new", "same:id"), dataset("new")],
    ]);
    expect(data.imageRecords.size).toBe(2);
    expect(
      data.imageRecords.get(qualifiedImageId("old", "same:id"))?.sourceId
    ).toBe("same:id");
    expect(
      data.imageRecords.get(qualifiedImageId("new", "same:id"))?.lineIndex
    ).toBeUndefined();
    expect(qualifiedImageId("old::new", "id")).not.toBe(
      qualifiedImageId("old", "new::id")
    );
  });
  it("rejects mismatched schemas, series IDs and source conventions", () => {
    const input = metadata("series");
    expect(() =>
      buildImageRecords({ ...input, schemaVersion: 2 }, dataset("series"))
    ).toThrow(/schema/);
    expect(() => buildImageRecords(input, dataset("other"))).toThrow(/series/);
    expect(() =>
      buildImageRecords(
        {
          ...input,
          conventions: {
            ...input.conventions,
            pixelReference: "raster-corner",
          },
        },
        dataset("series")
      )
    ).toThrow(/conventions/);
  });
  it("rejects non-finite poses, malformed rotations and prototype camera references", () => {
    const input = metadata("series");
    const image = input.images.same;
    for (const invalid of [
      { ...image, positionM: [NaN, 0, 0] },
      {
        ...image,
        rotationMatrixRows: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, -1],
        ],
      },
      { ...image, cameraId: "toString" },
    ]) {
      expect(() =>
        buildImageRecords(
          { ...input, images: { same: invalid } },
          dataset("series")
        )
      ).toThrow(/pose|camera/);
    }
  });
  it("allows per-record AVIF pyramids without a dataset template", () => {
    expect(
      resolveSeries({
        series: [
          {
            ...dataset("avif"),
            avifOnly: true,
            avifPyramidTemplate: "/avif/{imageId}.avif",
          },
        ],
      })[0].avifOnly
    ).toBe(true);
    expect(
      resolveSeries({
        series: [{ ...dataset("per-record"), avifOnly: true }],
      })[0].avifOnly
    ).toBe(true);
    expect(() =>
      resolveSeries({
        series: [{ ...dataset("bad"), avifOnly: "yes" as unknown as boolean }],
      })
    ).toThrow(/boolean/);
  });
  it("validates explicit immutable catalog versions", () => {
    expect(
      resolveSeries({
        series: [{ ...dataset("versioned"), catalogVersion: "source-sha256" }],
      })[0].catalogVersion
    ).toBe("source-sha256");
    for (const catalogVersion of ["", "  ", 42, null])
      expect(() =>
        resolveSeries({
          series: [
            { ...dataset("invalid"), catalogVersion: catalogVersion as string },
          ],
        })
      ).toThrow(/catalog versions/);
  });
  it("validates unique nonempty configured series IDs", () => {
    expect(() =>
      resolveSeries({ series: [dataset("same"), dataset("same")] })
    ).toThrow(/unique/);
    expect(() => resolveSeries({ series: [dataset("")] })).toThrow(/nonempty/);
  });
  it("keeps normalized 2024 nadir records out of the served-image capability", () => {
    const input = metadata("test-legacy");
    input.cameras.nadir = { ...camera, view: "nadir" };
    input.images.nadir = { ...input.images.same, cameraId: "nadir" };
    const built = buildImageRecords(input, {
      ...TEST_LEGACY_SERIES,
      metadataFormat: "inpho-v1",
    });
    expect(
      [...built.imageRecords.values()].map((record) => record.sourceId)
    ).toEqual(["same"]);
    const all = buildImageRecords(
      { ...input, seriesId: "test-inpho" },
      TEST_INPHO_SERIES
    );
    expect(all.imageRecords.size).toBe(2);
  });
});

describe("image series configuration", () => {
  it("rejects malformed or colliding directional source definitions", () => {
    const group = {
      id: "north",
      sector: "N" as const,
      cameraIds: ["front"],
      meanHeadingRad: 0 as Radians,
      imageCount: 2,
      exteriorOrientationsURI: "https://images.example/north.json",
    };
    const series = { ...TEST_INPHO_SERIES, directionalCatalogs: [group] };
    expect(resolveSeries({ series: [series] })[0].directionalCatalogs).toEqual([
      group,
    ]);
    for (const groups of [
      [],
      [group, group],
      [{ ...group, id: "" }],
      [{ ...group, meanHeadingRad: NaN as Radians }],
      [{ ...group, imageCount: -1 }],
      [{ ...group, exteriorOrientationsURI: "" }],
      [{ ...group, sector: "invalid" }],
      [{ ...group, cameraPrefixes: "RI" }],
      [{ ...group, cameraPrefixes: [0] }],
      [{ ...group, obliquePitch: null }],
      [{ ...group, obliquePitch: { pitchSumRad: NaN, imageCount: 1 } }],
      [{ ...group, obliquePitch: { pitchSumRad: 1, imageCount: -1 } }],
      [{ ...group, obliquePitch: { pitchSumRad: 1, imageCount: 3 } }],
    ]) {
      expect(() =>
        resolveSeries({
          series: [
            {
              ...series,
              directionalCatalogs: groups as typeof series.directionalCatalogs,
            },
          ],
        })
      ).toThrow(/Directional catalogs/);
    }
  });

  it("validates exact priority routing without changing physical camera directions", () => {
    const group = {
      id: "north",
      sector: "N" as const,
      cameraIds: ["full-camera-RI"],
      cameraPrefixes: ["RI"],
      meanHeadingRad: 0 as Radians,
      imageCount: 2,
      obliquePitch: { pitchSumRad: 1 as Radians, imageCount: 2 },
      exteriorOrientationsURI: "https://images.example/north.json",
    };
    const routing = {
      cameraLineParity: { EVEN: { RI: "north" }, ODD: { RI: "north" } },
      imageGroups: { RI_29_3403: "north" },
    };
    const series = {
      ...TEST_INPHO_SERIES,
      directionalCatalogs: [group],
      directionalCatalogPriority: routing,
    };
    const resolved = resolveSeries({ series: [series] })[0];
    expect(resolved.directionalCatalogPriority).toEqual(routing);
    expect(resolved.cameraIdToDirection).toEqual(
      TEST_INPHO_SERIES.cameraIdToDirection
    );
    for (const malformed of [
      null,
      {},
      { ...routing, imageGroups: null },
      { ...routing, imageGroups: { RI_29_3403: "unknown" } },
      { ...routing, cameraLineParity: { EVEN: [], ODD: {} } },
      { ...routing, cameraLineParity: { EVEN: {}, ODD: { RI: 1 } } },
    ])
      expect(() =>
        resolveSeries({
          series: [
            {
              ...series,
              directionalCatalogPriority: malformed as typeof routing,
            },
          ],
        })
      ).toThrow(/Directional catalog priority/);
    expect(() =>
      resolveSeries({ series: [{ ...series, directionalCatalogs: undefined }] })
    ).toThrow(/Directional catalog priority/);
  });

  it("uses explicit preview and download URLs", () => {
    expect(TEST_LEGACY_SERIES.previewPath).toMatch(/2024$/);
    expect(TEST_LEGACY_SERIES.downloadPath).toBeUndefined();
    const urls = getImageUrls(
      "1_2_17001",
      TEST_LEGACY_SERIES.previewPath,
      TEST_LEGACY_SERIES.previewQualityLevel,
      TEST_LEGACY_SERIES.downloadQualityLevel
    );
    expect(urls.previewUrl).toBe("https://images.example/2024/3/1_2_17001.jpg");
    expect(urls.downloadUrl).toBe(
      "https://images.example/2024/1/1_2_17001.jpg"
    );
  });
  it("keeps explicit series independently selectable without bundled defaults", () => {
    const series = resolveSeries({
      series: [TEST_LEGACY_SERIES, TEST_INPHO_SERIES, TEST_SAMPLE_SERIES],
    });
    expect(resolveSeries(undefined)).toEqual([]);
    expect(series.map((entry) => entry.id)).toEqual([
      "test-legacy",
      "test-inpho",
      "test-sample",
    ]);
    expect(TEST_SAMPLE_SERIES.cameras).toBe(TEST_INPHO_SERIES.cameras);
    expect(() =>
      buildImageRecords(metadata(TEST_INPHO_SERIES.id), TEST_SAMPLE_SERIES)
    ).toThrow(/series/i);
  });
});

describe("geometric best fit", () => {
  it("prefers higher native pixel density over a nearer image centre while keeping nearest-axis selectable", () => {
    const low = metadata("near", "low");
    const high = metadata("detail", "high");
    high.cameras.camera = {
      ...camera,
      widthPx: 4000,
      heightPx: 4000,
      imageMmToPixelAffine: [
        [400, 0, 1999.5],
        [0, -400, 1999.5],
      ],
    };
    high.images.high.positionM = [370100, 5680000, 900];
    const data = selectionData([
      [low, dataset("near")],
      [high, dataset("detail")],
    ]);
    const query = {
      target: queryTarget(),
      headingRad: 0,
      pitchRad: degToRadNumeric(45),
    };
    const nearest = rankImagesForView(data, {
      ...query,
      selectionStrategy: "nearest-axis",
    });
    expect(nearest[0].record.seriesId).toBe("near");
    const detailed = rankImagesForView(data, {
      ...query,
      selectionStrategy: "best-resolution",
    });
    expect(detailed[0].record.seriesId).toBe("detail");
    expect(detailed[0].coversTarget).toBe(true);
    expect(detailed[0].coverageApproximate).toBeFalsy();
    expect(detailed[0].distanceOnGround).toBeGreaterThan(
      nearest[0].distanceOnGround
    );
  });

  it.each(["outside-sensor", "outside-direction"])(
    "does not promote a detailed image %s over a covered photograph in the requested sector",
    (reason) => {
      const low = metadata("fit", "low");
      const high = metadata(
        "detail",
        "high",
        reason === "outside-direction" ? 60 : 0
      );
      high.cameras.camera = {
        ...camera,
        widthPx: 4000,
        heightPx: 4000,
        focalLengthMm: reason === "outside-direction" ? 5 : 10,
        imageMmToPixelAffine: [
          [400, 0, 1999.5],
          [0, -400, 1999.5],
        ],
      };
      if (reason === "outside-sensor")
        high.images.high.positionM = [371800, 5680000, 900];
      const data = selectionData([
        [low, dataset("fit")],
        [high, dataset("detail")],
      ]);
      const ranked = rankImagesForView(data, {
        target: queryTarget(),
        headingRad: 0,
        pitchRad: degToRadNumeric(45),
        selectionStrategy: "best-resolution",
      });
      expect(ranked).toHaveLength(2);
      expect(ranked[0].record.seriesId).toBe("fit");
      expect(
        ranked.find((item) => item.record.seriesId === "detail")!.coversTarget
      ).toBe(reason === "outside-direction");
    }
  );

  it.each(["missing-target-height", "unknown-camera-datum"])(
    "uses the geometric fallback rather than claiming native density with %s",
    (reason) => {
      const low = metadata("near", "low");
      const high = metadata("detail", "high");
      high.cameras.camera = {
        ...camera,
        widthPx: 4000,
        heightPx: 4000,
        imageMmToPixelAffine: [
          [400, 0, 1999.5],
          [0, -400, 1999.5],
        ],
      };
      high.images.high.positionM = [370100, 5680000, 900];
      const data = selectionData([
        [low, dataset("near")],
        [high, dataset("detail")],
      ]);
      if (reason === "unknown-camera-datum")
        for (const config of data.datasets.values())
          config.heightDatum = "unknown";
      const target = {
        ...queryTarget(),
        heightMeters: reason === "missing-target-height" ? undefined : 0,
      };
      const ranked = rankImagesForView(data, {
        target,
        headingRad: 0,
        pitchRad: degToRadNumeric(45),
        selectionStrategy: "best-resolution",
      });
      expect(ranked[0].record.seriesId).toBe("near");
      expect(ranked.every((item) => item.coverageApproximate)).toBe(true);
    }
  );

  it("waits for target datum conversion before comparing calibrated density across enabled series", () => {
    const low = metadata("near", "low");
    const high = metadata("detail", "high");
    high.cameras.camera = {
      ...camera,
      widthPx: 4000,
      heightPx: 4000,
      imageMmToPixelAffine: [
        [400, 0, 1999.5],
        [0, -400, 1999.5],
      ],
    };
    high.images.high.positionM = [370100, 5680000, 900];
    const data = selectionData([
      [low, dataset("near")],
      [high, dataset("detail")],
    ]);
    for (const config of data.datasets.values())
      config.heightDatum = "ellipsoidal";
    const query = {
      target: queryTarget(),
      headingRad: 0,
      pitchRad: degToRadNumeric(45),
      selectionStrategy: "best-resolution" as const,
    };
    expect(rankImagesForView(data, query)).toEqual([]);
    const converted = rankImagesForView(data, {
      ...query,
      perSeriesTargetHeightMeters: new Map([
        ["near", 45],
        ["detail", 45],
      ]),
    });
    expect(converted).toHaveLength(2);
    expect(converted[0].record.seriesId).toBe("detail");
    expect(converted.every((item) => !item.coverageApproximate)).toBe(true);
  });

  it("uses continuous heading across wrap and ignores a wrong cardinal label", () => {
    const data = selectionData([
      [metadata("near", "same", -1), dataset("near")],
      [metadata("far", "same", 70), dataset("far")],
    ]);
    const record = data.imageRecords.get(qualifiedImageId("near", "same"))!;
    record.sector = CardinalDirectionEnum.West;
    const ranked = rankImagesForView(data, {
      target: queryTarget(),
      headingRad: degToRadNumeric(359),
      pitchRad: degToRadNumeric(45),
    });
    expect(ranked[0].record.seriesId).toBe("near");
    expect(ranked[0].coversTarget).toBe(true);
  });
  it("does not return a disabled series even when it would fit best", () => {
    const data = selectionData([
      [metadata("old"), dataset("old")],
      [metadata("new", "same", 10), dataset("new")],
    ]);
    const ranked = rankImagesForView(data, {
      target: queryTarget(),
      headingRad: 0,
      pitchRad: degToRadNumeric(45),
      enabledSeriesIds: ["new"],
    });
    expect(ranked.map((candidate) => candidate.record.seriesId)).toEqual([
      "new",
    ]);
  });
  it("distinguishes continuous pitch rather than grouping cardinal sectors", () => {
    const data = selectionData([
      [metadata("fit", "same", 0, 45), dataset("fit")],
      [metadata("steep", "same", 0, 10), dataset("steep")],
    ]);
    expect(
      rankImagesForView(data, {
        target: queryTarget(),
        headingRad: 0,
        pitchRad: degToRadNumeric(45),
      })[0].record.seriesId
    ).toBe("fit");
  });
  it("waits for exact datum conversion instead of comparing terrain to ellipsoidal camera z", () => {
    const data = selectionData([[metadata("series"), dataset("series")]]);
    const config = data.datasets.get("series")!;
    config.heightDatum = "ellipsoidal";
    const query = {
      target: queryTarget(),
      headingRad: 0,
      pitchRad: degToRadNumeric(45),
    };
    expect(rankImagesForView(data, query)).toEqual([]);
    expect(
      rankImagesForView(data, {
        ...query,
        perSeriesTargetHeightMeters: new Map([["series", 45]]),
      })
    ).toHaveLength(1);
  });
  it("can derive a center and footprint without delivered shapefiles", () => {
    const input = metadata("series");
    input.cameras.camera = {
      ...camera,
      imageMmToPixelAffine: [
        [100, 0, 499.5],
        [0, -100, 299.5],
      ],
    };
    const built = buildImageRecords(input, dataset("series"));
    const record = [...built.imageRecords.values()][0];
    const center = estimateGroundCenter(record, built.dataset);
    expect(center.x).toBeCloseTo(370000, 5);
    expect(center.y).toBeCloseTo(5680600, 5);
    expect(estimateGroundFootprint(record, built.dataset)).toHaveLength(5);
    expect(
      calibrationFromMetadata(input.cameras.camera).principalPointPx[1]
    ).toBe(299.5);
  });
  it("projects off-center affine calibration for pixel coverage", () => {
    const input = metadata("series");
    input.cameras.camera = {
      ...camera,
      heightPx: 100,
      imageMmToPixelAffine: [
        [100, 0, 499.5],
        [0, -100, 9.5],
      ],
    };
    const data = selectionData([[input, dataset("series")]]);
    // Looking at a point behind the calibrated principal ray projects above the delivered image.
    const ranked = rankImagesForView(data, {
      target: queryTarget(370000, 5680950),
      headingRad: 0,
      pitchRad: degToRadNumeric(45),
    });
    expect(ranked[0].coversTarget).toBe(false);
  });
});

describe("explicit nadir capability", () => {
  it("finds nadir cameras across enabled series without falling back to 2024", () => {
    const nadir = metadata("2026", "NA_01_0001", 0, 0);
    nadir.cameras.camera = { ...camera, view: "nadir" };
    const data = selectionData([
      [metadata("2024", "oblique"), dataset("2024")],
      [nadir, dataset("2026")],
    ]);
    const query = {
      target: queryTarget(370000, 5680000),
      headingRad: 0,
      pitchRad: 0,
      cameraView: "nadir" as const,
    };
    const result = rankImagesForView(data, query);
    expect(result).toHaveLength(1);
    expect(result[0].record.sourceId).toBe("NA_01_0001");
    expect(
      rankImagesForView(data, { ...query, enabledSeriesIds: ["2024"] })
    ).toEqual([]);
  });
});
