import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Cartesian2, Cartesian3 } from "@carma-cesium";

import {
  cartesian2FromScreenPosition,
  screenPositionFromCartesian2,
  vector3FromOptionalCartesian3,
} from "./cesium-vector-conversions";

describe("cesium vector conversions", () => {
  it("converts a screen position both ways", () => {
    const cartesian = cartesian2FromScreenPosition({ x: 3, y: 4 });
    expect(Cartesian2.equals(cartesian, new Cartesian2(3, 4))).toBe(true);
    expect(screenPositionFromCartesian2(cartesian)).toEqual({ x: 3, y: 4 });
  });

  it("passes a missing Cartesian3 on as null", () => {
    expect(vector3FromOptionalCartesian3(undefined)).toBeNull();
    expect(vector3FromOptionalCartesian3(null)).toBeNull();
    expect(vector3FromOptionalCartesian3(new Cartesian3(1, 2, 3))).toEqual(
      new Vector3(1, 2, 3)
    );
  });
});
