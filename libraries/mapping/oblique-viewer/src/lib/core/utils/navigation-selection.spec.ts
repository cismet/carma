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
import {
  estimateGroundCenter,
  panViewTarget,
  rankImagesForView,
} from "./selection";
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
  it("keeps classic rotation in pure ground-center order even if coverage scoring prefers another image", () => {
    const records = new Map(data.imageRecords);
    const current = records.get("navigation::current")!;
    records.set(current.id, {
      ...current,
      footprint: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      footprintApproximate: false,
    });
    const selection = { ...data, imageRecords: records };
    const index = createImageSelectionIndex(selection);
    expect(
      rankImagesForView(selection, query, index.candidates(query))[0].record
        .sourceId
    ).toBe("neighbor");
    const classic = {
      ...query,
      navigationSelection: "center-distance" as const,
    };
    expect(
      rankImagesForView(selection, classic, index.candidates(classic))[0].record
        .sourceId
    ).toBe("current");
  });

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

describe("heading-relative arrow sectors", () => {
  const arrows = [
    { key: "left", right: -1, forward: 0 },
    { key: "right", right: 1, forward: 0 },
    { key: "up", right: 0, forward: 1 },
    { key: "down", right: 0, forward: -1 },
  ];
  const converter = getProj4Converter("EPSG:25832", "EPSG:4326");

  it.each([54, 144, 234, 324])(
    "compensates all four arrow displacements for live view heading %s°",
    (bearing) => {
      const record = data.imageRecords.get("navigation::current")!;
      const headingRad = degToRad(bearing as Degrees);
      const origin = converter.inverse([longitude, latitude]) as [
        number,
        number
      ];
      for (const arrow of arrows) {
        const moved = panViewTarget(record, built.dataset, query.target, {
          ...arrow,
          headingRad,
        });
        const xy = converter.inverse([moved.longitude, moved.latitude]) as [
          number,
          number
        ];
        const delta = new Vector3(xy[0] - origin[0], xy[1] - origin[1], 0)
          .applyAxisAngle(new Vector3(0, 0, 1), -record.pose!.utmConvergenceRad)
          .normalize();
        const expected = new Vector3(
          Math.sin(headingRad) * arrow.forward +
            Math.cos(headingRad) * arrow.right,
          Math.cos(headingRad) * arrow.forward -
            Math.sin(headingRad) * arrow.right,
          0
        );
        expect(delta.dot(expected), arrow.key).toBeCloseTo(1, 6);
      }
    }
  );

  it.each([54, 144, 234, 324])(
    "rejects closer perpendicular neighbors in every arrow sector at %s°",
    (bearing) => {
      for (const arrow of arrows) {
        const radians = degToRad(bearing as Degrees);
        const axis = new Vector3(
          Math.sin(radians) * arrow.forward + Math.cos(radians) * arrow.right,
          Math.cos(radians) * arrow.forward - Math.sin(radians) * arrow.right,
          0
        );
        const lateral = new Vector3(axis.y, -axis.x, 0);
        const images: ObliqueMetadata["images"] = {};
        for (const [id, along, across] of [
          ["current", 0, 0],
          ["correct", 100, 0],
          ["wrong-axis", 10, 50],
          ["behind", -70, 0],
        ] as const) {
          images[id] = {
            cameraId: "camera",
            positionM: [
              370000 + axis.x * along + lateral.x * across,
              5680000 + axis.y * along + lateral.y * across,
              900,
            ],
            rotationMatrixRows: matrix(bearing as Degrees),
          };
        }
        const records = buildImageRecords(
          { ...metadata, images },
          built.dataset
        );
        const selection: ObliqueSelectionData = {
          imageRecords: records.imageRecords,
          datasets: new Map([[records.dataset.id, records.dataset]]),
          centers: new Map(
            [...records.imageRecords].map(([id, record]) => [
              id,
              estimateGroundCenter(record, records.dataset),
            ])
          ),
        };
        const current = selection.imageRecords.get("navigation::current")!;
        const center = selection.centers.get(current.id)!;
        const [longitude, latitude] = converter.forward([
          center.x + axis.x * 10,
          center.y + axis.y * 10,
        ]) as [number, number];
        const directional: ObliqueViewQuery = {
          ...query,
          headingRad: degToRad(current.pose!.bearingDeg as Degrees),
          excludeImageId: current.id,
          navigationOrigin: {
            longitude: center.longitude,
            latitude: center.latitude,
          },
          target: { ...query.target, longitude, latitude },
        };
        const index = createImageSelectionIndex(selection);
        const ranked = rankImagesForView(
          selection,
          directional,
          index.candidates(directional)
        );
        expect(
          ranked.map((entry) => entry.record.sourceId),
          arrow.key
        ).toEqual(["correct"]);
      }
    }
  );
});
