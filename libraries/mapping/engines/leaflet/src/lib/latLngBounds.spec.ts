import { describe, it, expect } from "vitest";
import { ManagedProjections } from "@carma/geo/proj";
import { convertTurfBBoxToLeafletBounds } from "./latLngBounds";

describe("latLngBounds", () => {
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
