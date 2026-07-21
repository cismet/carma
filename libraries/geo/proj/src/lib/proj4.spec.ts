import { describe, it, expect } from "vitest";

import { ManagedProjections } from "./managed-projections";
import {
  getFromEcefToWGS84,
  getFromWGS84ToEcef,
  getProj4Converter,
  type CoordinateFor,
} from "./proj4";
const WUPPERTAL = {
  position: {
    longitude: 7.20028,
    latitude: 51.27174,
    altitude: 155,
    webMercator: { x: 801531.5031689919, y: 6669502.877822709 },
    utm32: { x: 374457.92973846296, y: 5681582.504430049 },
  },
  extent: {
    east: 7.32,
    north: 51.33,
    south: 51.16,
    west: 7.0,
    utm32: {
      ne: { x: 382956.92866915197, y: 5687863.081930166 },
      sw: { x: 360150.05966419703, y: 5669519.256383006 },
    },
  },
};

describe("proj4 converters", () => {
  describe("Web Mercator projection", () => {
    it("should convert from WGS84 to Web Mercator using Wuppertal center", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG3857
      );

      const wgs84: CoordinateFor<typeof ManagedProjections.EPSG4326> = [
        WUPPERTAL.position.longitude,
        WUPPERTAL.position.latitude,
      ];

      const webMercator = converter.forward(wgs84);

      expect(webMercator[0]).toBeCloseTo(WUPPERTAL.position.webMercator.x, 0);
      expect(webMercator[1]).toBeCloseTo(WUPPERTAL.position.webMercator.y, 0);
    });
  });

  describe("UTM32 projection (EPSG:25832)", () => {
    it("should convert Wuppertal center from WGS84 to UTM32", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG25832
      );

      const wgs84: CoordinateFor<typeof ManagedProjections.EPSG4326> = [
        WUPPERTAL.position.longitude,
        WUPPERTAL.position.latitude,
      ];

      const utm32 = converter.forward(wgs84);

      expect(utm32[0]).toBeCloseTo(WUPPERTAL.position.utm32.x, 0);
      expect(utm32[1]).toBeCloseTo(WUPPERTAL.position.utm32.y, 0);
    });

    it("should convert Wuppertal SW corner from WGS84 to UTM32", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG25832
      );

      const wgs84: CoordinateFor<typeof ManagedProjections.EPSG4326> = [
        WUPPERTAL.extent.west,
        WUPPERTAL.extent.south,
      ];

      const utm32 = converter.forward(wgs84);

      expect(utm32[0]).toBeCloseTo(WUPPERTAL.extent.utm32.sw.x, 0);
      expect(utm32[1]).toBeCloseTo(WUPPERTAL.extent.utm32.sw.y, 0);
    });

    it("should convert Wuppertal NE corner from WGS84 to UTM32", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG25832
      );

      const wgs84: CoordinateFor<typeof ManagedProjections.EPSG4326> = [
        WUPPERTAL.extent.east,
        WUPPERTAL.extent.north,
      ];

      const utm32 = converter.forward(wgs84);

      expect(utm32[0]).toBeCloseTo(WUPPERTAL.extent.utm32.ne.x, 0);
      expect(utm32[1]).toBeCloseTo(WUPPERTAL.extent.utm32.ne.y, 0);
    });

    it("should convert from UTM32 to WGS84 (round-trip)", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG25832
      );

      const utm32: CoordinateFor<typeof ManagedProjections.EPSG25832> = [
        WUPPERTAL.position.utm32.x,
        WUPPERTAL.position.utm32.y,
      ];

      const wgs84 = converter.inverse(utm32);

      expect(wgs84[0]).toBeCloseTo(WUPPERTAL.position.longitude, 4);
      expect(wgs84[1]).toBeCloseTo(WUPPERTAL.position.latitude, 4);
    });
  });

  describe("round-trip conversions", () => {
    it("should preserve altitude in round-trip conversions", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG3857
      );

      const originalWith3D = [
        WUPPERTAL.position.longitude,
        WUPPERTAL.position.latitude,
        WUPPERTAL.position.altitude,
      ] as const;

      const webMercator = converter.forward(
        originalWith3D as unknown as CoordinateFor<
          typeof ManagedProjections.EPSG4326
        >
      );
      const roundTrip = converter.inverse(webMercator);

      expect(roundTrip[0]).toBeCloseTo(WUPPERTAL.position.longitude, 10);
      expect(roundTrip[1]).toBeCloseTo(WUPPERTAL.position.latitude, 10);
      expect(roundTrip[2]).toBeCloseTo(WUPPERTAL.position.altitude, 10);
    });

    it("converts WGS84 3D coordinates to EPSG:4978 and back", () => {
      const wgs84 = [7.163461245, 51.241111235, 207.598234228] as const;
      const expectedEcef = [
        3970046.913639711, 498961.576246063, 4950543.333479255,
      ];

      const ecef = getFromWGS84ToEcef(
        wgs84 as Parameters<typeof getFromWGS84ToEcef>[0]
      );

      expect(ecef[0]).toBeCloseTo(expectedEcef[0], 3);
      expect(ecef[1]).toBeCloseTo(expectedEcef[1], 3);
      expect(ecef[2]).toBeCloseTo(expectedEcef[2], 3);

      const roundTrip = getFromEcefToWGS84(ecef);
      expect(roundTrip[0]).toBeCloseTo(wgs84[0], 10);
      expect(roundTrip[1]).toBeCloseTo(wgs84[1], 10);
      expect(roundTrip[2]).toBeCloseTo(wgs84[2], 6);
    });
  });

  describe("converter caching", () => {
    it("should return the same converter instance for the same CRS pair", () => {
      const converter1 = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG3857
      );

      const converter2 = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG3857
      );

      expect(converter1).toBe(converter2);
    });

    it("should preserve sourceCrs and targetCrs properties", () => {
      const converter = getProj4Converter(
        ManagedProjections.EPSG4326,
        ManagedProjections.EPSG3857
      );

      expect(converter.sourceCrs).toBe(ManagedProjections.EPSG4326);
      expect(converter.targetCrs).toBe(ManagedProjections.EPSG3857);
    });
  });
});
