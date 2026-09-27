import type { CustomRenderMethodInput, Map as LibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import {
  coverSourcesOf,
  setCoverTakeover,
} from "../../lib/spot-cover";
import { buildTrack, carStrips, CAR_SHAPE_GTW15, type Track } from "./track";
import {
  carCentre,
  createSpotlightLayer,
  MAX_SPOTS,
  projectToBuffer,
  resolveSpotlight,
  spotCapacity,
  spotCentres,
  spotInBuffer,
  spotTouchesBuffer,
  VEHICLE_SPOTLIGHT_DEFAULT,
} from "./vehicle-spotlight";

const LAT = 51.25;

/** about 1.4 km due east, so a vehicle's length is all longitude */
const straightTrack = (): Track => {
  const track = buildTrack({
    type: "LineString",
    coordinates: [
      [7.0, LAT],
      [7.02, LAT],
    ],
  });
  if (!track) throw new Error("no track");
  return track;
};

/** a closed square of about 700 m a side */
const ringTrack = (): Track => {
  const track = buildTrack({
    type: "LineString",
    coordinates: [
      [7.0, LAT],
      [7.01, LAT],
      [7.01, LAT + 0.006],
      [7.0, LAT + 0.006],
      [7.0, LAT],
    ],
  });
  if (!track) throw new Error("no track");
  return track;
};

/** MapLibre's sphere, independent of `MercatorCoordinate` */
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
const meterInMercatorUnits = (lat: number): number =>
  1 / (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180));
const mercatorX = (lon: number): number => (lon + 180) / 360;
const mercatorY = (lat: number): number =>
  (180 -
    (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
  360;

/**
 * A top-down view as a column-major matrix: mercator (cx, cy) at the centre
 * of the clip square, `scale` clip units per mercator unit, north up.
 */
// prettier-ignore
const topDown = (cx: number, cy: number, scale: number): number[] => [
  scale, 0, 0, 0,
  0, -scale, 0, 0,
  0, 0, 1, 0,
  -cx * scale, cy * scale, 0, 1,
];

describe("resolveSpotlight", () => {
  it("is off without a definition", () => {
    expect(resolveSpotlight(undefined)).toBeNull();
    expect(resolveSpotlight(null)).toBeNull();
  });

  it("fills in the pointer's look for an empty definition", () => {
    expect(resolveSpotlight({})).toEqual(VEHICLE_SPOTLIGHT_DEFAULT);
    expect(VEHICLE_SPOTLIGHT_DEFAULT).toEqual({
      radiusMeters: 60,
      dim: 0.75,
      softness: 0.2,
    });
  });

  it("pulls hand-written values back into range", () => {
    expect(
      resolveSpotlight({ radiusMeters: -5, dim: 1.5, softness: 3 })
    ).toEqual({ radiusMeters: 0, dim: 1, softness: 0.95 });
    expect(
      resolveSpotlight({ radiusMeters: Number.NaN, dim: -1, softness: -1 })
    ).toEqual({ radiusMeters: 60, dim: 0, softness: 0 });
  });
});

describe("carCentre", () => {
  it("is the middle of the body carStrips lays out", () => {
    const track = straightTrack();
    const distance = 500;
    const lons = carStrips(track, distance, CAR_SHAPE_GTW15).flatMap(
      ({ left, right }) => [...left, ...right].map(([lon]) => lon)
    );
    const middle = (Math.min(...lons) + Math.max(...lons)) / 2;
    const centre = carCentre(track, distance);
    // a millimetre is about 1.4e-8 degrees of longitude here
    expect(centre.lon).toBeCloseTo(middle, 7);
    expect(centre.lat).toBeCloseTo(LAT, 9);
  });

  it("folds a distance past the end back onto a closed track", () => {
    const ring = ringTrack();
    expect(ring.closed).toBe(true);
    const wrapped = carCentre(ring, ring.length + 120);
    const plain = carCentre(ring, 120);
    expect(wrapped.lon).toBeCloseTo(plain.lon, 9);
    expect(wrapped.lat).toBeCloseTo(plain.lat, 9);
  });
});

describe("spotCentres", () => {
  it("lights only the vehicles on the track, at the height asked for", () => {
    const track = straightTrack();
    const spots = spotCentres(
      track,
      [
        { distance: 100, visible: true },
        { distance: 400, visible: false },
        { distance: 700, visible: true },
      ],
      (distance) => distance / 100
    );
    expect(spots).toHaveLength(2);
    expect(spots[0].lon).toBeCloseTo(carCentre(track, 100).lon, 12);
    expect(spots[1].lon).toBeCloseTo(carCentre(track, 700).lon, 12);
    expect(spots.map((spot) => spot.altitude)).toEqual([1, 7]);
  });

  it("puts the spots on the ground without a height", () => {
    const spots = spotCentres(straightTrack(), [
      { distance: 100, visible: true },
    ]);
    expect(spots[0].altitude).toBe(0);
  });

  it("has nothing to light when no vehicle is on the track", () => {
    expect(
      spotCentres(straightTrack(), [{ distance: 100, visible: false }])
    ).toEqual([]);
  });

  it("stops at the limit", () => {
    const cars = Array.from({ length: MAX_SPOTS + 10 }, (_, index) => ({
      distance: index * 10,
      visible: true,
    }));
    expect(spotCentres(straightTrack(), cars)).toHaveLength(MAX_SPOTS);
    expect(spotCentres(straightTrack(), cars, undefined, 3)).toHaveLength(3);
  });
});

describe("projectToBuffer", () => {
  it("maps clip space onto the buffer with the origin bottom left", () => {
    const matrix = topDown(0.5, 0.5, 2);
    // the centre of the view
    expect(projectToBuffer(matrix, 0.5, 0.5, 0, 800, 600)).toEqual([400, 300]);
    // north (smaller mercator y) is up, which is a larger gl_FragCoord.y:
    // half a view north of the centre is the buffer's top row
    const north = projectToBuffer(matrix, 0.5, 0, 0, 800, 600);
    expect(north?.[1]).toBeCloseTo(600, 9);
    const quarter = projectToBuffer(matrix, 0.5, 0.25, 0, 800, 600);
    expect(quarter?.[1]).toBeCloseTo(450, 9);
  });

  it("drops a point behind the camera", () => {
    const behind = topDown(0.5, 0.5, 2);
    behind[15] = -1;
    expect(projectToBuffer(behind, 0.5, 0.5, 0, 800, 600)).toBeNull();
  });
});

describe("spotInBuffer", () => {
  const lon = 7.01;
  const width = 800;
  const height = 600;
  /** about 100 px for 60 m at this latitude */
  const scale = 105000;
  const matrix = topDown(mercatorX(lon), mercatorY(LAT), scale);

  it("centres the spot on its vehicle", () => {
    const spot = spotInBuffer(
      matrix,
      { lon, lat: LAT, altitude: 0 },
      60,
      width,
      height
    );
    expect(spot?.x).toBeCloseTo(width / 2, 6);
    expect(spot?.y).toBeCloseTo(height / 2, 6);
  });

  it("measures the radius in buffer pixels at the spot's latitude", () => {
    const spot = spotInBuffer(
      matrix,
      { lon, lat: LAT, altitude: 0 },
      60,
      width,
      height
    );
    const expected = 60 * meterInMercatorUnits(LAT) * scale * (width / 2);
    expect(expected).toBeGreaterThan(90);
    expect(expected).toBeLessThan(110);
    expect(spot?.radius).toBeCloseTo(expected, 6);
  });

  it("grows with the zoom", () => {
    const zoomedIn = topDown(mercatorX(lon), mercatorY(LAT), scale * 2);
    const near = spotInBuffer(
      zoomedIn,
      { lon, lat: LAT, altitude: 0 },
      60,
      width,
      height
    );
    const far = spotInBuffer(
      matrix,
      { lon, lat: LAT, altitude: 0 },
      60,
      width,
      height
    );
    expect(near?.radius).toBeCloseTo(2 * (far?.radius ?? 0), 6);
  });
});

describe("spotTouchesBuffer", () => {
  it("keeps a spot whose soft edge reaches into the buffer", () => {
    // radius 100, softness 0.2: the edge reaches 120 px out
    expect(
      spotTouchesBuffer({ x: -110, y: 300, radius: 100 }, 0.2, 800, 600)
    ).toBe(true);
    expect(
      spotTouchesBuffer({ x: 400, y: 715, radius: 100 }, 0.2, 800, 600)
    ).toBe(true);
  });

  it("drops a spot that lies wholly outside", () => {
    expect(
      spotTouchesBuffer({ x: -130, y: 300, radius: 100 }, 0.2, 800, 600)
    ).toBe(false);
    expect(
      spotTouchesBuffer({ x: 400, y: 730, radius: 100 }, 0.2, 800, 600)
    ).toBe(false);
  });
});

describe("spotCapacity", () => {
  it("takes every vehicle where the context has room", () => {
    expect(spotCapacity(1024)).toBe(MAX_SPOTS);
    expect(spotCapacity(224)).toBe(MAX_SPOTS);
  });

  it("shrinks to what a small context holds, never below one", () => {
    expect(spotCapacity(16)).toBe(12);
    expect(spotCapacity(2)).toBe(1);
  });
});

/**
 * A WebGL context that accepts every call: uniform locations are their
 * names, and the dim each draw was made with is written down.
 */
const fakeGl = () => {
  const dims: number[] = [];
  const gl = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "getParameter") return () => 256;
        if (key === "getUniformLocation")
          return (_program: unknown, name: string) => name;
        if (key === "uniform1f")
          return (location: unknown, value: number) => {
            if (location === "uDim") dims.push(value);
          };
        if (key === "drawingBufferWidth" || key === "drawingBufferHeight")
          return 100;
        return () => ({});
      },
    }
  ) as WebGL2RenderingContext;
  return { gl, dims };
};

// prettier-ignore
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const renderArgs = {
  defaultProjectionData: { mainMatrix: IDENTITY },
} as unknown as CustomRenderMethodInput;

describe("createSpotlightLayer and the map's cover", () => {
  const spotlight = { radiusMeters: 60, dim: 0.8, softness: 0.2 };
  const cab = { lon: 7.15, lat: 51.25, altitude: 0 };

  const added = () => {
    const map = {} as LibreMap;
    const { gl, dims } = fakeGl();
    const spot = createSpotlightLayer({ id: "s", spotlight });
    spot.layer.onAdd?.(map, gl);
    return { map, gl, dims, spot };
  };

  it("tells the cover where its spots are once it is on a map", () => {
    const { map, spot } = added();
    spot.setSpots([cab]);
    expect(coverSourcesOf(map)).toEqual([
      { dim: 0.8, radiusMeters: 60, softness: 0.2, centres: [cab] },
    ]);
  });

  it("fades the published dim with the fleet", () => {
    const { map, spot } = added();
    spot.setSpots([cab]);
    spot.setOpacity(0.5);
    expect(coverSourcesOf(map)[0]?.dim).toBeCloseTo(0.4);
  });

  it("takes its spots back when hidden, faded out, removed or disposed", () => {
    const { map, spot } = added();
    spot.setSpots([cab]);
    spot.setVisible(false);
    expect(coverSourcesOf(map)).toEqual([]);
    spot.setVisible(true);
    expect(coverSourcesOf(map)).toHaveLength(1);
    spot.setOpacity(0);
    expect(coverSourcesOf(map)).toEqual([]);
    spot.setOpacity(1);
    spot.layer.onRemove?.(map, {} as WebGL2RenderingContext);
    expect(coverSourcesOf(map)).toEqual([]);

    const again = added();
    again.spot.setSpots([cab]);
    again.spot.dispose();
    expect(coverSourcesOf(again.map)).toEqual([]);
  });

  it("steps back as far as the cover has taken over", () => {
    const { map, gl, dims, spot } = added();
    spot.setSpots([cab]);
    const render = spot.layer.render as (
      gl: WebGL2RenderingContext,
      args: CustomRenderMethodInput
    ) => void;
    render(gl, renderArgs);
    setCoverTakeover(map, 0.25);
    render(gl, renderArgs);
    setCoverTakeover(map, 1);
    render(gl, renderArgs);
    expect(dims).toHaveLength(2);
    expect(dims[0]).toBeCloseTo(0.8);
    expect(dims[1]).toBeCloseTo(0.6);
  });
});
