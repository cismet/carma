import { describe, expect, it } from "vitest";
import { getProj4Converter } from "@carma-geo/proj";
import { degToRad, type Degrees } from "@carma-units";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";

import type {
  CardinalDirection,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../types";
import { createImageSelectionIndex } from "./image-selection-index";
import { wgs84ToDatasetXY } from "./imageRecord";
import { CardinalDirectionEnum } from "./orientation";

const target = { longitude: 7.2, latitude: 51.27 };
const converter = getProj4Converter("EPSG:25832", "EPSG:4326");
const [x, y] = wgs84ToDatasetXY(converter, target.longitude, target.latitude);
const dataset = (id: string): ObliqueDataset => ({
  ...TEST_LEGACY_SERIES,
  id,
  cameras: {
    ...TEST_LEGACY_SERIES.cameras,
    nadir: { ...TEST_LEGACY_SERIES.cameras["170"], view: "nadir" },
  },
});
const image = (
  seriesId: string,
  sourceId: string,
  sector: CardinalDirection,
  heading: number,
  dx = 0,
  dy = 0,
  cameraId = "170"
): ObliqueImageRecord => ({
  id: seriesId + "::" + sourceId,
  seriesId,
  sourceId,
  cameraId,
  x: x + dx,
  y: y + dy,
  z: 700,
  m: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  centerWGS84: [target.longitude, target.latitude, 700],
  sector,
  fallbackHeading: degToRad(heading as Degrees),
});
const catalog = (records: ObliqueImageRecord[]): ObliqueSelectionData => ({
  imageRecords: new Map(records.map((record) => [record.id, record])),
  datasets: new Map(
    [...new Set(records.map((record) => record.seriesId))].map((id) => [
      id,
      dataset(id),
    ])
  ),
  centers: new Map(),
});
const query = (
  heading: number,
  extra: Partial<ObliqueViewQuery> = {}
): ObliqueViewQuery => ({
  target,
  headingRad: degToRad(heading as Degrees),
  pitchRad: degToRad(45 as Degrees),
  maxDistanceMeters: 1000,
  ...extra,
});
const { North, East, South, West } = CardinalDirectionEnum;

describe("one-catalog directional and spatial selection", () => {
  it("optionally indexes center-ray ground points and bounds candidates per direction while leaving default camera indexing unchanged", () => {
    const remoteCamera = image("2026", "remote-camera", North, 0, 10000);
    const nearbyCamera = image("2026", "near-camera", North, 0);
    const east = image("2026", "east", East, 90);
    const data = catalog([remoteCamera, nearbyCamera, east]);
    data.centers.set(remoteCamera.id, {
      id: remoteCamera.id,
      x,
      y,
      longitude: target.longitude,
      latitude: target.latitude,
      cardinal: North,
    });
    data.centers.set(nearbyCamera.id, {
      id: nearbyCamera.id,
      x: x + 100,
      y,
      longitude: target.longitude,
      latitude: target.latitude,
      cardinal: North,
    });
    expect([...createImageSelectionIndex(data).candidates(query(0))]).toEqual([
      nearbyCamera,
    ]);
    const index = createImageSelectionIndex(data, { groundCenters: true });
    expect([...index.candidates(query(0), { limitPerDirection: 1 })]).toEqual([
      remoteCamera,
    ]);
    expect([
      ...index.candidates(query(0), {
        allDirections: true,
        limitPerDirection: 1,
      }),
    ]).toEqual([remoteCamera, east]);
  });

  it("chooses different intrinsic sectors per series by their actual mean heading", () => {
    const oldNorth = image("2024", "north", North, 325);
    const newWest = image("2026", "west", West, 320);
    const index = createImageSelectionIndex(
      catalog([
        oldNorth,
        image("2024", "east", East, 55),
        newWest,
        image("2026", "north", North, 5),
      ])
    );
    const candidates = [...index.candidates(query(324))];
    expect(candidates).toEqual([oldNorth, newWest]);
    expect(candidates[0]).toBe(oldNorth);
    expect([
      ...index.candidates(query(324, { enabledSeriesIds: ["2026"] })),
    ]).toEqual([newWest]);
  });

  it("uses a circular mean across the north wrap", () => {
    const left = image("2026", "left", North, 359);
    const right = image("2026", "right", North, 1);
    const index = createImageSelectionIndex(
      catalog([left, right, image("2026", "south", South, 180)])
    );
    expect([...index.candidates(query(0))]).toEqual([left, right]);
  });

  it("fills cardinal indexes incrementally without losing earlier sectors", () => {
    const north = image("2026", "north", North, 0);
    const east = image("2026", "east", East, 90);
    const index = createImageSelectionIndex(catalog([north]));
    index.append(catalog([east]));
    expect([...index.candidates(query(0))]).toEqual([north]);
    expect([...index.candidates(query(90))]).toEqual([east]);
  });

  it("allows the all-direction fallback to cross the preferred 45 degree sector", () => {
    const preferredButFar = image("2026", "north-far", North, 0, 1500);
    const alternate = image("2026", "east-near", East, 90);
    const index = createImageSelectionIndex(
      catalog([preferredButFar, alternate])
    );
    const queryWithOrigin = query(0, {
      excludeImageId: "current",
      maxDistanceMeters: 1000,
    });
    expect([...index.candidates(queryWithOrigin)]).toEqual([]);
    expect([
      ...index.candidates(queryWithOrigin, { allDirections: true }),
    ]).toEqual([alternate]);
  });

  it("keeps nearby candidates across cell boundaries and excludes corners outside the radius", () => {
    const west = image("2026", "near-west", North, 0, -500);
    const east = image("2026", "near-east", North, 0, 500);
    const far = Array.from({ length: 40 }, (_, i) =>
      image("2026", "far-" + i, North, 0, 10000 * (i + 1))
    );
    const index = createImageSelectionIndex(
      catalog([
        west,
        east,
        image("2026", "outside-circle", North, 0, 900, 900),
        ...far,
      ])
    );
    expect(
      [...index.candidates(query(0))].map((record) => record.id).sort()
    ).toEqual([east.id, west.id].sort());
    expect([
      ...index.candidates(query(0, { maxDistanceMeters: 1000000 })),
    ]).toHaveLength(43);
  });

  it("searches nadir independently of the horizontal direction and excludes it from oblique queries", () => {
    const oblique = image("2026", "front", North, 0);
    const nadir = image("2026", "vertical", North, 0, 0, 0, "nadir");
    const index = createImageSelectionIndex(catalog([oblique, nadir]));
    expect([...index.candidates(query(180, { cameraView: "nadir" }))]).toEqual([
      nadir,
    ]);
    expect([...index.candidates(query(0))]).toEqual([oblique]);
  });

  it("returns no candidates for an empty series selection or invalid radius", () => {
    const index = createImageSelectionIndex(
      catalog([image("2026", "front", North, 0)])
    );
    expect([...index.candidates(query(0, { enabledSeriesIds: [] }))]).toEqual(
      []
    );
    expect([...index.candidates(query(0, { maxDistanceMeters: NaN }))]).toEqual(
      []
    );
  });
});
