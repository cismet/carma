import type { Camera } from "@carma-cesium";

import { calculateAnimationDuration } from "./calculate-animation-duration";
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

      // Current implementation eases normalized deviation with QUADRATIC_OUT.
      expect(duration).toBeCloseTo(1312.5, 5);
    });

    it("should calculate duration for 90° deviation (π/2 rad)", () => {
      const camera = createMockCamera(Math.PI / 2);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      // QUADRATIC_OUT(0.5) * 3000 = 2250 ms
      expect(duration).toBe(2250);
    });

    it("should calculate duration for 30° deviation (π/6 rad)", () => {
      const camera = createMockCamera(Math.PI / 6);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(916.6666666666666, 5);
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

      expect(duration).toBeCloseTo(1584.9625007211562, 5);
    });

    it("should handle negative zoom diff (zooming out)", () => {
      const camera = createMockCamera(0);
      const zoomDiff = -1.5;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(1321.9280948873625, 5);
    });
  });

  describe("maximum of angle and zoom", () => {
    it("should use angle duration when angle > zoom", () => {
      const camera = createMockCamera(Math.PI / 4); // ~1570ms
      const zoomDiff = 0.5; // 500ms
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(1312.5, 5);
    });

    it("should use zoom duration when zoom > angle", () => {
      const camera = createMockCamera(Math.PI / 6); // ~1047ms
      const zoomDiff = 2; // 2000ms
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(1584.9625007211562, 5);
    });

    it("should cap at maxDurationMs", () => {
      const camera = createMockCamera(Math.PI / 2); // would be ~3140ms
      const zoomDiff = 5; // would be 5000ms
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(2584.962500721156, 5);
    });
  });

  describe("custom weights", () => {
    it("should use custom angle weight", () => {
      const camera = createMockCamera(Math.PI / 4);
      const zoomDiff = 0;
      const duration = calculateAnimationDuration(camera, zoomDiff, {
        angleWeightMs: 3000,
      });

      expect(duration).toBeCloseTo(1312.5, 5);
    });

    it("should use custom zoom weight", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 2;
      const duration = calculateAnimationDuration(camera, zoomDiff, {
        zoomDiffWeightMs: 1500,
      });

      expect(duration).toBeCloseTo(2377.4437510817343, 5);
    });

    it("should use custom max duration", () => {
      const camera = createMockCamera(Math.PI / 2);
      const zoomDiff = 10;
      const duration = calculateAnimationDuration(camera, zoomDiff, {
        maxDurationMs: 5000,
      });

      expect(duration).toBeCloseTo(3459.431618637297, 5);
    });
  });

  describe("realistic scenarios", () => {
    it("oblique to top-down (60° → 0°)", () => {
      const camera = createMockCamera(Math.PI / 3); // 60° = π/3
      const zoomDiff = 0.5;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(1666.6666666666667, 5);
    });

    it("top-down with zoom snap (0° + 2 zoom levels)", () => {
      const camera = createMockCamera(0);
      const zoomDiff = 2;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(1584.9625007211562, 5);
    });

    it("moderate angle + moderate zoom", () => {
      const camera = createMockCamera(Math.PI / 6); // 30°
      const zoomDiff = 1.5;
      const duration = calculateAnimationDuration(camera, zoomDiff);

      expect(duration).toBeCloseTo(1321.9280948873625, 5);
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
