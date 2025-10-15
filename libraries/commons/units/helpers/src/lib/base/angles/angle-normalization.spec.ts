import { describe, it, expect } from "vitest";

import type { Radians } from "@carma/units/types";
import { zeroToTwoPi, negativePiToPi } from "./angle-normalization";

describe("angle-normalization", () => {
  describe("zeroToTwoPi", () => {
    it("should return 0 for angle 0", () => {
      expect(zeroToTwoPi(0 as Radians)).toBe(0);
    });

    it("should return the same angle for angles already in [0, 2π)", () => {
      expect(zeroToTwoPi((Math.PI / 4) as Radians)).toBeCloseTo(Math.PI / 4);
      expect(zeroToTwoPi((Math.PI / 2) as Radians)).toBeCloseTo(Math.PI / 2);
      expect(zeroToTwoPi(Math.PI as Radians)).toBeCloseTo(Math.PI);
      expect(zeroToTwoPi(((3 * Math.PI) / 2) as Radians)).toBeCloseTo(
        (3 * Math.PI) / 2
      );
    });

    it("should wrap angles greater than 2π to [0, 2π)", () => {
      expect(zeroToTwoPi((2 * Math.PI) as Radians)).toBeCloseTo(0);
      expect(zeroToTwoPi((3 * Math.PI) as Radians)).toBeCloseTo(Math.PI);
      expect(zeroToTwoPi((4 * Math.PI) as Radians)).toBeCloseTo(0);
      expect(zeroToTwoPi((5 * Math.PI) as Radians)).toBeCloseTo(Math.PI);
    });

    it("should wrap negative angles to [0, 2π)", () => {
      expect(zeroToTwoPi((-Math.PI / 4) as Radians)).toBeCloseTo(
        (7 * Math.PI) / 4
      );
      expect(zeroToTwoPi((-Math.PI / 2) as Radians)).toBeCloseTo(
        (3 * Math.PI) / 2
      );
      expect(zeroToTwoPi(-Math.PI as Radians)).toBeCloseTo(Math.PI);
      expect(zeroToTwoPi((-2 * Math.PI) as Radians)).toBeCloseTo(0);
    });

    it("should handle very large positive angles", () => {
      expect(zeroToTwoPi((100 * Math.PI) as Radians)).toBeCloseTo(0);
      expect(zeroToTwoPi((101 * Math.PI) as Radians)).toBeCloseTo(Math.PI);
    });

    it("should handle very large negative angles", () => {
      // Note: Due to floating point precision, very large multiples may not be exact
      const result1 = zeroToTwoPi((-100 * Math.PI) as Radians);
      // Should be close to 0 or 2π (they're equivalent)
      expect(result1 < 0.01 || result1 > 2 * Math.PI - 0.01).toBe(true);
      expect(zeroToTwoPi((-101 * Math.PI) as Radians)).toBeCloseTo(Math.PI);
    });

    it("should handle angles just below 2π", () => {
      const almostTwoPi = 2 * Math.PI - 0.0001;
      expect(zeroToTwoPi(almostTwoPi as Radians)).toBeCloseTo(almostTwoPi);
    });

    it("should handle angles just above 0", () => {
      const justAboveZero = 0.0001;
      expect(zeroToTwoPi(justAboveZero as Radians)).toBeCloseTo(justAboveZero);
    });

    it("should be idempotent for angles in [0, 2π)", () => {
      const angle = (Math.PI / 3) as Radians;
      const normalized = zeroToTwoPi(angle);
      expect(zeroToTwoPi(normalized)).toBeCloseTo(normalized);
    });
  });

  describe("negativePiToPi", () => {
    it("should return 0 for angle 0", () => {
      expect(negativePiToPi(0 as Radians)).toBe(0);
    });

    it("should return the same angle for angles already in [-π, π)", () => {
      expect(negativePiToPi((-Math.PI / 2) as Radians)).toBeCloseTo(
        -Math.PI / 2
      );
      expect(negativePiToPi(0 as Radians)).toBeCloseTo(0);
      expect(negativePiToPi((Math.PI / 2) as Radians)).toBeCloseTo(Math.PI / 2);
    });

    it("should handle π boundary", () => {
      // π should stay as π (at the boundary)
      expect(negativePiToPi(Math.PI as Radians)).toBeCloseTo(Math.PI);
    });

    it("should wrap angles greater than π to negative", () => {
      expect(negativePiToPi(((3 * Math.PI) / 2) as Radians)).toBeCloseTo(
        -Math.PI / 2
      );
      expect(negativePiToPi(((7 * Math.PI) / 4) as Radians)).toBeCloseTo(
        -Math.PI / 4
      );
    });

    it("should wrap 2π to 0", () => {
      expect(negativePiToPi((2 * Math.PI) as Radians)).toBeCloseTo(0);
    });

    it("should wrap 3π to π", () => {
      // 3π normalized to [0, 2π) is π, and π stays as π in [-π, π]
      expect(negativePiToPi((3 * Math.PI) as Radians)).toBeCloseTo(Math.PI);
    });

    it("should wrap negative angles correctly", () => {
      expect(negativePiToPi((-2 * Math.PI) as Radians)).toBeCloseTo(0);
      // -3π normalized to [0, 2π) is π, which stays as π in [-π, π]
      expect(negativePiToPi((-3 * Math.PI) as Radians)).toBeCloseTo(Math.PI);
    });

    it("should handle very large positive angles", () => {
      expect(negativePiToPi((100 * Math.PI) as Radians)).toBeCloseTo(0);
      expect(negativePiToPi((100.5 * Math.PI) as Radians)).toBeCloseTo(
        Math.PI / 2
      );
    });

    it("should handle very large negative angles", () => {
      expect(negativePiToPi((-100 * Math.PI) as Radians)).toBeCloseTo(0);
      expect(negativePiToPi((-100.5 * Math.PI) as Radians)).toBeCloseTo(
        -Math.PI / 2
      );
    });

    it("should be idempotent for angles in [-π, π)", () => {
      const angle = (Math.PI / 3) as Radians;
      const normalized = negativePiToPi(angle);
      expect(negativePiToPi(normalized)).toBeCloseTo(normalized);
    });

    it("should handle angles just below π", () => {
      const almostPi = (Math.PI - 0.0001) as Radians;
      expect(negativePiToPi(almostPi)).toBeCloseTo(almostPi);
    });

    it("should handle angles just above π", () => {
      const justAbovePi = (Math.PI + 0.0001) as Radians;
      expect(negativePiToPi(justAbovePi)).toBeCloseTo(-(Math.PI - 0.0001), 4);
    });
  });

  describe("edge cases and relationships", () => {
    it("zeroToTwoPi and negativePiToPi should agree on [0, π]", () => {
      for (let i = 0; i <= 10; i++) {
        const angle = ((i / 10) * Math.PI) as Radians;
        expect(zeroToTwoPi(angle)).toBeCloseTo(negativePiToPi(angle));
      }
    });

    it("should handle floating point precision near boundaries", () => {
      const twoPi = (2 * Math.PI) as Radians;
      expect(zeroToTwoPi(twoPi - 1e-10)).toBeLessThan(twoPi);
      expect(zeroToTwoPi(twoPi + 1e-10)).toBeGreaterThanOrEqual(0);
    });
  });
});
