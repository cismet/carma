import { describe, it, expect } from "vitest";
import { createZoomDistanceConverter } from "./zoom-distance-converter";
import { PerspectiveFrustum, type Scene } from "@carma/cesium";
import type { Zoom } from "@carma/types";
import type { Degrees, Meters } from "@carma/geo/types";

/**
 * Create a mock Cesium scene with a perspective camera
 */
function createMockScene(fovRadians: number): Scene {
  const frustum = new PerspectiveFrustum();
  frustum.fov = fovRadians;
  // Set other required properties to reasonable defaults
  frustum.aspectRatio = 16 / 9;
  frustum.near = 1.0;
  frustum.far = 1000000.0;

  return {
    camera: {
      frustum,
    },
  } as Scene;
}

describe("zoom-distance-converter", () => {
  const viewportWidth = 1920;
  const viewportHeight = 1080;
  const testLatitude = 51.0 as Degrees;

  describe("round-trip conversions", () => {
    const testCases = [
      { fovDegrees: 30, fovRadians: (30 * Math.PI) / 180 },
      { fovDegrees: 45, fovRadians: (45 * Math.PI) / 180 },
      { fovDegrees: 60, fovRadians: (60 * Math.PI) / 180 },
      { fovDegrees: 90, fovRadians: (90 * Math.PI) / 180 },
    ];

    const resolutionMatchRadii = [0.0, 0.2, 0.5, 0.8, 1.0];
    const testZooms: Zoom[] = [10, 14, 17, 20] as Zoom[];

    testCases.forEach(({ fovDegrees, fovRadians }) => {
      describe(`FOV ${fovDegrees}°`, () => {
        resolutionMatchRadii.forEach((resolutionMatchRadius) => {
          describe(`resolutionMatchRadius ${resolutionMatchRadius}`, () => {
            const scene = createMockScene(fovRadians);
            const converter = createZoomDistanceConverter(
              scene,
              viewportWidth,
              viewportHeight,
              resolutionMatchRadius
            );

            if (!converter) {
              throw new Error("Failed to create converter");
            }

            testZooms.forEach((zoom) => {
              it(`zoom ${zoom} → distance → zoom round-trip`, () => {
                // Convert zoom to distance
                const distance = converter.zoomToDistance(zoom, testLatitude);
                expect(distance).not.toBeNull();
                expect(distance).toBeGreaterThan(0);

                // Convert distance back to zoom
                const resultZoom = converter.distanceToZoom(
                  distance!,
                  testLatitude
                );
                expect(resultZoom).not.toBeNull();

                // Should match original zoom (within floating point tolerance)
                expect(resultZoom).toBeCloseTo(zoom, 6);
              });
            });

            const testDistances: Meters[] = [
              500, 1000, 5000, 10000,
            ] as Meters[];

            testDistances.forEach((distance) => {
              it(`distance ${distance}m → zoom → distance round-trip`, () => {
                // Convert distance to zoom
                const zoom = converter.distanceToZoom(distance, testLatitude);
                expect(zoom).not.toBeNull();
                expect(zoom).toBeGreaterThan(0);

                // Convert zoom back to distance
                const resultDistance = converter.zoomToDistance(
                  zoom!,
                  testLatitude
                );
                expect(resultDistance).not.toBeNull();

                // Should match original distance (within floating point tolerance)
                expect(resultDistance).toBeCloseTo(distance, 1);
              });
            });
          });
        });
      });
    });
  });

  describe("resolutionMatchRadius behavior", () => {
    const fovRadians = (60 * Math.PI) / 180;
    const scene = createMockScene(fovRadians);
    const testZoom = 17 as Zoom;

    it("resolutionMatchRadius 0.0 should give longest distance (center match)", () => {
      const converter = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        0.0
      );
      const distanceCenter = converter!.zoomToDistance(testZoom, testLatitude);

      const converterEdge = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        0.5
      );
      const distanceEdge = converterEdge!.zoomToDistance(
        testZoom,
        testLatitude
      );

      // Center match should give longer distance than off-center match
      expect(distanceCenter).toBeGreaterThan(distanceEdge!);
    });

    it("resolutionMatchRadius 1.0 should give shortest distance (edge match)", () => {
      const converterCenter = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        0.0
      );
      const distanceCenter = converterCenter!.zoomToDistance(
        testZoom,
        testLatitude
      );

      const converterEdge = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        1.0
      );
      const distanceEdge = converterEdge!.zoomToDistance(
        testZoom,
        testLatitude
      );

      // Edge match should give shorter distance than center match
      expect(distanceEdge).toBeLessThan(distanceCenter!);
    });

    it("intermediate resolutionMatchRadius should give intermediate distance", () => {
      const converterCenter = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        0.0
      );
      const distanceCenter = converterCenter!.zoomToDistance(
        testZoom,
        testLatitude
      );

      const converterMid = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        0.5
      );
      const distanceMid = converterMid!.zoomToDistance(testZoom, testLatitude);

      const converterEdge = createZoomDistanceConverter(
        scene,
        viewportWidth,
        viewportHeight,
        1.0
      );
      const distanceEdge = converterEdge!.zoomToDistance(
        testZoom,
        testLatitude
      );

      // Mid should be between center and edge
      expect(distanceMid).toBeLessThan(distanceCenter!);
      expect(distanceMid).toBeGreaterThan(distanceEdge!);
    });
  });

  describe("error handling", () => {
    it("should return null for invalid viewport height", () => {
      const scene = createMockScene(Math.PI / 3);
      const converter = createZoomDistanceConverter(scene, 1920, 0, 0.2);
      expect(converter).toBeNull();
    });

    it("should return null for invalid viewport width", () => {
      const scene = createMockScene(Math.PI / 3);
      const converter = createZoomDistanceConverter(scene, -1, 1080, 0.2);
      expect(converter).toBeNull();
    });

    it("should return null for non-perspective frustum", () => {
      const scene = {
        camera: {
          frustum: {} as unknown,
        },
      } as Scene;
      const converter = createZoomDistanceConverter(scene, 1920, 1080, 0.2);
      expect(converter).toBeNull();
    });
  });
});
