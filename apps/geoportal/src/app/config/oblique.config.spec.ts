import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-commons/resources", () => ({
  WUPP_LOD2_TILESET: { url: "https://tiles.example/lod2/tileset.json" },
  WUPP_MESH_2024: { url: "https://tiles.example/mesh2024/tileset.json" },
}));
vi.mock("@carma-commons/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-commons/utils")>()),
  resolveDeployment: () => "pr",
}));

import { isAvailable } from "@carma-commons/utils";
import { resolveFeatureFlags } from "@carma-providers/feature-flag";
import { obliqueFachzwilling } from "../constants/fachzwillinge/oblique";
import { resolveObliqueViewerConfig } from "./oblique.config";
import { getFeatureFlagConfig } from "./featureFlags";

const prBase = "/carma-pr-deployments/822/geoportal/";
const flagConfig = getFeatureFlagConfig("pr");

const viewerEntry = obliqueFachzwilling.addons?.find(
  (entry) =>
    typeof entry !== "string" &&
    "addon" in entry &&
    entry.addon === "obliqueViewer"
);

const resolveFlags = (flags: string) => {
  window.location.hash = `/oblique?ff=${flags}`;
  return resolveFeatureFlags(flagConfig);
};

afterEach(() => {
  window.location.hash = "";
  vi.unstubAllEnvs();
});

describe("oblique deployment route", () => {
  it("opens on the PR deployment with only the oblique flag", () => {
    const context = {
      deployment: "pr" as const,
      featureFlags: resolveFlags("oblique"),
    };
    expect(isAvailable(obliqueFachzwilling.availability, context)).toBe(true);
    expect(viewerEntry).toBeDefined();
    if (!viewerEntry || typeof viewerEntry === "string")
      throw new Error("Missing viewer addon");
    expect(isAvailable(viewerEntry.availability, context)).toBe(true);
    expect(viewerEntry.config).toMatchObject({ startEnabled: true });
    expect(context.featureFlags.featureFlagLibreMap).toBe(false);
  });

  it("keeps the addon opt-in and unavailable on live", () => {
    if (!viewerEntry || typeof viewerEntry === "string")
      throw new Error("Missing viewer addon");
    expect(
      isAvailable(viewerEntry.availability, {
        deployment: "pr",
        featureFlags: resolveFlags(""),
      })
    ).toBe(false);
    expect(
      isAvailable(obliqueFachzwilling.availability, {
        deployment: "live",
        featureFlags: resolveFlags("oblique"),
      })
    ).toBe(false);
  });

  it("requires an explicit mapstyle3d opt-in independently of the viewer", () => {
    const style = obliqueFachzwilling.addons?.find(
      (entry) =>
        typeof entry !== "string" &&
        "addon" in entry &&
        entry.addon === "mapStyle3d"
    );
    if (!style || typeof style === "string")
      throw new Error("Missing style addon");
    expect(flagConfig.featureFlagMapStyle3d).toEqual({
      alias: "mapstyle3d",
      default: false,
    });
    expect(
      isAvailable(style.availability, {
        deployment: "pr",
        featureFlags: resolveFlags("oblique"),
      })
    ).toBe(false);
    expect(
      isAvailable(style.availability, {
        deployment: "pr",
        featureFlags: resolveFlags("oblique.mapstyle3d"),
      })
    ).toBe(true);
  });

  it("also accepts the established dot separator", () => {
    expect(resolveFlags("oblique.ng")).toMatchObject({
      featureFlagObliqueViewerAddon: true,
      featureFlagLibreMap: true,
    });
  });
});

describe("oblique imagery configuration", () => {
  it.each(["/", prBase])(
    "loads server-owned series for %s without bundling metadata",
    (baseUrl) => {
      expect(resolveObliqueViewerConfig(baseUrl)).toEqual({
        seriesConfigURI: "https://wupp-oblique.cismet.de/series-config.json",
      });
      expect(resolveObliqueViewerConfig(baseUrl).series).toBeUndefined();
    }
  );

  it("loads the authored mesh style below the deployment base path", async () => {
    vi.stubEnv("BASE_URL", prBase);
    vi.resetModules();
    const config = await import("./oblique.config");
    expect(config.OBLIQUE_MESH_2024_STYLE_URI).toBe(
      `${prBase}data/mesh2024-cesium-parity.style.json`
    );
  });
});
