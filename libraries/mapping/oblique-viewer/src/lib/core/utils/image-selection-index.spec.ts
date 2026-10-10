import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Vector3 } from "three";
import { decodeCompactCatalog } from "./compact-catalog";
import { describe, expect, it } from "vitest";
import { getProj4Converter } from "@carma-geo/proj";
import { degToRad, type Degrees, type Meters } from "@carma-units";
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

  it("rebuckets a late corrected ground center without rebuilding unrelated catalog rows", () => {
    const moving = image("2026", "corrected", North, 0, 10000);
    const distant = Array.from({ length: 10 }, (_, n) =>
      image("2026", `distant-${n}`, North, 0, 15000 + n * 2000)
    );
    const data = catalog([moving, ...distant]);
    const index = createImageSelectionIndex(data, { groundCenters: true });
    expect([...index.candidates(query(0, { maxDistanceMeters: 25 }))]).toEqual(
      []
    );
    index.append({
      datasets: new Map(),
      imageRecords: new Map(),
      centers: new Map([
        [
          moving.id,
          {
            id: moving.id,
            x,
            y,
            longitude: target.longitude,
            latitude: target.latitude,
            cardinal: North,
          },
        ],
      ]),
    });
    expect([...index.candidates(query(0, { maxDistanceMeters: 25 }))]).toEqual([
      moving,
    ]);
    index.append({
      datasets: new Map(),
      imageRecords: new Map(),
      centers: new Map([
        [
          moving.id,
          {
            id: moving.id,
            x: x + 10000,
            y,
            longitude: target.longitude,
            latitude: target.latitude,
            cardinal: North,
          },
        ],
      ]),
    });
    expect([...index.candidates(query(0, { maxDistanceMeters: 25 }))]).toEqual(
      []
    );
  });
  it("replaces corrected record coordinates and pose headings in existing spatial/directional buckets", () => {
    const original = image("2026", "corrected", North, 0, 5000);
    const east = image("2026", "east", East, 90);
    const data = catalog([original, east]);
    const index = createImageSelectionIndex(data);
    const corrected = {
      ...original,
      x,
      y,
      fallbackHeading: degToRad(180 as Degrees),
    };
    index.append({
      datasets: new Map(),
      imageRecords: new Map([[corrected.id, corrected]]),
      centers: new Map(),
    });
    expect([
      ...index.candidates(query(170, { maxDistanceMeters: 25 })),
    ]).toEqual([corrected]);
    expect([...index.candidates(query(90, { maxDistanceMeters: 25 }))]).toEqual(
      [east]
    );
    const replacement = { ...corrected, z: corrected.z + 1 };
    index.append({
      datasets: new Map(),
      imageRecords: new Map([[replacement.id, replacement]]),
      centers: new Map(),
    });
    expect([
      ...index.candidates(query(170, { maxDistanceMeters: 25 })),
    ]).toEqual([replacement]);
  });
  it("removes an emptied old sector after a corrected camera changes direction", () => {
    const original = image("2026", "corrected", North, 0);
    const east = image("2026", "east", East, 90);
    const index = createImageSelectionIndex(catalog([original, east]));
    const corrected = {
      ...original,
      sector: South,
      fallbackHeading: degToRad(180 as Degrees),
    };
    const part = {
      datasets: new Map<string, ObliqueDataset>(),
      imageRecords: new Map([[corrected.id, corrected]]),
      centers: new Map(),
    };
    index.append(part);
    index.append(part);
    expect([...index.candidates(query(0, { maxDistanceMeters: 25 }))]).toEqual([
      east,
    ]);
    expect([
      ...index.candidates(query(180, { maxDistanceMeters: 25 })),
    ]).toEqual([corrected]);
    expect(
      [...index.candidates(query(0), { allDirections: true })].filter(
        (record) => record.id === corrected.id
      )
    ).toEqual([corrected]);
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

describe("physical ECEF catalogue center index", () => {
  const origin: [number, number, number] = [4_000_000, 500_000, 4_950_000];
  const physical = (
    id: string,
    delta: [number, number, number],
    series = "2026",
    sector = North
  ) => ({
    ...image(series, id, sector, sector === East ? 90 : 0),
    catalogCenter: {
      longitude: target.longitude,
      latitude: target.latitude,
      heightMeters: 200 as Meters,
      ecefMeters: origin.map((value, i) => value + delta[i]) as [
        number,
        number,
        number
      ],
    },
  });
  const physicalQuery = (extra: Partial<ObliqueViewQuery> = {}) =>
    query(0, {
      target: { ...target, ecefMeters: origin },
      maxDistanceMeters: 2000,
      ...extra,
    });
  const distance = (record: ObliqueImageRecord) =>
    Math.hypot(
      ...record.catalogCenter!.ecefMeters.map((value, i) => value - origin[i])
    );
  it("uses all three axes and stable cross-series order instead of planar coordinates", () => {
    const high = physical("high", [0, 0, 800], "2024"),
      far = physical("far", [300, 0, 0]),
      near = physical("near", [0, 0, 10]);
    const tie = physical("a-tie", [0, 10, 0], "2024");
    const index = createImageSelectionIndex(catalog([high, far, near, tie]), {
      groundCenters: true,
    });
    expect(
      [...index.candidates(physicalQuery({ maxDistanceMeters: 400 }))].map(
        (x) => x.id
      )
    ).toEqual([tie.id, near.id, far.id]);
    expect([
      ...index.candidates(physicalQuery({ enabledSeriesIds: ["2026"] })),
    ]).toEqual([near, far]);
  });
  it("matches brute-force sphere queries on both years and respects directional limits", () => {
    let seed = 1234;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const records = Array.from({ length: 600 }, (_, i) =>
      physical(
        String(i),
        [
          random() * 8000 - 4000,
          random() * 8000 - 4000,
          random() * 8000 - 4000,
        ],
        i % 2 ? "2024" : "2026",
        i % 3 ? North : East
      )
    );
    const index = createImageSelectionIndex(catalog(records), {
      groundCenters: true,
    });
    for (const radius of [10, 500, 1500, 3000, 100000]) {
      const expected = records
        .filter((r) => r.sector === North && distance(r) <= radius)
        .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
      expect(
        [...index.candidates(physicalQuery({ maxDistanceMeters: radius }))].map(
          (x) => x.id
        )
      ).toEqual(expected.map((x) => x.id));
    }
    const expected = ["2024", "2026"]
      .flatMap((series) =>
        records
          .filter(
            (r) =>
              r.seriesId === series && r.sector === North && distance(r) <= 3000
          )
          .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))
          .slice(0, 3)
      )
      .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
    expect([
      ...index.candidates(physicalQuery({ maxDistanceMeters: 3000 }), {
        limitPerDirection: 3,
      }),
    ]).toEqual(expected);
  });
  it("re-buckets corrected ECEF values even when the legacy planar cell is unchanged", () => {
    const old = physical("moving", [0, 0, 3000]);
    const index = createImageSelectionIndex(catalog([old]));
    expect([...index.candidates(physicalQuery())]).toEqual([]);
    const corrected = physical("moving", [0, 0, 20]);
    index.append(catalog([corrected]));
    expect([...index.candidates(physicalQuery())]).toEqual([corrected]);
    const legacy = { ...corrected, catalogCenter: undefined };
    index.append(catalog([legacy]));
    expect([...index.candidates(physicalQuery())]).toEqual([legacy]);
  });
  it("keeps explicit no-ECEF legacy queries on the old planar path", () => {
    const record = physical("remote-physical", [1e6, 1e6, 1e6]);
    const index = createImageSelectionIndex(catalog([record]));
    expect([...index.candidates(query(0))]).toEqual([record]);
    expect([...index.candidates(physicalQuery())]).toEqual([]);
  });
});

it.skipIf(!process.env.OBLIQUE_CATALOG_VALIDATION_DIR)(
  "matches brute-force 3D nearest on all physical centers of both delivered catalogues",
  () => {
    const records: ObliqueImageRecord[] = [];
    for (const year of [2024, 2026]) {
      const decoded = decodeCompactCatalog(
        new Uint8Array(
          gunzipSync(
            readFileSync(
              `${process.env.OBLIQUE_CATALOG_VALIDATION_DIR}/wuppertal-${year}.obcq.gz`
            )
          )
        )
      );
      for (const [id, photo] of Object.entries(decoded.images)) {
        if (photo.sensorGroundRangeMeters == null) continue;
        const c = decoded.cameras[photo.cameraId],
          [[a, b, cx], [d, e, cy]] = c.imageMmToPixelAffine;
        const px = (c.widthPx - 1) / 2 - cx,
          py = (c.heightPx - 1) / 2 - cy,
          det = a * e - b * d;
        const mmx = (e * px - b * py) / det,
          mmy = (-d * px + a * py) / det;
        const ray = new Vector3(...photo.rotationMatrixRows[0])
          .multiplyScalar(mmx)
          .addScaledVector(new Vector3(...photo.rotationMatrixRows[1]), mmy)
          .addScaledVector(
            new Vector3(...photo.rotationMatrixRows[2]),
            -c.focalLengthMm
          )
          .normalize();
        const center = new Vector3(...photo.cameraEcefMeters).addScaledVector(
          ray,
          photo.sensorGroundRangeMeters
        );
        records.push({
          ...image(String(year), id, North, 0),
          catalogCenter: {
            longitude: 0,
            latitude: 0,
            heightMeters: 0 as Meters,
            ecefMeters: center.toArray() as [number, number, number],
          },
        });
      }
    }
    expect(records).toHaveLength(64149);
    const index = createImageSelectionIndex(catalog(records), {
      groundCenters: true,
    });
    for (let i = 0; i < 12; i++) {
      const point = records[
        Math.floor((i * records.length) / 12)
      ].catalogCenter!.ecefMeters.map((v, k) => v + [13, 29, 51][k]) as [
        number,
        number,
        number
      ];
      const distance = (r: ObliqueImageRecord) =>
        Math.hypot(...r.catalogCenter!.ecefMeters.map((v, k) => v - point[k]));
      const expected = records
        .filter((r) => distance(r) <= 800)
        .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
      const got = [
        ...index.candidates(
          query(0, {
            target: { ...target, ecefMeters: point },
            maxDistanceMeters: 800,
          })
        ),
      ];
      expect(got.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    }
  },
  20000
);
