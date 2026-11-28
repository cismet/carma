import { describe, expect, it } from "vitest";

import { ADDON_MAP_VIEW, isAddonInMapView } from "./addon-map-views";

const threeDOnly = {
  kind: "shadowSimulation",
  mapViews: [ADDON_MAP_VIEW.THREE_D],
};

describe("isAddonInMapView", () => {
  it("keeps an entry limited to 3D in the 3D view only", () => {
    expect(isAddonInMapView(threeDOnly, ADDON_MAP_VIEW.THREE_D)).toBe(true);
    expect(isAddonInMapView(threeDOnly, ADDON_MAP_VIEW.FLAT)).toBe(false);
  });

  it("keeps entries without mapViews and bare kinds in every view", () => {
    for (const view of [ADDON_MAP_VIEW.FLAT, ADDON_MAP_VIEW.THREE_D]) {
      expect(isAddonInMapView({ kind: "attribution" }, view)).toBe(true);
      expect(isAddonInMapView("attribution", view)).toBe(true);
    }
  });

  it("keeps every entry when the host reports no view", () => {
    expect(isAddonInMapView(threeDOnly, undefined)).toBe(true);
  });

  it("drops an entry whose list is empty", () => {
    expect(
      isAddonInMapView({ kind: "attribution", mapViews: [] }, "3d")
    ).toBe(false);
  });
});
