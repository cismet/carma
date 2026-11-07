import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import {
  getRotationAxisDash,
  getRotationAxisDashCount,
  ROTATION_AXIS_DASHES,
} from "./engine-point-move-gizmo-rotation-axis";

const PITCH_PX = ROTATION_AXIS_DASHES.dashPx + ROTATION_AXIS_DASHES.gapPx;

describe("getRotationAxisDashCount", () => {
  it("fills the axis at the pixel pitch of dash and gap", () => {
    // 100 m away at 2 px per metre: the axis spans 2 × 2 × 200 px
    expect(getRotationAxisDashCount(100, 2)).toBe(Math.floor(800 / PITCH_PX));
  });

  it("keeps the count while the camera dollies", () => {
    expect(getRotationAxisDashCount(50, 4)).toBe(
      getRotationAxisDashCount(100, 2)
    );
  });

  it("falls back without a view scale and caps long axes", () => {
    expect(getRotationAxisDashCount(null, 2)).toBe(
      ROTATION_AXIS_DASHES.fallbackCount
    );
    expect(getRotationAxisDashCount(100, 0)).toBe(
      ROTATION_AXIS_DASHES.fallbackCount
    );
    expect(getRotationAxisDashCount(1e6, 10)).toBe(
      ROTATION_AXIS_DASHES.maxCount
    );
  });
});

describe("getRotationAxisDash", () => {
  const origin = new Vector3(10, 20, 30);
  const up = new Vector3(0, 0, 1);

  it("spreads the dashes over both sides of the point", () => {
    const count = 4;
    const halfLength = 100 * ROTATION_AXIS_DASHES.lengthMultiplier;
    const [firstStart] = getRotationAxisDash(origin, up, 100, count, 0);
    const [, lastEnd] = getRotationAxisDash(origin, up, 100, count, count - 1);
    expect(firstStart.z - origin.z).toBeCloseTo(-halfLength, 9);
    // the last gap ends the axis
    const period = (2 * halfLength) / count;
    expect(lastEnd.z - origin.z).toBeCloseTo(
      halfLength - (period * ROTATION_AXIS_DASHES.gapPx) / PITCH_PX,
      9
    );
  });

  it("keeps dash and gap in their pixel ratio", () => {
    const [start, end] = getRotationAxisDash(origin, up, 100, 8, 3);
    const [nextStart] = getRotationAxisDash(origin, up, 100, 8, 4);
    expect(end.distanceTo(start) / nextStart.distanceTo(start)).toBeCloseTo(
      ROTATION_AXIS_DASHES.dashPx / PITCH_PX,
      9
    );
    expect(end.x).toBe(origin.x);
    expect(end.y).toBe(origin.y);
  });
});
