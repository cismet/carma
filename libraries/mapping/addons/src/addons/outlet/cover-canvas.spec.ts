import type { CoverSource } from "../../lib/spot-cover";
import { coverSourceHoles } from "./cover-canvas";

/** a flat stand-in for the map: 1 px per 0.0001 degree, north up */
const map = {
  project: ([lng, lat]: [number, number]) => ({
    x: (lng - 7.1) / 0.0001,
    y: (51.3 - lat) / 0.0001,
  }),
} as unknown as Parameters<typeof coverSourceHoles>[0];

const view = { width: 1000, height: 800 };

const cabs = (centres: CoverSource["centres"]): CoverSource => ({
  dim: 0.75,
  radiusMeters: 60,
  softness: 0.2,
  centres,
});

describe("coverSourceHoles", () => {
  it("puts each cab where the map shows it, fully open with its soft edge", () => {
    const [hole, ...rest] = coverSourceHoles(
      map,
      [cabs([{ lon: 7.15, lat: 51.26 }])],
      view
    );
    expect(rest).toEqual([]);
    expect(hole?.x).toBeCloseTo(500, 3);
    expect(hole?.y).toBeCloseTo(400, 3);
    expect(hole?.presence).toBe(1);
    expect(hole?.softness).toBe(0.2);
  });

  it("keeps a cab whose soft edge reaches into the window, drops one wholly off it", () => {
    // 60 m are about 8.6 px here, 10.3 px with the soft edge
    const holes = coverSourceHoles(
      map,
      [
        cabs([
          { lon: 7.2005, lat: 51.26 },
          { lon: 7.202, lat: 51.26 },
        ]),
        cabs([{ lon: 7.5, lat: 51.26 }]),
      ],
      view
    );
    expect(holes.map(({ x }) => Math.round(x))).toEqual([1005]);
  });
});
