import {
  DEFAULT_HIGHLIGHT_DIM,
  HIGHLIGHT_RADIUS_RANGE_METERS,
  lngLatToMercator,
} from "./highlights";
import {
  extentOfGeometry,
  geoportalViewDocument,
  geoportalViewOf,
  spotAround,
  type GeoportalSelection,
} from "./geoportal-view";
import { resolveTargets } from "./relay-document";

// the middle of the zoo model, `SHADOW_TEXTURE_LOCATION`
const ZOO_LNG_LAT: readonly [number, number] = [7.112016, 51.245446];
const ZOO = lngLatToMercator(ZOO_LNG_LAT);
const [MIN_RADIUS, MAX_RADIUS] = HIGHLIGHT_RADIUS_RANGE_METERS;

const selection = (id = "kita-12"): GeoportalSelection => ({
  spot: { id, center: ZOO, radiusMeters: 40, dim: DEFAULT_HIGHLIGHT_DIM },
  feature: {
    layerId: "kitas",
    featureId: 12,
    properties: { title: "Kita Zoo", subtitle: "Hubertusallee 1" },
  },
});

describe("extentOfGeometry", () => {
  it("is a point's own position, with no size", () => {
    const [x, y] = ZOO;
    expect(
      extentOfGeometry({ type: "Point", coordinates: [...ZOO_LNG_LAT] })
    ).toEqual([x, y, x, y]);
  });

  it("spans every ring of a multi polygon and every part of a collection", () => {
    const extent = extentOfGeometry({
      type: "GeometryCollection",
      geometries: [
        {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [7.1, 51.2],
                [7.2, 51.2],
                [7.2, 51.3],
                [7.1, 51.2],
              ],
            ],
          ],
        },
        {
          type: "LineString",
          coordinates: [
            [7.0, 51.25, 140],
            [7.15, 51.4],
          ],
        },
      ],
    });
    const [minX, minY] = lngLatToMercator([7.0, 51.2]);
    const [maxX, maxY] = lngLatToMercator([7.2, 51.4]);
    expect(extent).toEqual([minX, minY, maxX, maxY]);
  });

  it("has none for missing, empty or projected coordinates", () => {
    expect(extentOfGeometry(undefined)).toBeNull();
    expect(extentOfGeometry({ type: "Point" })).toBeNull();
    expect(
      extentOfGeometry({ type: "LineString", coordinates: [] })
    ).toBeNull();
    // EPSG:25832 metres, which a WMS info may carry; not longitude and latitude
    expect(
      extentOfGeometry({ type: "Point", coordinates: [374000, 5681000] })
    ).toBeNull();
  });
});

describe("spotAround", () => {
  it("sits on the middle of the extent", () => {
    const [x, y] = ZOO;
    const spot = spotAround([x - 100, y - 50, x + 100, y + 50], "a");
    expect(spot.id).toBe("a");
    expect(spot.center[0]).toBeCloseTo(x);
    expect(spot.center[1]).toBeCloseTo(y);
    expect(spot.dim).toBe(DEFAULT_HIGHLIGHT_DIM);
  });

  it("reaches half the diagonal on the ground", () => {
    const [x, y] = ZOO;
    // 300 by 400 map units, a diagonal of 500; Web Mercator stretches by 1 / cos(lat)
    const spot = spotAround([x - 150, y - 200, x + 150, y + 200], "a");
    const cosLat = Math.cos((ZOO_LNG_LAT[1] * Math.PI) / 180);
    expect(spot.radiusMeters).toBeCloseTo(250 * cosLat, 0);
  });

  it("keeps a point and a whole district within the spot sizes", () => {
    const [x, y] = ZOO;
    expect(spotAround([x, y, x, y], "a").radiusMeters).toBe(MIN_RADIUS);
    expect(
      spotAround([x - 5000, y - 5000, x + 5000, y + 5000], "a").radiusMeters
    ).toBe(MAX_RADIUS);
  });
});

describe("geoportalViewDocument", () => {
  it("puts the view under the shared section, so every screen reads it", () => {
    const frame = [1, 2, 3, 4] as const;
    expect(geoportalViewDocument({ frame, selection: null })).toEqual({
      "*": { frame, selection: null },
    });
  });
});

describe("geoportalViewOf", () => {
  const read = (view: Parameters<typeof geoportalViewDocument>[0]) =>
    geoportalViewOf(resolveTargets(geoportalViewDocument(view), ["outlet"]));

  it("reads back what the geoportal wrote", () => {
    const frame = [788836, 6663227, 794575, 6666423] as const;
    expect(read({ frame, selection: selection() })).toEqual({
      frame,
      selection: selection(),
    });
  });

  it("reads a switched off frame and selection as none", () => {
    expect(read({ frame: null, selection: null })).toEqual({
      frame: null,
      selection: null,
    });
    expect(geoportalViewOf(null)).toEqual({ frame: null, selection: null });
  });

  it("drops a broken part and keeps the other", () => {
    const frame = [788836, 6663227, 794575, 6666423] as const;
    expect(
      geoportalViewOf({ frame, selection: { spot: { id: "a" }, feature: {} } })
    ).toEqual({ frame, selection: null });
    expect(
      geoportalViewOf({ frame: [3, 2, 1], selection: selection() })
    ).toEqual({ frame: null, selection: selection() });
  });

  it("takes a selection without a feature reference by its spot alone", () => {
    const { spot } = selection();
    expect(geoportalViewOf({ selection: { spot } }).selection).toEqual({
      spot,
      feature: { properties: {} },
    });
  });
});
