import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { degToRadNumeric } from "@carma-units";
import { getProj4Converter } from "@carma-geo/proj";
import {
  WUPPERTAL_OBLIQUE_2024,
  WUPPERTAL_OBLIQUE_2026,
  WUPPERTAL_2026_RATHAUS_DATASET,
  resolveSeries,
} from "../config";
import type {
  ObliqueDataset,
  ObliqueMetadata,
  ObliqueSelectionData,
} from "../types";
import { buildImageRecords, qualifiedImageId } from "./imageRecord";
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
    ...WUPPERTAL_OBLIQUE_2026.sourceConventions,
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
  ...WUPPERTAL_OBLIQUE_2026,
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
  it("validates unique nonempty configured series IDs", () => {
    expect(() =>
      resolveSeries({ series: [dataset("same"), dataset("same")] })
    ).toThrow(/unique/);
    expect(() => resolveSeries({ series: [dataset("")] })).toThrow(/nonempty/);
  });
  it("keeps normalized 2024 nadir records out of the served-image capability", () => {
    const input = metadata("wuppertal-2024");
    input.cameras.nadir = { ...camera, view: "nadir" };
    input.images.nadir = { ...input.images.same, cameraId: "nadir" };
    const built = buildImageRecords(input, {
      ...WUPPERTAL_OBLIQUE_2024,
      metadataFormat: "inpho-v1",
    });
    expect(
      [...built.imageRecords.values()].map((record) => record.sourceId)
    ).toEqual(["same"]);
    const all = buildImageRecords(
      { ...input, seriesId: "wuppertal-2026" },
      WUPPERTAL_OBLIQUE_2026
    );
    expect(all.imageRecords.size).toBe(2);
  });
});

describe("image series configuration", () => {
  it("retains direct 2024 preview and download URLs", () => {
    expect(WUPPERTAL_OBLIQUE_2024.previewPath).toMatch(/2024$/);
    expect(WUPPERTAL_OBLIQUE_2024.downloadPath).toBeUndefined();
    const urls = getImageUrls(
      "1_2_17001",
      WUPPERTAL_OBLIQUE_2024.previewPath,
      WUPPERTAL_OBLIQUE_2024.previewQualityLevel,
      WUPPERTAL_OBLIQUE_2024.downloadQualityLevel
    );
    expect(urls.previewUrl).toBe(
      "https://wupp-oblique.cismet.de/2024/3/1_2_17001.jpg"
    );
    expect(urls.downloadUrl).toBe(
      "https://wupp-oblique.cismet.de/2024/1/1_2_17001.jpg"
    );
  });
  it("keeps full 2026 and the Rathaus sample independently selectable", () => {
    const series = resolveSeries(undefined);
    expect(series.map((entry) => entry.id)).toEqual([
      "wuppertal-2024",
      "wuppertal-2026",
      "wuppertal-2026-rathaus",
    ]);
    expect(WUPPERTAL_2026_RATHAUS_DATASET.cameras).toBe(
      WUPPERTAL_OBLIQUE_2026.cameras
    );
    expect(() =>
      buildImageRecords(
        metadata(WUPPERTAL_OBLIQUE_2026.id),
        WUPPERTAL_2026_RATHAUS_DATASET
      )
    ).toThrow(/series/i);
  });
});

describe("geometric best fit", () => {
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
