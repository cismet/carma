import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { degToRad, type Degrees } from "@carma-units";
import { getProj4Converter } from "@carma-geo/proj";
import type {
  ObliqueMetadata,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../types";
import { TEST_INPHO_SERIES } from "./synthetic-series.test-fixture";
import { buildImageRecords } from "./imageRecord";
import { estimateGroundCenter, rankImagesForView } from "./selection";
import { createImageSelectionIndex } from "./image-selection-index";
const matrix = (bearing: Degrees) => {
  const heading = degToRad(bearing),
    pitch = degToRad(45 as Degrees),
    direction = new Vector3(
      Math.sin(heading) * Math.sin(pitch),
      Math.cos(heading) * Math.sin(pitch),
      -Math.cos(pitch)
    );
  const up = new Vector3(0, 0, 1)
      .addScaledVector(direction, -direction.z)
      .normalize(),
    right = new Vector3().crossVectors(direction, up).normalize();
  return [right.toArray(), up.toArray(), direction.negate().toArray()] as [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
};
const metadata: ObliqueMetadata = {
  schemaVersion: 1,
  seriesId: "navigation",
  conventions: {
    ...TEST_INPHO_SERIES.sourceConventions,
    verticalDatum: "unknown",
  },
  cameras: {
    camera: {
      widthPx: 1000,
      heightPx: 1000,
      focalLengthMm: 10,
      imageMmToPixelAffine: [
        [100, 0, 499.5],
        [0, -100, 499.5],
      ],
      mountRotationDeg: 270,
      view: "front",
    },
  },
  images: {
    current: {
      cameraId: "camera",
      positionM: [370000, 5680000, 900],
      rotationMatrixRows: matrix(0 as Degrees),
    },
    neighbor: {
      cameraId: "camera",
      positionM: [370050, 5680000, 900],
      rotationMatrixRows: matrix(0 as Degrees),
    },
    forward: {
      cameraId: "camera",
      positionM: [370300, 5680000, 900],
      rotationMatrixRows: matrix(0 as Degrees),
    },
    east: {
      cameraId: "camera",
      positionM: [369100, 5680900, 900],
      rotationMatrixRows: matrix(90 as Degrees),
    },
  },
};
const built = buildImageRecords(metadata, {
  ...TEST_INPHO_SERIES,
  id: "navigation",
  heightDatum: "unknown",
});
const data: ObliqueSelectionData = {
  imageRecords: built.imageRecords,
  datasets: new Map([[built.dataset.id, built.dataset]]),
  centers: new Map(
    [...built.imageRecords].map(([id, record]) => [
      id,
      estimateGroundCenter(record, built.dataset),
    ])
  ),
};
const [longitude, latitude] = getProj4Converter(
  "EPSG:25832",
  "EPSG:4326"
).forward([370000, 5680900]) as [number, number];
const query: ObliqueViewQuery = {
  target: { longitude, latitude, heightMeters: 0, heightDatum: "unknown" },
  headingRad: degToRad(0 as Degrees),
  pitchRad: degToRad(45 as Degrees),
  numCandidates: 4,
  maxDistanceMeters: 1000,
};
describe("indexed camera navigation geometry", () => {
  it("excludes the current photo while retaining a covered same-direction neighbor without image assets", () => {
    const index = createImageSelectionIndex(data),
      baseline = rankImagesForView(data, query, index.candidates(query));
    expect(baseline[0].record.sourceId).toBe("current");
    const excluded = { ...query, excludeImageId: baseline[0].record.id };
    const ranked = rankImagesForView(
      data,
      excluded,
      index.candidates(excluded)
    );
    expect(ranked[0].record.sourceId).toBe("neighbor");
    expect(ranked[0].coversTarget).toBe(true);
    expect(ranked[0].record.assets).toBeUndefined();
    expect(ranked.every((x) => x.record.sourceId !== "east")).toBe(true);
  });
  it("never selects a closer image behind a repeated arrow step", () => {
    const converter = getProj4Converter("EPSG:25832", "EPSG:4326");
    const center = data.centers.get("navigation::neighbor")!;
    const [longitude, latitude] = converter.forward([
      center.x + 10,
      center.y,
    ]) as [number, number];
    const step: ObliqueViewQuery = {
      ...query,
      target: { ...query.target, longitude, latitude },
      excludeImageId: "navigation::neighbor",
    };
    const index = createImageSelectionIndex(data);
    expect(
      rankImagesForView(data, step, index.candidates(step))[0].record.sourceId
    ).toBe("current");
    const directional = {
      ...step,
      navigationOrigin: {
        longitude: center.longitude,
        latitude: center.latitude,
      },
    };
    const ranked = rankImagesForView(
      data,
      directional,
      index.candidates(directional)
    );
    expect(ranked[0].record.sourceId).toBe("forward");
    expect(ranked[0].coversTarget).toBe(true);
    expect(
      ranked.every((candidate) => candidate.record.sourceId !== "current")
    ).toBe(true);
  });
  it("disables a direction with no covered image ahead", () => {
    const center = data.centers.get("navigation::forward")!;
    const [longitude, latitude] = getProj4Converter(
      "EPSG:25832",
      "EPSG:4326"
    ).forward([center.x + 10, center.y]) as [number, number];
    const step: ObliqueViewQuery = {
      ...query,
      target: { ...query.target, longitude, latitude },
      excludeImageId: "navigation::forward",
      navigationOrigin: {
        longitude: center.longitude,
        latitude: center.latitude,
      },
    };
    const index = createImageSelectionIndex(data);
    expect(rankImagesForView(data, step, index.candidates(step))).toEqual([]);
  });
  it("waits for the matching sector instead of using a nearby same-heading photo for rotation", () => {
    const partial = {
      ...data,
      imageRecords: new Map(
        [...data.imageRecords].filter(
          ([, record]) => record.sourceId !== "east"
        )
      ),
    };
    const rotated = {
      ...query,
      headingRad: degToRad(90 as Degrees),
      excludeImageId: "navigation::current",
    };
    const index = createImageSelectionIndex(partial);
    expect(
      rankImagesForView(partial, rotated, index.candidates(rotated))
    ).toEqual([]);
  });
  it("rotates to the matching geometric camera sector with the same target", () => {
    const rotated = {
        ...query,
        headingRad: degToRad(90 as Degrees),
        excludeImageId: "navigation::current",
      },
      index = createImageSelectionIndex(data),
      ranked = rankImagesForView(data, rotated, index.candidates(rotated));
    expect(ranked[0].record.sourceId).toBe("east");
    expect(ranked[0].coversTarget).toBe(true);
  });
});
