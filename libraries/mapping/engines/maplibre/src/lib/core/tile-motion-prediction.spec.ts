import { describe, it, expect } from "vitest";
import { PerspectiveCamera } from "three";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "./tile-camera-demand";
import { createTileMotionPrediction } from "./tile-motion-prediction";

const pose = (x: number, fov = 60) => {
  const camera = new PerspectiveCamera(fov, 1, 1, 1000);
  camera.position.x = x;
  return snapshotTileCameraViews([
    {
      id: "pan",
      camera,
      viewport: [1000, 1000],
      errorTargetPixels: 4,
      role: TILE_CAMERA_ROLE.RECEIVER,
    },
  ])[0];
};
describe("bounded pan prediction", () => {
  it("waits for stable direction and speed, then uses bounded measured latency", () => {
    const predictor = createTileMotionPrediction();
    predictor.observeLatency(3000);
    for (let i = 0; i < 5; i++)
      expect(
        predictor.update(pose(i * 10), i * 100, true, false, 100)
      ).toBeNull();
    const future = predictor.update(pose(50), 500, true, false, 100)!;
    expect(future).not.toBeNull();
    expect(future.matrixWorld[12]).toBeCloseTo(100);
    expect(predictor.getStats().latencyMs).toBe(1500);
    expect(predictor.getStats().leadMs).toBeLessThanOrEqual(550);
  });
  it("disarms on reversal, zoom, stop, lens change and teleport", () => {
    for (const change of ["reverse", "zoom", "stop", "lens", "jump"] as const) {
      const p = createTileMotionPrediction();
      for (let i = 0; i < 10; i++)
        p.update(pose(i * 5), i * 100, true, false, 100);
      expect(p.getStats().leadMs).toBeGreaterThan(0);
      expect(
        p.update(
          pose(
            change === "reverse" ? 40 : change === "jump" ? 1000 : 50,
            change === "lens" ? 90 : 60
          ),
          1000,
          change !== "stop",
          change === "zoom",
          100
        )
      ).toBeNull();
    }
  });
  it("does not arm on oscillation or strongly varying speed", () => {
    const p = createTileMotionPrediction();
    for (let i = 0; i < 20; i++)
      expect(
        p.update(pose(i % 2 ? 10 : 0), i * 100, true, false, 100)
      ).toBeNull();
    expect(p.getStats().leadMs).toBe(0);
  });
});
