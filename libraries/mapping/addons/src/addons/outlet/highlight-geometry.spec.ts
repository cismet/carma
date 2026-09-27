import { lngLatToMercator } from "@carma-mapping/show-remote";

import { projectHighlight } from "./highlight-geometry";

/** a flat stand-in for the map: 1 px per 0.0001 degree, north up */
const map = {
  project: ([lng, lat]: [number, number]) => ({
    x: lng / 0.0001,
    y: -lat / 0.0001,
  }),
} as unknown as Parameters<typeof projectHighlight>[0];

describe("projectHighlight", () => {
  it("puts the spot where its middle is and measures the radius on the ground", () => {
    const center = lngLatToMercator([7.112, 51.245]);
    const drawn = projectHighlight(map, { center, radiusMeters: 100 });
    expect(drawn.x).toBeCloseTo(71120, 3);
    expect(drawn.y).toBeCloseTo(-512450, 3);
    // 100 m east at 51.245° are about 0.001435 degrees of longitude
    expect(drawn.radius).toBeCloseTo(
      100 / (111_320 * Math.cos((51.245 * Math.PI) / 180)) / 0.0001,
      0
    );
  });
});
