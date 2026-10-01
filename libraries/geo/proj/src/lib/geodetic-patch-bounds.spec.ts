import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { createLocalEcefFrame } from "./local-ecef-frame";
import { createRasterEcefProjector } from "./raster-ecef-projector";
import { getGeodeticPatchBounds } from "./geodetic-patch-bounds";

describe("geodetic patch bounds", () => {
  it.each([
    { west: 6, south: 50, east: 8, north: 52 },
    { west: -180, south: -85, east: 180, north: 85 },
    { west: 170, south: 70, east: 180, north: 90 },
  ])(
    "contains curved interior extrema and both heights in $west/$south/$east/$north",
    (bounds) => {
      const frame = createLocalEcefFrame(7.2, 51.25).localFromEcef;
      frame.premultiply(new Matrix4().makeRotationZ(0.3));
      const box = getGeodeticPatchBounds(
        bounds,
        [-100, 1500],
        frame
      ).expandByScalar(1e-7);
      const project = createRasterEcefProjector();
      const point = new Vector3();
      for (let y = 0; y <= 80; y++)
        for (let x = 0; x <= 80; x++)
          for (const height of [-100, 1500]) {
            project(
              bounds.west + (x / 80) * (bounds.east - bounds.west),
              bounds.south + (y / 80) * (bounds.north - bounds.south),
              height,
              point
            ).applyMatrix4(frame);
            expect(box.containsPoint(point)).toBe(true);
          }
    }
  );
  it("requires explicit splitting at the antimeridian", () => {
    expect(() =>
      getGeodeticPatchBounds(
        { west: 170, east: -170, south: 0, north: 1 },
        [0, 1]
      )
    ).toThrow(RangeError);
  });
});
