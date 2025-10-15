import { describe, it, expect, vi } from "vitest";
import type { BBox2d } from "@turf/helpers";
import { ManagedProjections } from "@carma/geo/proj";
import {
  latLngBoundsToProjectedBBox,
  getBoundingBoxForLeafletMap,
  convertTurfBBoxToLeafletBounds,
} from "./latLngBounds";
import type { Map as LeafletMap } from "leaflet";
import { WUPPERTAL } from "@carma/resources";

describe("latLngBounds", () => {
  describe("latLngBoundsToProjectedBBox", () => {
    it("should convert Wuppertal extent from WGS84 to UTM32 bounding box", () => {
      const mockBounds = {
        getNorthEast: () => ({
          lat: WUPPERTAL.extent.north,
          lng: WUPPERTAL.extent.east,
        }),
        getSouthWest: () => ({
          lat: WUPPERTAL.extent.south,
          lng: WUPPERTAL.extent.west,
        }),
      } as L.LatLngBounds;

      const bbox = latLngBoundsToProjectedBBox(
        mockBounds,
        ManagedProjections.EPSG25832
      );

      expect(bbox.left).toBeCloseTo(360150.06, 0);
      expect(bbox.bottom).toBeCloseTo(5669519.26, 0);
      expect(bbox.right).toBeCloseTo(382956.93, 0);
      expect(bbox.top).toBeCloseTo(5687863.08, 0);
    });

    it("should convert WGS84 bounds to Web Mercator bounding box", () => {
      const mockBounds = {
        getNorthEast: () => ({ lat: 51.0, lng: 7.0 }),
        getSouthWest: () => ({ lat: 50.0, lng: 6.0 }),
      } as L.LatLngBounds;

      const bbox = latLngBoundsToProjectedBBox(
        mockBounds,
        ManagedProjections.EPSG3857
      );

      // Web Mercator coordinates for [6, 50] ≈ [667916, 6446275]
      // Web Mercator coordinates for [7, 51] ≈ [779236, 6621293]
      expect(bbox.left).toBeCloseTo(667916, -1);
      expect(bbox.bottom).toBeCloseTo(6446275, -1);
      expect(bbox.right).toBeCloseTo(779236, -1);
      expect(bbox.top).toBeCloseTo(6621293, -1);
    });

    it("should handle bounds crossing the equator", () => {
      const mockBounds = {
        getNorthEast: () => ({ lat: 1.0, lng: 1.0 }),
        getSouthWest: () => ({ lat: -1.0, lng: -1.0 }),
      } as L.LatLngBounds;

      const bbox = latLngBoundsToProjectedBBox(
        mockBounds,
        ManagedProjections.EPSG3857
      );

      expect(bbox.left).toBeLessThan(bbox.right);
      expect(bbox.bottom).toBeLessThan(bbox.top);
      expect(bbox.left).toBeCloseTo(-111325, -2);
      expect(bbox.bottom).toBeCloseTo(-111325, -2);
      expect(bbox.right).toBeCloseTo(111325, -2);
      expect(bbox.top).toBeCloseTo(111325, -2);
    });

    it("should maintain correct bbox structure", () => {
      const mockBounds = {
        getNorthEast: () => ({
          lat: WUPPERTAL.extent.north,
          lng: WUPPERTAL.extent.east,
        }),
        getSouthWest: () => ({
          lat: WUPPERTAL.extent.south,
          lng: WUPPERTAL.extent.west,
        }),
      } as L.LatLngBounds;

      const bbox = latLngBoundsToProjectedBBox(
        mockBounds,
        ManagedProjections.EPSG25832
      );

      expect(bbox).toHaveProperty("left");
      expect(bbox).toHaveProperty("top");
      expect(bbox).toHaveProperty("right");
      expect(bbox).toHaveProperty("bottom");
      expect(bbox.left).toBeLessThan(bbox.right);
      expect(bbox.bottom).toBeLessThan(bbox.top);
    });
  });

  describe("getBoundingBoxForLeafletMap", () => {
    it("should get Wuppertal bounding box from Leaflet map instance", () => {
      const mockMap = {
        getBounds: vi.fn(() => ({
          getNorthEast: () => ({
            lat: WUPPERTAL.extent.north,
            lng: WUPPERTAL.extent.east,
          }),
          getSouthWest: () => ({
            lat: WUPPERTAL.extent.south,
            lng: WUPPERTAL.extent.west,
          }),
        })),
      } as unknown as LeafletMap;

      const bbox = getBoundingBoxForLeafletMap(
        mockMap,
        ManagedProjections.EPSG25832
      );

      expect(mockMap.getBounds).toHaveBeenCalled();
      expect(bbox.left).toBeCloseTo(360150.06, 0);
      expect(bbox.bottom).toBeCloseTo(5669519.26, 0);
      expect(bbox.right).toBeCloseTo(382956.93, 0);
      expect(bbox.top).toBeCloseTo(5687863.08, 0);
    });

    it("should work with different projections", () => {
      const mockMap = {
        getBounds: vi.fn(() => ({
          getNorthEast: () => ({ lat: 51.0, lng: 7.0 }),
          getSouthWest: () => ({ lat: 50.0, lng: 6.0 }),
        })),
      } as unknown as LeafletMap;

      const bboxUtm = getBoundingBoxForLeafletMap(
        mockMap,
        ManagedProjections.EPSG25832
      );
      const bboxMercator = getBoundingBoxForLeafletMap(
        mockMap,
        ManagedProjections.EPSG3857
      );

      // Results should be different for different projections
      expect(bboxUtm.left).not.toBeCloseTo(bboxMercator.left, 0);
      expect(bboxUtm.top).not.toBeCloseTo(bboxMercator.top, 0);
    });
  });

  describe("functional equality with legacy implementation", () => {
    it("should produce same results as old proj4-based implementation for UTM32", () => {
      const mockBounds = {
        getNorthEast: () => ({
          lat: WUPPERTAL.extent.north,
          lng: WUPPERTAL.extent.east,
        }),
        getSouthWest: () => ({
          lat: WUPPERTAL.extent.south,
          lng: WUPPERTAL.extent.west,
        }),
      } as L.LatLngBounds;

      const bbox = latLngBoundsToProjectedBBox(
        mockBounds,
        ManagedProjections.EPSG25832
      );

      expect(bbox.left).toBeCloseTo(360150.06, 0);
      expect(bbox.bottom).toBeCloseTo(5669519.26, 0);
      expect(bbox.right).toBeCloseTo(382956.93, 0);
      expect(bbox.top).toBeCloseTo(5687863.08, 0);
    });
  });

  describe("convertTurfBBoxToLeafletBounds", () => {
    it("should convert Web Mercator bbox to Leaflet WGS84 bounds", () => {
      // Wuppertal extent in Web Mercator (EPSG:3857)
      const webMercatorBbox: [number, number, number, number] = [
        778650, 6625000, 805000, 6650000,
      ];

      const bounds = convertTurfBBoxToLeafletBounds(
        webMercatorBbox,
        ManagedProjections.EPSG3857
      );

      // Should return [[lat_south, lng_west], [lat_north, lng_east]]
      expect(bounds).toHaveLength(2);
      expect(bounds[0]).toHaveLength(2);
      expect(bounds[1]).toHaveLength(2);

      // Verify lat range is valid
      expect(bounds[0][0]).toBeGreaterThan(-90);
      expect(bounds[0][0]).toBeLessThan(90);
      expect(bounds[1][0]).toBeGreaterThan(-90);
      expect(bounds[1][0]).toBeLessThan(90);

      // South should be less than north
      expect(bounds[0][0]).toBeLessThan(bounds[1][0]);
      // West should be less than east
      expect(bounds[0][1]).toBeLessThan(bounds[1][1]);
    });

    it("should match legacy convertBBox2Bounds behavior for Web Mercator", () => {
      // Example bbox from turf in EPSG:3857
      const bbox: [number, number, number, number] = [
        800000, 6630000, 810000, 6640000,
      ];

      const bounds = convertTurfBBoxToLeafletBounds(
        bbox,
        ManagedProjections.EPSG3857
      );

      // Legacy format: [[lat_sw, lng_sw], [lat_ne, lng_ne]]
      const sw = bounds[0];
      const ne = bounds[1];

      // Verify coordinates are in valid WGS84 range
      expect(sw[0]).toBeGreaterThan(50); // Roughly Wuppertal latitude
      expect(sw[0]).toBeLessThan(52);
      expect(sw[1]).toBeGreaterThan(6); // Roughly Wuppertal longitude
      expect(sw[1]).toBeLessThan(8);

      expect(ne[0]).toBeGreaterThan(50);
      expect(ne[0]).toBeLessThan(52);
      expect(ne[1]).toBeGreaterThan(6);
      expect(ne[1]).toBeLessThan(8);
    });

    it("should handle default EPSG:3857 projection", () => {
      const bbox: [number, number, number, number] = [
        800000, 6630000, 810000, 6640000,
      ];

      // Should default to EPSG:3857
      const bounds = convertTurfBBoxToLeafletBounds(bbox);

      expect(bounds).toHaveLength(2);
      expect(bounds[0][0]).toBeGreaterThan(50);
      expect(bounds[1][0]).toBeGreaterThan(50);
    });
  });
});
