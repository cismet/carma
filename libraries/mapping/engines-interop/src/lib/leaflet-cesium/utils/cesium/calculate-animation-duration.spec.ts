import { calculateAnimationDuration } from "./calculate-animation-duration";
import type { Camera } from "@carma/cesium";

// Mock camera with deviation angle
const createMockCamera = (deviationAngleRadians: number): Camera => {
  // Calculate direction vector based on deviation angle from top-down
  // Top-down is (0, 0, -1), deviation rotates in the pitch plane
  const directionZ = -Math.cos(deviationAngleRadians);
  const directionY = -Math.sin(deviationAngleRadians);

  return {
    heading: 0,
    pitch: -Math.PI / 2 + deviationAngleRadians,
    direction: { x: 0, y: directionY, z: directionZ },
  } as Camera;
};

describe("calculateAnimationDuration", () => {
  describe("angle-based duration", () => {
    it("should calculate duration for 45° deviation (π/4 rad)", () => {
      const camera = createMockCamera(Math.PI / 4);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // π/4 ≈ 0.785 rad * 2000 ms/rad ≈ 1570 ms
      expect(duration).toBeCloseTo(1570, 0);
    });

    it("should calculate duration for 90° deviation (π/2 rad)", () => {
      const camera = createMockCamera(Math.PI / 2);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // π/2 ≈ 1.57 rad * 2000 ms/rad ≈ 3140 ms (capped at 3000)
      expect(duration).toBe(3000);
    });

    it("should calculate duration for 30° deviation (π/6 rad)", () => {
      const camera = createMockCamera(Math.PI / 6);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // π/6 ≈ 0.524 rad * 2000 ms/rad ≈ 1047 ms
      expect(duration).toBeCloseTo(1047, 0);
    });

    it("should calculate duration for nadir (0° deviation)", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // 0 rad * 2000 ms/rad = 0 ms
      expect(duration).toBe(0);
    });
  });

  describe("zoom-based duration", () => {
    it("should calculate duration for 1 zoom level difference", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 1;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // 1 * 1000 ms = 1000 ms
      expect(duration).toBe(1000);
    });

    it("should calculate duration for 2 zoom levels difference", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 2;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // 2 * 1000 ms = 2000 ms
      expect(duration).toBe(2000);
    });

    it("should handle negative zoom diff (zooming out)", () => {
      const camera = createMockCamera(0);
      const zoomDiff = -1.5;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // abs(-1.5) * 1000 ms = 1500 ms
      expect(duration).toBe(1500);
    });
  });

  describe("maximum of angle and zoom", () => {
    it("should use angle duration when angle > zoom", () => {
      const camera = createMockCamera(Math.PI / 4); // ~1570ms
      const zoomDiff = 0.5; // 500ms
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // max(1570, 500) = 1570
      expect(duration).toBeCloseTo(1570, 0);
    });

    it("should use zoom duration when zoom > angle", () => {
      const camera = createMockCamera(Math.PI / 6); // ~1047ms
      const zoomDiff = 2; // 2000ms
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // max(1047, 2000) = 2000
      expect(duration).toBe(2000);
    });

    it("should cap at maxDurationMs", () => {
      const camera = createMockCamera(Math.PI / 2); // would be ~3140ms
      const zoomDiff = 5; // would be 5000ms
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // max(3140, 5000) = 5000, but capped at 3000
      expect(duration).toBe(3000);
    });
  });

  describe("custom weights", () => {
    it("should use custom angle weight", () => {
      const camera = createMockCamera(Math.PI / 4);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff, {
        angleWeightMs: 3000,
      });

      // π/4 * 3000 ms/rad ≈ 2356 ms
      expect(duration).toBeCloseTo(2356, 0);
    });

    it("should use custom zoom weight", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 2;
      const duration = calculateAnimationDuration(camera, zoomDiff, {
        zoomDiffWeightMs: 1500,
      });

      // 2 * 1500 ms = 3000 ms
      expect(duration).toBe(3000);
    });

    it("should use custom max duration", () => {
      const camera = createMockCamera(Math.PI / 2);
      const zoomDiff = 10;
      const duration = calculateAnimationDuration(camera, zoomDiff, {
        maxDurationMs: 5000,
      });

      // Would be 10000ms, but capped at 5000
      expect(duration).toBe(5000);
    });
  });

  describe("realistic scenarios", () => {
    it("oblique to top-down (60° → 0°)", () => {
      const camera = createMockCamera(Math.PI / 3); // 60° = π/3
      const zoomDiff = 0.5;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // π/3 ≈ 1.047 rad * 2000 = 2094ms vs 500ms → max = 2094ms
      expect(duration).toBeCloseTo(2094, 0);
    });

    it("top-down with zoom snap (0° + 2 zoom levels)", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 2;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // 0ms vs 2000ms → max = 2000ms
      expect(duration).toBe(2000);
    });

    it("moderate angle + moderate zoom", () => {
      const camera = createMockCamera(Math.PI / 6); // 30°
      const zoomDiff = 1.5;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // π/6 * 2000 ≈ 1047ms vs 1500ms → max = 1500ms
      expect(duration).toBe(1500);
    });
  });

  describe("visual output table", () => {
    it("should output duration table for all zoom/angle combinations", () => {
      // Generate table: rows = angles in 5° intervals (0-180°), columns = zoom levels (0-9)
      const zoomLevels = Array.from({ length: 10 }, (_, i) => i);
      const angles = Array.from({ length: 37 }, (_, i) => i * 5); // 0°, 5°, 10°, ..., 180°

      console.log("\n=== Animation Duration Table (ms) ===");
      console.log("Ang|", ...zoomLevels.map((z) => z.toString().padStart(4)));
      console.log("───┼" + "────".repeat(10));

      for (const angle of angles) {
        const durations = zoomLevels.map((zoom) => {
          const camera = createMockCamera((angle * Math.PI) / 180); // Convert to radians
          const duration = calculateAnimationDuration(camera, zoom);
          return duration.toFixed(0).padStart(4);
        });
        console.log(`${angle.toString().padStart(3)}|`, ...durations);
      }

      console.log("\n");

      // This test always passes - it's just for visual inspection
      expect(true).toBe(true);
    });
  });
});
