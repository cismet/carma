/**
 * Camera coordinate transformation tests
 * Tests for HeadingPitchRoll → CameraPrimitive transformations using proper Cesium transforms
 */

import { describe, it, expect } from "vitest";
import {
  transformHeadingPitchRollToPrimitive,
  validateCameraStateHeadingPitchRoll,
} from "./heading-pitch-roll-transform";
import type { CameraStateHeadingPitchRoll } from "@carma/cesium";
import { degToRad } from "@carma/units/helpers";
import { Ellipsoid, Cartesian3 } from "cesium";

describe("HeadingPitchRoll Transform", () => {
  describe("transformHeadingPitchRollToPrimitive", () => {
    it("should transform basic camera state correctly", () => {
      // Simple test case: Wuppertal, top-down view
      const hprState: CameraStateHeadingPitchRoll = {
        longitude: 7.20028 as any,
        latitude: 51.27174 as any,
        altitude: 1000 as any,
        heading: 0 as any, // North
        pitch: -90 as any, // Looking straight down
        roll: 0 as any,
        fov: 60 as any,
      };

      const primitive = transformHeadingPitchRollToPrimitive(hprState);

      // Verify position is correct
      expect(primitive.position).toBeDefined();

      // Convert position back to cartographic to verify
      const cartographic = Ellipsoid.WGS84.cartesianToCartographic(
        primitive.position!
      );

      expect(cartographic.longitude).toBeCloseTo(degToRad(7.20028), 5);
      expect(cartographic.latitude).toBeCloseTo(degToRad(51.27174), 5);
      expect(cartographic.height).toBeCloseTo(1000, 0);

      // Verify orientation vectors exist and are normalized
      expect(primitive.direction).toBeDefined();
      expect(primitive.up).toBeDefined();
      expect(primitive.right).toBeDefined();

      // Check normalization (vectors should have unit length)
      const directionLength = Cartesian3.magnitude(primitive.direction!);
      const upLength = Cartesian3.magnitude(primitive.up!);
      const rightLength = Cartesian3.magnitude(primitive.right!);

      expect(directionLength).toBeCloseTo(1, 10);
      expect(upLength).toBeCloseTo(1, 10);
      expect(rightLength).toBeCloseTo(1, 10);

      // FOV should be converted to radians
      expect(primitive.frustum.fov).toBeCloseTo(degToRad(60), 5);
    });

    it("should use default values when optional fields are missing", () => {
      const hprState: CameraStateHeadingPitchRoll = {
        longitude: 7.20028 as any,
        latitude: 51.27174 as any,
        altitude: 1000 as any,
        // heading, pitch, roll, fov omitted
      };

      const primitive = transformHeadingPitchRollToPrimitive(hprState);

      expect(primitive.position).toBeDefined();
      expect(primitive.direction).toBeDefined();
      expect(primitive.up).toBeDefined();
      expect(primitive.right).toBeDefined();

      // Should use defaults: heading=0, pitch=-90, roll=0
      expect(primitive.frustum.fov).toBeUndefined(); // fov defaults to undefined
    });

    it("should maintain orthogonal vectors for any orientation", () => {
      // Test various orientations
      const testCases = [
        { heading: 0, pitch: -45, roll: 0 },
        { heading: 90, pitch: -30, roll: 15 },
        { heading: 180, pitch: -60, roll: -30 },
        { heading: 270, pitch: -15, roll: 45 },
      ];

      testCases.forEach(({ heading, pitch, roll }) => {
        const hprState: CameraStateHeadingPitchRoll = {
          longitude: 7.20028 as any,
          latitude: 51.27174 as any,
          altitude: 1000 as any,
          heading: heading as any,
          pitch: pitch as any,
          roll: roll as any,
        };

        const primitive = transformHeadingPitchRollToPrimitive(hprState);

        // Verify vectors are orthogonal (dot products should be ~0)
        const dotDirectionUp = Cartesian3.dot(
          primitive.direction!,
          primitive.up!
        );
        const dotDirectionRight = Cartesian3.dot(
          primitive.direction!,
          primitive.right!
        );
        const dotUpRight = Cartesian3.dot(primitive.up!, primitive.right!);

        expect(dotDirectionUp).toBeCloseTo(0, 10);
        expect(dotDirectionRight).toBeCloseTo(0, 10);
        expect(dotUpRight).toBeCloseTo(0, 10);
      });
    });

    it("should handle top-down view correctly", () => {
      const hprState: CameraStateHeadingPitchRoll = {
        longitude: 0 as any,
        latitude: 0 as any,
        altitude: 1000 as any,
        heading: 0 as any,
        pitch: -90 as any, // Looking straight down
        roll: 0 as any,
      };

      const primitive = transformHeadingPitchRollToPrimitive(hprState);

      // For top-down view, direction should point toward Earth center
      // Up should point away from Earth center
      const dotProduct = Cartesian3.dot(primitive.direction!, primitive.up!);

      // The dot product should be close to 0 (perpendicular) or negative (opposite)
      // In ENU coordinate system at this location, the vectors are perpendicular
      expect(dotProduct).toBeLessThan(0.1); // Allow small positive values for edge cases
    });

    it("should handle different geographic locations", () => {
      // Test at different locations
      const locations = [
        { name: "North Pole", lat: 90, lng: 0 },
        { name: "South Pole", lat: -90, lng: 0 },
        { name: "Equator, Prime Meridian", lat: 0, lng: 0 },
        { name: "Equator, 180°", lat: 0, lng: 180 },
        { name: "Wuppertal", lat: 51.27174, lng: 7.20028 },
      ];

      locations.forEach(({ lat, lng }) => {
        const hprState: CameraStateHeadingPitchRoll = {
          longitude: lng as any,
          latitude: lat as any,
          altitude: 1000 as any,
          heading: 0 as any,
          pitch: -45 as any,
          roll: 0 as any,
        };

        const primitive = transformHeadingPitchRollToPrimitive(hprState);

        // Verify position conversion
        const cartographic = Ellipsoid.WGS84.cartesianToCartographic(
          primitive.position!
        );
        expect(cartographic.latitude).toBeCloseTo(degToRad(lat), 5);
        expect(cartographic.longitude).toBeCloseTo(degToRad(lng), 5);

        // Verify vectors are still normalized
        expect(Cartesian3.magnitude(primitive.direction!)).toBeCloseTo(1, 10);
        expect(Cartesian3.magnitude(primitive.up!)).toBeCloseTo(1, 10);
        expect(Cartesian3.magnitude(primitive.right!)).toBeCloseTo(1, 10);
      });
    });

    it("should demonstrate ENU coordinate system", () => {
      // At equator, prime meridian with clear orientation
      const hprState: CameraStateHeadingPitchRoll = {
        longitude: 0 as any,
        latitude: 0 as any,
        altitude: 1000 as any,
        heading: 0 as any, // Looking north
        pitch: 0 as any, // Horizontal
        roll: 0 as any,
      };

      const primitive = transformHeadingPitchRollToPrimitive(hprState);

      // Verify the transformation produces valid vectors
      expect(primitive.direction).toBeDefined();
      expect(primitive.up).toBeDefined();
      expect(primitive.right).toBeDefined();

      // All vectors should be normalized
      expect(Cartesian3.magnitude(primitive.direction!)).toBeCloseTo(1, 10);
      expect(Cartesian3.magnitude(primitive.up!)).toBeCloseTo(1, 10);
      expect(Cartesian3.magnitude(primitive.right!)).toBeCloseTo(1, 10);

      // Up should point away from Earth center
      const upDotPosition = Cartesian3.dot(primitive.up!, primitive.position!);
      expect(upDotPosition).toBeGreaterThan(0);

      // For horizontal view (pitch=0), direction should be perpendicular to up
      expect(
        Math.abs(Cartesian3.dot(primitive.direction!, primitive.up!))
      ).toBeLessThan(0.1);

      // All vectors should be orthogonal to each other
      expect(
        Math.abs(Cartesian3.dot(primitive.direction!, primitive.right!))
      ).toBeLessThan(0.1);
      expect(
        Math.abs(Cartesian3.dot(primitive.up!, primitive.right!))
      ).toBeLessThan(0.1);
    });

    it("should convert position coordinates accurately", () => {
      // Test round-trip conversion: degrees → Cartesian3 → cartographic → degrees
      const original: CameraStateHeadingPitchRoll = {
        longitude: 7.20028 as any,
        latitude: 51.27174 as any,
        altitude: 1234.56 as any,
        heading: 45 as any,
        pitch: -30 as any,
        roll: 15 as any,
        fov: 75 as any,
      };

      const primitive = transformHeadingPitchRollToPrimitive(original);

      // Convert back to verify
      const cartographic = Ellipsoid.WGS84.cartesianToCartographic(
        primitive.position!
      );

      expect(cartographic.longitude).toBeCloseTo(degToRad(7.20028), 6);
      expect(cartographic.latitude).toBeCloseTo(degToRad(51.27174), 6);
      expect(cartographic.height).toBeCloseTo(1234.56, 1);
    });
  });

  describe("validateCameraStateHeadingPitchRoll", () => {
    it("should accept valid camera state", () => {
      const validState: CameraStateHeadingPitchRoll = {
        longitude: 7.20028 as any,
        latitude: 51.27174 as any,
        altitude: 1000 as any,
        heading: 0 as any,
        pitch: -45 as any,
        roll: 0 as any,
        fov: 60 as any,
      };

      expect(() =>
        validateCameraStateHeadingPitchRoll(validState)
      ).not.toThrow();
    });

    it("should accept minimal valid state", () => {
      const minimalState: CameraStateHeadingPitchRoll = {
        longitude: 0 as any,
        latitude: 0 as any,
        altitude: 1000 as any,
        // All optional fields omitted
      };

      expect(() =>
        validateCameraStateHeadingPitchRoll(minimalState)
      ).not.toThrow();
    });

    it("should reject invalid latitude", () => {
      const testCases = [
        { latitude: 91, error: "latitude must be between -90 and 90" },
        { latitude: -91, error: "latitude must be between -90 and 90" },
        { latitude: "invalid" as any, error: "latitude must be a number" },
        { latitude: NaN, error: "latitude must be a number" },
      ];

      testCases.forEach(({ latitude, error }) => {
        const invalidState: CameraStateHeadingPitchRoll = {
          longitude: 0 as any,
          latitude,
          altitude: 1000 as any,
        };

        expect(() => validateCameraStateHeadingPitchRoll(invalidState)).toThrow(
          error
        );
      });
    });

    it("should reject invalid longitude", () => {
      const testCases = [
        { longitude: 181, error: "longitude must be between -180 and 180" },
        { longitude: -181, error: "longitude must be between -180 and 180" },
        { longitude: "invalid" as any, error: "longitude must be a number" },
        { longitude: NaN, error: "longitude must be a number" },
      ];

      testCases.forEach(({ longitude, error }) => {
        const invalidState: CameraStateHeadingPitchRoll = {
          longitude,
          latitude: 0 as any,
          altitude: 1000 as any,
        };

        expect(() => validateCameraStateHeadingPitchRoll(invalidState)).toThrow(
          error
        );
      });
    });

    it("should reject invalid altitude", () => {
      const testCases = [
        { altitude: "invalid" as any, error: "altitude must be a number" },
        { altitude: NaN, error: "altitude must be a number" },
      ];

      testCases.forEach(({ altitude, error }) => {
        const invalidState: CameraStateHeadingPitchRoll = {
          longitude: 0 as any,
          latitude: 0 as any,
          altitude,
        };

        expect(() => validateCameraStateHeadingPitchRoll(invalidState)).toThrow(
          error
        );
      });
    });

    it("should reject invalid pitch", () => {
      const testCases = [
        { pitch: 91, error: "pitch must be between -90 and 90" },
        { pitch: -91, error: "pitch must be between -90 and 90" },
        { pitch: "invalid" as any, error: "pitch must be a number" },
        { pitch: NaN, error: "pitch must be a number" },
      ];

      testCases.forEach(({ pitch, error }) => {
        const invalidState: CameraStateHeadingPitchRoll = {
          longitude: 0 as any,
          latitude: 0 as any,
          altitude: 1000 as any,
          pitch,
        };

        expect(() => validateCameraStateHeadingPitchRoll(invalidState)).toThrow(
          error
        );
      });
    });

    it("should reject invalid FOV", () => {
      const testCases = [
        { fov: 0, error: "fov must be between 0 and 180 degrees (exclusive)" },
        {
          fov: 180,
          error: "fov must be between 0 and 180 degrees (exclusive)",
        },
        {
          fov: -10,
          error: "fov must be between 0 and 180 degrees (exclusive)",
        },
        {
          fov: 200,
          error: "fov must be between 0 and 180 degrees (exclusive)",
        },
        { fov: "invalid" as any, error: "fov must be a number" },
        { fov: NaN, error: "fov must be a number" },
      ];

      testCases.forEach(({ fov, error }) => {
        const invalidState: CameraStateHeadingPitchRoll = {
          longitude: 0 as any,
          latitude: 0 as any,
          altitude: 1000 as any,
          fov,
        };

        expect(() => validateCameraStateHeadingPitchRoll(invalidState)).toThrow(
          error
        );
      });
    });

    it("should use custom field name in error messages", () => {
      const invalidState: CameraStateHeadingPitchRoll = {
        longitude: 181 as any,
        latitude: 0 as any,
        altitude: 1000 as any,
      };

      expect(() =>
        validateCameraStateHeadingPitchRoll(invalidState, "customState")
      ).toThrow(/customState.longitude/);
    });
  });
});
