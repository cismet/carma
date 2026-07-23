import { afterEach, describe, expect, it, vi } from "vitest";

import {
  filterNivControlPointsNearTrack,
  loadNivControlPoints,
  type NivControlPoint,
} from "./niv-control-points";

const point = (
  id: number,
  x: number,
  y: number,
  overrides: Partial<NivControlPoint> = {}
): NivControlPoint => ({
  id,
  x,
  y,
  laufende_nummer: String(id),
  punktnummer_nrw: null,
  lagebezeichnung: "",
  messungsjahr: 2020,
  festlegungsart: 0,
  geometrie: 0,
  lagegenauigkeit: 0,
  bemerkung: null,
  historisch: false,
  hoehe_ueber_nhn2016: 160,
  transformStatus: "transformed",
  ellipsoidalHeight: 206.6,
  ecef: [3_970_000, 499_000, 4_950_000],
  sourceCoordinate: {
    easting: x,
    northing: y,
    normalHeightDhhN2016: 160,
  },
  ...overrides,
});

const artifact = (points: NivControlPoint[]) => ({
  format: "carma-niv-ecef-v1",
  source: { sha256: "a".repeat(64), recordCount: points.length },
  spatialReference: {
    target: "EPSG:4978 (WGS 84 geocentric / ECEF)",
    operation: {
      pipeline:
        "+proj=pipeline +step +proj=vgridshift +grids=de_bkg_gcg2016.tif",
      grid: {
        name: "de_bkg_gcg2016.tif",
        sha256: "b".repeat(64),
      },
    },
  },
  validation: { transformedCount: points.length, rejectedCount: 0 },
  points,
});

afterEach(() => vi.unstubAllGlobals());

describe("NIV control-point track filter", () => {
  it("keeps valid current points in the track corridor", () => {
    const filtered = filterNivControlPointsNearTrack(
      [point(1, 5, 3), point(2, 5, 30)],
      [
        [0, 0],
        [10, 0],
      ],
      10
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].point.id).toBe(1);
    expect(filtered[0].distanceToTrackMeters).toBeCloseTo(5.831, 3);
  });

  it("rejects historical and heightless points as controls", () => {
    const filtered = filterNivControlPointsNearTrack(
      [
        point(1, 0, 0, { historisch: true }),
        point(2, 0, 0, { hoehe_ueber_nhn2016: 0 }),
      ],
      [[0, 0]],
      10
    );
    expect(filtered).toEqual([]);
  });
});

describe("NIV ECEF artifact loader", () => {
  it("accepts a complete offline artifact with spatial provenance", async () => {
    const expected = point(1, 369_824, 5_678_815);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(artifact([expected])), { status: 200 })
        )
    );

    await expect(loadNivControlPoints()).resolves.toEqual([expected]);
  });

  it("fails closed when the recorded point counts do not match", async () => {
    const invalid = artifact([point(1, 369_824, 5_678_815)]);
    invalid.validation.transformedCount = 2;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(invalid), { status: 200 })
        )
    );

    await expect(loadNivControlPoints()).rejects.toThrow(
      "Vollständigkeitsprüfung"
    );
  });
});
