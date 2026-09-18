import { describe, expect, it } from "vitest";
import { meshOverlapEye, meshOverlapFlight } from "./mesh-overlap-flight";

describe("shared-pool overlap flight", () => {
  it("keeps vertical clearance at 20 m throughout the pitched orbit", () => {
    for (let t = 0; t < 32; t += 0.1) {
      const { pitch, bearing } = meshOverlapFlight(t);
      const eye = meshOverlapEye(pitch, bearing);
      expect(eye.distance * Math.cos((pitch * Math.PI) / 180)).toBeCloseTo(
        20,
        10
      );
      expect(Math.hypot(eye.east, eye.north, eye.up)).toBeCloseTo(
        eye.distance,
        10
      );
    }
  });
  it("converges into the same top-down target with at least one zoom separation", () => {
    for (let t = 0; t < 32; t += 0.1) {
      const pose = meshOverlapFlight(t);
      expect(pose.mainZoom - pose.secondaryZoom).toBeGreaterThanOrEqual(1);
      if (pose.overlap === 1) {
        expect(pose.pitch).toBe(0);
        expect(pose.mainOffset.every((value) => value === 0)).toBe(true);
        expect(pose.secondaryOffset.every((value) => value === 0)).toBe(true);
      }
    }
    expect(meshOverlapFlight(16).overlap).toBe(1);
  });
  it("loops without a position or zoom discontinuity", () => {
    expect(meshOverlapFlight(0)).toEqual(meshOverlapFlight(32));
    expect(meshOverlapFlight(1)).toEqual(meshOverlapFlight(65));
  });
});
