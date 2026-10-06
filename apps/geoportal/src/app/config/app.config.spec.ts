import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddonEntry } from "@carma-mapping/addons";

const state = vi.hoisted(() => ({
  context: {
    deployment: "pr" as const,
    featureFlags: {
      featureFlagMapStyle3d: false,
      featureFlagObliqueNextUi: false,
    },
  },
  workflows: ["flowField"] as AddonEntry[],
}));
vi.mock("./availability", () => ({ availabilityContext: state.context }));
vi.mock("./oblique.config", () => ({
  OBLIQUE_VIEWER_CONFIG: {},
  OBLIQUE_VIEWER_DEPLOYMENTS: ["localDev", "dev", "pr"],
}));
vi.mock("../constants/default-workflows", () => ({
  defaultWorkflowAddons: () => state.workflows,
}));
vi.mock("@carma-commons/resources", () => ({
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ: {},
  WUPP_LOD2_TILESET: {},
  WUPP_MESH_2024: {},
  WUPP_TERRAIN_PROVIDER: {},
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M: {},
}));
vi.mock("@carma-mapping/addons", () => ({
  getAddonKind: (entry: AddonEntry) =>
    typeof entry === "string"
      ? entry
      : "addon" in entry
      ? entry.addon
      : entry.kind,
  filterAddonsByAvailability: (entries: AddonEntry[]) =>
    entries.filter((entry) => {
      if (typeof entry === "string" || !entry.availability?.featureFlag)
        return true;
      return (
        state.context.featureFlags[
          entry.availability
            .featureFlag as keyof typeof state.context.featureFlags
        ] === true
      );
    }),
}));
vi.mock("@carma-mapping/annotations/core", () => ({
  ANNOTATION_SELECT_TOOL_ID: "select",
  ANNOTATION_TYPES: {},
}));
vi.mock("@carma-mapping/annotations/ui", () => ({
  DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS: [],
}));
vi.mock("cesium", () => ({ Rectangle: { fromDegrees: () => ({}) } }));

import { withDefaultAddons } from "./app.config";

const addonKind = (entry: AddonEntry) =>
  typeof entry === "string"
    ? entry
    : "addon" in entry
    ? entry.addon
    : entry.kind;
const declarations: AddonEntry[] = [
  { addon: "obliqueViewer", config: { startEnabled: true } },
  { addon: "mapStyle3d", config: { vectorBaseMap: true } },
  "addonManager",
  "shadowSimulation",
  "nearestFeature",
];

beforeEach(() => {
  state.context.featureFlags.featureFlagMapStyle3d = false;
  state.context.featureFlags.featureFlagObliqueNextUi = false;
});

describe("Geoportal default addons", () => {
  it("adds object views to the next UI only when the parent viewer is present", () => {
    state.context.featureFlags.featureFlagObliqueNextUi = true;
    const addons = withDefaultAddons(declarations, "/oblique").map(addonKind);
    expect(addons).toContain("obliqueViewer");
    expect(addons).toContain("obliqueObjectViews");
    expect(withDefaultAddons([], "/addons").map(addonKind)).not.toContain(
      "obliqueObjectViews"
    );
  });

  it("drops a declared object-views addon when the next UI flag is off", () => {
    expect(
      withDefaultAddons(
        [...declarations, "obliqueObjectViews"],
        "/oblique"
      ).map(addonKind)
    ).not.toContain("obliqueObjectViews");
  });
  it("limits Oblique to its viewer and required camera/terrain services", () => {
    const addons = withDefaultAddons(declarations, "/oblique");
    expect(addons.map(addonKind)).toEqual([
      "cameraRestriction",
      "libreTerrain",
      "obliqueViewer",
    ]);
    expect(addons.at(-1)).toBe(declarations[0]);
  });

  it("allows the opt-in map style without inheriting workflows or layer tools", () => {
    state.context.featureFlags.featureFlagMapStyle3d = true;
    expect(withDefaultAddons(declarations, "/oblique").map(addonKind)).toEqual([
      "cameraRestriction",
      "libreTerrain",
      "obliqueViewer",
      "mapStyle3d",
    ]);
  });

  it.each([undefined, "/", "/addons", "/pm-show"])(
    "keeps unrelated addons on %s",
    (route) => {
      expect(withDefaultAddons(declarations, route).map(addonKind)).toContain(
        "flowField"
      );
      expect(withDefaultAddons(declarations, route).map(addonKind)).toContain(
        "addonManager"
      );
      expect(withDefaultAddons(declarations, route).map(addonKind)).toContain(
        "shadowSimulation"
      );
      expect(
        withDefaultAddons(declarations, route).map(addonKind)
      ).not.toContain("mapStyle3d");
    }
  );
});
