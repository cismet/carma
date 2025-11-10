import { describe, it, expect } from "vitest";
import {
  latLngToLngLatArray,
  lngLatArrayToLatLng,
  latLngDegToRad,
  latLngRadToDeg,
  lngLatArrayDegToRad,
  lngLatArrayRadToDeg,
} from "./geographic";
import type {
  LatLng,
  LngLatArray,
  Longitude,
  Latitude,
} from "@carma/geo/types";

describe("geographic conversions", () => {
  describe("latLngToLngLatArray", () => {
    it("should convert LatLng to LngLatArray", () => {
      const latLng: LatLng.deg = {
        latitude: 52.0 as Latitude.deg,
        longitude: 7.0 as Longitude.deg,
      };

      const result = latLngToLngLatArray(latLng);

      expect(result[0]).toBe(7.0);
      expect(result[1]).toBe(52.0);
    });
  });

  describe("lngLatArrayToLatLng", () => {
    it("should convert LngLatArray to LatLng", () => {
      const arr: LngLatArray.deg = [7.0 as Longitude.deg, 52.0 as Latitude.deg];

      const result = lngLatArrayToLatLng(arr);

      expect(result.longitude).toBe(7.0);
      expect(result.latitude).toBe(52.0);
    });
  });

  describe("degree-radian conversions", () => {
    it("should convert LatLng degrees to radians", () => {
      const deg: LatLng.deg = {
        latitude: 90.0 as Latitude.deg,
        longitude: 180.0 as Longitude.deg,
      };

      const rad = latLngDegToRad(deg);

      expect(rad.latitude).toBeCloseTo(Math.PI / 2, 10);
      expect(rad.longitude).toBeCloseTo(Math.PI, 10);
    });

    it("should convert LatLng radians to degrees", () => {
      const rad: LatLng.rad = {
        latitude: (Math.PI / 2) as Latitude.rad,
        longitude: Math.PI as Longitude.rad,
      };

      const deg = latLngRadToDeg(rad);

      expect(deg.latitude).toBeCloseTo(90.0, 10);
      expect(deg.longitude).toBeCloseTo(180.0, 10);
    });

    it("should convert LngLatArray degrees to radians", () => {
      const deg: LngLatArray.deg = [
        180.0 as Longitude.deg,
        90.0 as Latitude.deg,
      ];

      const rad = lngLatArrayDegToRad(deg);

      expect(rad[0]).toBeCloseTo(Math.PI, 10);
      expect(rad[1]).toBeCloseTo(Math.PI / 2, 10);
    });

    it("should convert LngLatArray radians to degrees", () => {
      const rad: LngLatArray.rad = [
        Math.PI as Longitude.rad,
        (Math.PI / 2) as Latitude.rad,
      ];

      const deg = lngLatArrayRadToDeg(rad);

      expect(deg[0]).toBeCloseTo(180.0, 10);
      expect(deg[1]).toBeCloseTo(90.0, 10);
    });

    it("should preserve additional array elements during conversion", () => {
      const degWithAlt: LngLatArray.deg<[number]> = [
        7.0 as Longitude.deg,
        52.0 as Latitude.deg,
        100.5,
      ];

      const rad = lngLatArrayDegToRad(degWithAlt);

      expect(rad[2]).toBe(100.5);
    });
  });
});
