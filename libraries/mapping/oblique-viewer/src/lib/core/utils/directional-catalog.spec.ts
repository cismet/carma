import { describe, expect, it } from "vitest";
import type { Radians } from "@carma-units";
import type { ObliqueDataset, ObliqueDirectionalCatalog } from "../types";
import { resolveDirectionalCatalog } from "./directional-catalog";

const group = (
  id: string,
  sector: ObliqueDirectionalCatalog["sector"],
  cameraIds: string[],
  heading: number
): ObliqueDirectionalCatalog => ({
  id,
  sector,
  cameraIds,
  meanHeadingRad: heading as Radians,
  imageCount: 1,
  exteriorOrientationsURI: `/${id}.json`,
});
const series = (groups: ObliqueDirectionalCatalog[]) =>
  ({
    directionalCatalogs: groups,
    cameraIdToDirection: {
      EVEN: { "100": 0, RI: 2, LE: 0 },
      ODD: { "100": 2, RI: 0, LE: 2 },
    },
  } as unknown as ObliqueDataset);
describe("directional catalog priority", () => {
  it("uses legacy line parity when a rig camera occurs in opposite sectors", () => {
    const dataset = series([
      group("south", "S", ["100"], 3),
      group("north", "N", ["100"], 0),
    ]);
    expect(
      resolveDirectionalCatalog(dataset, { priorityImageId: "2_1_10003" })?.id
    ).toBe("north");
    expect(
      resolveDirectionalCatalog(dataset, { priorityImageId: "3_1_10003" })?.id
    ).toBe("south");
  });
  it("restores modern and qualified IDs by authoritative camera/flight-line parity", () => {
    const dataset = series([
      group("south", "S", ["RI", "LE"], 3),
      group("north", "N", ["RI", "LE"], 0),
    ]);
    expect(
      resolveDirectionalCatalog(dataset, {
        priorityImageId: "2026::RI_29_3398",
      })?.id
    ).toBe("north");
    expect(
      resolveDirectionalCatalog(dataset, { priorityImageId: "RI_28_3398" })?.id
    ).toBe("south");
    expect(
      resolveDirectionalCatalog(dataset, { priorityImageId: "LE06_7153" })?.id
    ).toBe("north");
  });
  it("uses explicit verified routing exceptions before majority parity with full camera IDs", () => {
    const north = {
      ...group("north", "N", ["O42_434S024481410408_skyup_RI"], 0),
      cameraPrefixes: ["RI"],
    };
    const south = {
      ...group("south", "S", ["O42_434S024481410408_skyup_RI"], 3),
      cameraPrefixes: ["RI"],
    };
    const dataset = series([north, south]);
    dataset.cameraIdToDirection = { EVEN: {}, ODD: {} };
    dataset.directionalCatalogPriority = {
      cameraLineParity: { EVEN: { RI: "south" }, ODD: { RI: "north" } },
      imageGroups: { RI_29_9999: "south" },
    };
    expect(
      resolveDirectionalCatalog(dataset, {
        priorityImageId: "RI_29_3403",
        priorityHeadingRad: 3 as Radians,
      })?.id
    ).toBe("north");
    expect(
      resolveDirectionalCatalog(dataset, {
        priorityImageId: "RI_28_3398",
        priorityHeadingRad: 0 as Radians,
      })?.id
    ).toBe("south");
    expect(
      resolveDirectionalCatalog(dataset, {
        priorityImageId: "RI_29_9999",
        priorityHeadingRad: 0 as Radians,
      })?.id
    ).toBe("south");
    expect(dataset.cameraIdToDirection).toEqual({ EVEN: {}, ODD: {} });
  });
  it("uses nearest measured heading across wraparound, without rig label or 90-degree buckets", () => {
    const dataset = series([
      group("different-year", "W", ["RI"], -3.12),
      group("other", "N", ["RI"], 0.1),
    ]);
    expect(
      resolveDirectionalCatalog(dataset, {
        priorityImageId: "unknown",
        priorityHeadingRad: 3.13 as Radians,
      })?.id
    ).toBe("different-year");
  });
  it("selects nadir only for the explicit camera view", () => {
    const dataset = series([
      group("nadir", "nadir", ["NA"], 0),
      group("oblique", "N", ["RI"], 0.5),
    ]);
    expect(
      resolveDirectionalCatalog(dataset, { priorityHeadingRad: 0 as Radians })
        ?.id
    ).toBe("oblique");
    expect(
      resolveDirectionalCatalog(dataset, { priorityCameraView: "nadir" })?.id
    ).toBe("nadir");
  });
});
