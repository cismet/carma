import { beforeEach, describe, expect, it, vi } from "vitest";
import { OBLIQUE_LAYER_ID } from "@carma-mapping/addons";
import type { LayerStackEntry } from "@carma-mapping/layers";

const findRoute = vi.hoisted(() => vi.fn());
vi.mock("@carma-mapping/addons", () => ({
  OBLIQUE_LAYER_ID: "__obliqueViewer__",
}));
vi.mock("@carma-mapping/layers", () => ({
  entryHasInfoView: (entry: LayerStackEntry) =>
    !entry.skipSelection || entry.hasInfoView === true,
}));
vi.mock("../../constants/fachzwillinge", () => ({
  findFachzwillingByPathname: findRoute,
}));

import {
  findMobileObliqueEntry,
  isMobileObliqueRouteAvailable,
} from "./mobile-oblique-navigation";

const layer = (id: string, hasInfoView = true): LayerStackEntry =>
  ({
    id,
    title: id,
    type: "object",
    visible: true,
    skipSelection: true,
    hasInfoView,
  } as LayerStackEntry);

describe("mobile Oblique navigation", () => {
  beforeEach(() => findRoute.mockReset());

  it("offers the route only when the canonical route registry includes it", () => {
    findRoute
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ path: "oblique" });

    expect(isMobileObliqueRouteAvailable()).toBe(false);
    expect(isMobileObliqueRouteAvailable()).toBe(true);
    expect(findRoute).toHaveBeenCalledWith("/oblique");
  });

  it("targets only the Oblique info row and leaves ordinary layer lists alone", () => {
    const ordinary = layer("ordinary");
    const oblique = layer(OBLIQUE_LAYER_ID);
    const entries = [ordinary, oblique];

    expect(findMobileObliqueEntry([ordinary], "/oblique")).toBeUndefined();
    expect(findMobileObliqueEntry(entries, "/")).toBeUndefined();
    expect(findMobileObliqueEntry(entries, "/oblique")).toBe(oblique);
    expect(
      findMobileObliqueEntry(
        [ordinary, layer(OBLIQUE_LAYER_ID, false)],
        "/oblique"
      )
    ).toBeUndefined();
    expect(entries).toEqual([ordinary, oblique]);
  });
});
