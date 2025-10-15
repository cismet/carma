import { describe, it, expect } from "vitest";
import {
  isValidLatitudeDeg,
  isValidLongitudeDeg,
  isValidLatitudeRad,
  isValidLongitudeRad,
  normalizeLatitudeDeg,
  normalizeLatitudeRad,
  normalizeLongitudeDeg,
  normalizeLongitudeRad,
} from "./geographic";
import type { Latitude, Longitude } from "@carma/geo/types";
import { PI, PI_OVER_TWO } from "@carma/units/helpers";

describe("geographic validators", () => {
  describe("isValidLatitudeDeg", () => {
    it("should accept valid latitudes", () => {
      expect(isValidLatitudeDeg(0 as Latitude.deg)).toBe(true);
      expect(isValidLatitudeDeg(90 as Latitude.deg)).toBe(true);
      expect(isValidLatitudeDeg(-90 as Latitude.deg)).toBe(true);
      expect(isValidLatitudeDeg(45.5 as Latitude.deg)).toBe(true);
    });

    it("should reject invalid latitudes", () => {
      expect(isValidLatitudeDeg(91 as Latitude.deg)).toBe(false);
      expect(isValidLatitudeDeg(-91 as Latitude.deg)).toBe(false);
      expect(isValidLatitudeDeg(180 as Latitude.deg)).toBe(false);
    });
  });

  describe("isValidLongitudeDeg", () => {
    it("should accept valid longitudes", () => {
      expect(isValidLongitudeDeg(0 as Longitude.deg)).toBe(true);
      expect(isValidLongitudeDeg(180 as Longitude.deg)).toBe(true);
      expect(isValidLongitudeDeg(-180 as Longitude.deg)).toBe(true);
      expect(isValidLongitudeDeg(45.5 as Longitude.deg)).toBe(true);
    });

    it("should reject invalid longitudes", () => {
      expect(isValidLongitudeDeg(181 as Longitude.deg)).toBe(false);
      expect(isValidLongitudeDeg(-181 as Longitude.deg)).toBe(false);
      expect(isValidLongitudeDeg(360 as Longitude.deg)).toBe(false);
    });
  });

  describe("isValidLatitudeRad", () => {
    it("should accept valid latitudes in radians", () => {
      expect(isValidLatitudeRad(0 as Latitude.rad)).toBe(true);
      expect(isValidLatitudeRad(PI_OVER_TWO as Latitude.rad)).toBe(true);
      expect(isValidLatitudeRad(-PI_OVER_TWO as Latitude.rad)).toBe(true);
    });

    it("should reject invalid latitudes in radians", () => {
      expect(isValidLatitudeRad(PI as Latitude.rad)).toBe(false);
      expect(isValidLatitudeRad(-PI as Latitude.rad)).toBe(false);
    });
  });

  describe("isValidLongitudeRad", () => {
    it("should accept valid longitudes in radians", () => {
      expect(isValidLongitudeRad(0 as Longitude.rad)).toBe(true);
      expect(isValidLongitudeRad(PI as Longitude.rad)).toBe(true);
      expect(isValidLongitudeRad(-PI as Longitude.rad)).toBe(true);
    });

    it("should reject invalid longitudes in radians", () => {
      expect(isValidLongitudeRad((PI + 0.1) as Longitude.rad)).toBe(false);
      expect(isValidLongitudeRad((-PI - 0.1) as Longitude.rad)).toBe(false);
    });
  });

  describe("normalizeLatitudeDeg", () => {
    it("should clamp latitudes to valid range", () => {
      expect(normalizeLatitudeDeg(100 as Latitude.deg)).toBe(90);
      expect(normalizeLatitudeDeg(-100 as Latitude.deg)).toBe(-90);
      expect(normalizeLatitudeDeg(45 as Latitude.deg)).toBe(45);
    });
  });

  describe("normalizeLatitudeRad", () => {
    it("should clamp latitudes in radians to valid range", () => {
      expect(normalizeLatitudeRad(PI as Latitude.rad)).toBeCloseTo(
        PI_OVER_TWO,
        10
      );
      expect(normalizeLatitudeRad(-PI as Latitude.rad)).toBeCloseTo(
        -PI_OVER_TWO,
        10
      );
      expect(normalizeLatitudeRad(0.5 as Latitude.rad)).toBeCloseTo(0.5, 10);
    });
  });

  describe("normalizeLongitudeDeg", () => {
    it("should wrap longitudes to -180..180 range", () => {
      expect(normalizeLongitudeDeg(190 as Longitude.deg)).toBeCloseTo(-170, 10);
      expect(normalizeLongitudeDeg(-190 as Longitude.deg)).toBeCloseTo(170, 10);
      expect(normalizeLongitudeDeg(360 as Longitude.deg)).toBeCloseTo(0, 10);
      expect(normalizeLongitudeDeg(540 as Longitude.deg)).toBeCloseTo(180, 10);
      expect(normalizeLongitudeDeg(45 as Longitude.deg)).toBeCloseTo(45, 10);
    });
  });

  describe("normalizeLongitudeRad", () => {
    it("should wrap longitudes in radians to -π..π range", () => {
      expect(
        normalizeLongitudeRad(((PI * 3) / 2) as Longitude.rad)
      ).toBeCloseTo(-PI_OVER_TWO, 10);
      expect(normalizeLongitudeRad((PI * 3) as Longitude.rad)).toBeCloseTo(
        PI,
        10
      );
      expect(normalizeLongitudeRad((PI / 4) as Longitude.rad)).toBeCloseTo(
        PI / 4,
        10
      );
      expect(normalizeLongitudeRad((PI * 5) as Longitude.rad)).toBeCloseTo(
        PI,
        10
      );
    });
  });
});
