import { describe, it, expect } from "vitest";
import { normalizeCrsCode, getManagedCrs } from "./utils";
import { ManagedProjections } from "./managed-projections";

describe("CRS utilities", () => {
  describe("normalizeCrsCode", () => {
    it("should handle EPSG:XXXX format", () => {
      expect(normalizeCrsCode("EPSG:4326")).toBe("EPSG:4326");
      expect(normalizeCrsCode("EPSG:3857")).toBe("EPSG:3857");
      expect(normalizeCrsCode("EPSG:25832")).toBe("EPSG:25832");
    });

    it("should handle epsg:XXXX format (lowercase)", () => {
      expect(normalizeCrsCode("epsg:4326")).toBe("EPSG:4326");
      expect(normalizeCrsCode("epsg:3857")).toBe("EPSG:3857");
      expect(normalizeCrsCode("epsg:25832")).toBe("EPSG:25832");
    });

    it("should handle EPSGXXXX format (no colon)", () => {
      expect(normalizeCrsCode("EPSG4326")).toBe("EPSG:4326");
      expect(normalizeCrsCode("EPSG3857")).toBe("EPSG:3857");
      expect(normalizeCrsCode("EPSG25832")).toBe("EPSG:25832");
    });

    it("should handle epsgXXXX format (lowercase, no colon)", () => {
      expect(normalizeCrsCode("epsg4326")).toBe("EPSG:4326");
      expect(normalizeCrsCode("epsg3857")).toBe("EPSG:3857");
      expect(normalizeCrsCode("epsg25832")).toBe("EPSG:25832");
    });

    it("should handle plain numeric code strings", () => {
      expect(normalizeCrsCode("4326")).toBe("EPSG:4326");
      expect(normalizeCrsCode("3857")).toBe("EPSG:3857");
      expect(normalizeCrsCode("25832")).toBe("EPSG:25832");
    });

    it("should handle numeric codes", () => {
      expect(normalizeCrsCode(4326)).toBe("EPSG:4326");
      expect(normalizeCrsCode(3857)).toBe("EPSG:3857");
      expect(normalizeCrsCode(25832)).toBe("EPSG:25832");
    });

    it("should handle mixed case", () => {
      expect(normalizeCrsCode("EpSg:4326")).toBe("EPSG:4326");
      expect(normalizeCrsCode("ePsG3857")).toBe("EPSG:3857");
    });

    it("should trim whitespace", () => {
      expect(normalizeCrsCode("  4326  ")).toBe("EPSG:4326");
      expect(normalizeCrsCode(" EPSG:3857 ")).toBe("EPSG:3857");
      expect(normalizeCrsCode("  epsg25832  ")).toBe("EPSG:25832");
    });
  });

  describe("getManagedCrs", () => {
    it("should return managed CRS for valid EPSG:XXXX strings", () => {
      expect(getManagedCrs("EPSG:4326")).toBe(ManagedProjections.EPSG4326);
      expect(getManagedCrs("EPSG:3857")).toBe(ManagedProjections.EPSG3857);
      expect(getManagedCrs("EPSG:25832")).toBe(ManagedProjections.EPSG25832);
    });

    it("should return managed CRS for numeric codes", () => {
      expect(getManagedCrs(4326)).toBe(ManagedProjections.EPSG4326);
      expect(getManagedCrs(3857)).toBe(ManagedProjections.EPSG3857);
      expect(getManagedCrs(25832)).toBe(ManagedProjections.EPSG25832);
    });

    it("should return managed CRS for string numeric codes", () => {
      expect(getManagedCrs("4326")).toBe(ManagedProjections.EPSG4326);
      expect(getManagedCrs("3857")).toBe(ManagedProjections.EPSG3857);
      expect(getManagedCrs("25832")).toBe(ManagedProjections.EPSG25832);
    });

    it("should return managed CRS for lowercase formats", () => {
      expect(getManagedCrs("epsg:4326")).toBe(ManagedProjections.EPSG4326);
      expect(getManagedCrs("epsg4326")).toBe(ManagedProjections.EPSG4326);
    });

    it("should throw error for unsupported CRS", () => {
      expect(() => getManagedCrs("EPSG:2154")).toThrow(
        "Unsupported CRS: EPSG:2154"
      );
      expect(() => getManagedCrs("31466")).toThrow(
        "Unsupported CRS: EPSG:31466"
      );
      expect(() => getManagedCrs(4269)).toThrow("Unsupported CRS: EPSG:4269");
    });

    it("should throw error with list of supported projections", () => {
      try {
        getManagedCrs("9999");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("EPSG:4326");
        expect((error as Error).message).toContain("EPSG:3857");
        expect((error as Error).message).toContain("EPSG:25832");
      }
    });

    it("should handle whitespace in input", () => {
      expect(getManagedCrs("  4326  ")).toBe(ManagedProjections.EPSG4326);
      expect(getManagedCrs(" EPSG:3857 ")).toBe(ManagedProjections.EPSG3857);
    });
  });
});
