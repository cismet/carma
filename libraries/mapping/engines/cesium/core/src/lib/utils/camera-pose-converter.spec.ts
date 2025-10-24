/**
 * Camera pose conversion specs
 * Tests for Portal ↔ Cesium format conversions
 */

import { describe, it, expect } from "vitest";
import {
  convertPortalPoseToCesiumPose,
  validateCameraPosePortal,
} from "./camera-pose-converter";
import type { CameraPosePortal } from "./camera-pose-converter";

describe("Camera Pose Converter", () => {
  describe("convertPortalPoseToCesiumPose", () => {
    it("should convert degrees to radians for lat/lng", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      // 51.27° ≈ 0.8947 radians
      expect(cesiumPose.latitude).toBeCloseTo(0.8947, 3);
      // 7.20° ≈ 0.1257 radians
      expect(cesiumPose.longitude).toBeCloseTo(0.1257, 3);
    });

    it("should preserve altitude as height", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.height).toBe(10000);
    });

    it("should convert heading/pitch/roll from degrees to radians", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
        heading: 0,
        pitch: -90,
        roll: 0,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.heading).toBe(0);
      // -90° = -π/2 ≈ -1.5708
      expect(cesiumPose.pitch).toBeCloseTo(-Math.PI / 2, 4);
      expect(cesiumPose.roll).toBe(0);
    });

    it("should handle undefined heading/pitch/roll", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.heading).toBeUndefined();
      expect(cesiumPose.pitch).toBeUndefined();
      expect(cesiumPose.roll).toBeUndefined();
    });

    it("should handle 0° heading correctly", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
        heading: 0,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.heading).toBe(0);
    });

    it("should handle negative altitudes (below sea level)", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: -100, // Below sea level (valid in some contexts)
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.height).toBe(-100);
    });

    it("should handle very high altitudes", () => {
      const portalPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 40000000, // Satellite altitude
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.height).toBe(40000000);
    });

    it("should handle equator coordinates", () => {
      const portalPose: CameraPosePortal = {
        latitude: 0,
        longitude: 0,
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      expect(cesiumPose.latitude).toBe(0);
      expect(cesiumPose.longitude).toBe(0);
      expect(cesiumPose.height).toBe(10000);
    });

    it("should handle poles", () => {
      const northPole: CameraPosePortal = {
        latitude: 90,
        longitude: 0,
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(northPole);

      // 90° = π/2 ≈ 1.5708
      expect(cesiumPose.latitude).toBeCloseTo(Math.PI / 2, 4);
      expect(cesiumPose.height).toBe(10000);
    });

    it("should handle negative longitude (west)", () => {
      const portalPose: CameraPosePortal = {
        latitude: 40.7128,
        longitude: -74.006, // New York
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      // -74.0060° ≈ -1.2915 radians
      expect(cesiumPose.longitude).toBeCloseTo(-1.2915, 3);
    });

    it("should handle negative latitude (south)", () => {
      const portalPose: CameraPosePortal = {
        latitude: -33.8688,
        longitude: 151.2093, // Sydney
        altitude: 10000,
      };

      const cesiumPose = convertPortalPoseToCesiumPose(portalPose);

      // -33.8688° ≈ -0.5908 radians
      expect(cesiumPose.latitude).toBeCloseTo(-0.5908, 3);
    });

    it("should handle pitch range -90 to 90", () => {
      const testCases = [
        { pitch: -90, expected: -Math.PI / 2 },
        { pitch: -45, expected: -Math.PI / 4 },
        { pitch: 0, expected: 0 },
        { pitch: 45, expected: Math.PI / 4 },
        { pitch: 90, expected: Math.PI / 2 },
      ];

      testCases.forEach(({ pitch, expected }) => {
        const portalPose: CameraPosePortal = {
          latitude: 51.27,
          longitude: 7.2,
          altitude: 10000,
          pitch,
        };

        const cesiumPose = convertPortalPoseToCesiumPose(portalPose);
        expect(cesiumPose.pitch).toBeCloseTo(expected, 4);
      });
    });

    it("should handle heading range 0 to 360", () => {
      const testCases = [
        { heading: 0, expected: 0 },
        { heading: 90, expected: Math.PI / 2 },
        { heading: 180, expected: Math.PI },
        { heading: 270, expected: (3 * Math.PI) / 2 },
        { heading: 360, expected: 2 * Math.PI },
      ];

      testCases.forEach(({ heading, expected }) => {
        const portalPose: CameraPosePortal = {
          latitude: 51.27,
          longitude: 7.2,
          altitude: 10000,
          heading,
        };

        const cesiumPose = convertPortalPoseToCesiumPose(portalPose);
        expect(cesiumPose.heading).toBeCloseTo(expected, 4);
      });
    });
  });

  describe("validateCameraPosePortal", () => {
    it("should accept valid pose", () => {
      const validPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(validPose)).not.toThrow();
    });

    it("should reject invalid latitude (too high)", () => {
      const invalidPose: CameraPosePortal = {
        latitude: 91,
        longitude: 7.2,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /latitude must be between -90 and 90/
      );
    });

    it("should reject invalid latitude (too low)", () => {
      const invalidPose: CameraPosePortal = {
        latitude: -91,
        longitude: 7.2,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /latitude must be between -90 and 90/
      );
    });

    it("should reject invalid longitude (too high)", () => {
      const invalidPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 181,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /longitude must be between -180 and 180/
      );
    });

    it("should reject invalid longitude (too low)", () => {
      const invalidPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: -181,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /longitude must be between -180 and 180/
      );
    });

    it("should reject non-numeric latitude", () => {
      const invalidPose = {
        latitude: "51.27" as any,
        longitude: 7.2,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /latitude must be a number/
      );
    });

    it("should reject NaN latitude", () => {
      const invalidPose: CameraPosePortal = {
        latitude: NaN,
        longitude: 7.2,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /latitude must be a number/
      );
    });

    it("should reject invalid pitch (too high)", () => {
      const invalidPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
        pitch: 91,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /pitch must be between -90 and 90/
      );
    });

    it("should reject invalid pitch (too low)", () => {
      const invalidPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
        pitch: -91,
      };

      expect(() => validateCameraPosePortal(invalidPose)).toThrow(
        /pitch must be between -90 and 90/
      );
    });

    it("should accept valid pitch range", () => {
      const validPose: CameraPosePortal = {
        latitude: 51.27,
        longitude: 7.2,
        altitude: 10000,
        pitch: -45,
      };

      expect(() => validateCameraPosePortal(validPose)).not.toThrow();
    });

    it("should accept custom field name in error messages", () => {
      const invalidPose: CameraPosePortal = {
        latitude: 91,
        longitude: 7.2,
        altitude: 10000,
      };

      expect(() => validateCameraPosePortal(invalidPose, "customPose")).toThrow(
        /customPose.latitude/
      );
    });
  });
});
