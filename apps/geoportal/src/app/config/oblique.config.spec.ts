import { afterEach, describe, expect, it, vi } from "vitest";
import { Easing } from "@carma-commons/math";

vi.mock("@carma-commons/resources", () => ({
  OBLIQUE_2024_FPRFC_GEOJSON_URI:
    "https://images.example/2024/metadata/fprfc.geojson",
  WUPP_LOD2_TILESET: { url: "https://tiles.example/lod2/tileset.json" },
  WUPP_MESH_2024: {
    url: "https://tiles.example/mesh2024/tileset.json",
    alternateUrls: ["https://tilesx.example/mesh2024/tileset.json"],
  },
}));
vi.mock("@carma-commons/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-commons/utils")>()),
  resolveDeployment: () => "pr",
}));

import { isAvailable } from "@carma-commons/utils";
import { obliqueFachzwilling } from "../constants/fachzwillinge/oblique";
import {
  OBLIQUE_BASE_TILESET_URLS,
  resolveObliqueViewerConfig,
} from "./oblique.config";
import {
  getFeatureFlagConfig,
  resolveGeoportalFeatureFlags,
} from "./featureFlags";

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
  return resolveGeoportalFeatureFlags(flagConfig);
};

afterEach(() => {
  window.location.hash = "";
  vi.unstubAllEnvs();
});

describe("oblique deployment route", () => {
  it("declares object views as a separate addon behind the next UI flag", () => {
    const entry = obliqueFachzwilling.addons?.find(
      (entry) =>
        typeof entry !== "string" &&
        "addon" in entry &&
        entry.addon === "obliqueObjectViews"
    );
    if (!entry || typeof entry === "string")
      throw new Error("Missing object views addon");
    expect(
      isAvailable(entry.availability, {
        deployment: "pr",
        featureFlags: resolveFlags("oblique"),
      })
    ).toBe(false);
    expect(
      isAvailable(entry.availability, {
        deployment: "pr",
        featureFlags: resolveFlags("obliqueng"),
      })
    ).toBe(true);
  });
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

  it.each([
    ["oblique", false],
    ["obliqueng", true],
    ["oblique.obliqueng", true],
    ["-oblique.obliqueng", true],
    ["oblique.-obliqueng", false],
  ])(
    "activates the viewer through %s with the correct UI generation",
    (flags, nextInterface) => {
      if (!viewerEntry || typeof viewerEntry === "string")
        throw new Error("Missing viewer addon");
      const context = {
        deployment: "pr" as const,
        featureFlags: resolveFlags(flags),
      };
      expect(isAvailable(viewerEntry.availability, context)).toBe(true);
      expect(context.featureFlags.featureFlagObliqueNextUi).toBe(nextInterface);
      const objects = obliqueFachzwilling.addons?.find(
        (entry) =>
          typeof entry !== "string" && entry.addon === "obliqueObjectViews"
      );
      if (!objects || typeof objects === "string")
        throw new Error("Missing object views addon");
      expect(isAvailable(objects.availability, context)).toBe(nextInterface);
      expect(context.featureFlags.featureFlagLibreMap).toBe(false);
    }
  );

  it("uses the canonical NG alias without retaining the obsolete short alias", () => {
    expect(flagConfig.featureFlagObliqueNextUi).toEqual({
      alias: "obliqueng",
      default: false,
    });
    expect(resolveFlags("olbng")).toMatchObject({
      featureFlagObliqueViewerAddon: false,
      featureFlagObliqueNextUi: false,
    });
    expect(resolveFlags("oblique.olbng")).toMatchObject({
      featureFlagObliqueViewerAddon: true,
      featureFlagObliqueNextUi: false,
    });
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

  it("leaves map-style gating to the shared route addon resolver", () => {
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
    // withDefaultAddons applies the global opt-in or the next-interface capability;
    // app.config.spec.ts checks both resolved paths. The raw declaration has no gate.
    expect(style.availability).toBeUndefined();
    expect(style.config).toEqual({ vectorBaseMap: true });
  });

  it("also accepts the established dot separator", () => {
    expect(resolveFlags("oblique.ng")).toMatchObject({
      featureFlagObliqueViewerAddon: true,
      featureFlagLibreMap: true,
    });
  });
});

describe("oblique imagery configuration", () => {
  it("restores the original delivered 2024 ground centers without overriding 2026", () => {
    expect(resolveObliqueViewerConfig().seriesOverrides).toEqual({
      "wuppertal-2024": {
        footprintsURI: "https://images.example/2024/metadata/fprfc.geojson",
        captureNavigationTopology: "flight-strip",
      },
    });
  });
  it("manages both published mesh endpoints with the same background switch", () => {
    expect(OBLIQUE_BASE_TILESET_URLS).toEqual([
      "https://tiles.example/mesh2024/tileset.json",
      "https://tilesx.example/mesh2024/tileset.json",
      "https://tiles.example/lod2/tileset.json",
    ]);
  });
  it.each(["/", prBase])(
    "loads server-owned series for %s without bundling metadata",
    (baseUrl) => {
      expect(resolveObliqueViewerConfig(baseUrl)).toMatchObject({
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

describe("legacy camera interaction profile", () => {
  it("retains Cesium timings and curves for entry, image flight, siblings, rotation and exit", () => {
    expect(resolveObliqueViewerConfig().animations).toEqual({
      enterObliqueMode: {
        duration: 2000,
        easingFunction: Easing.EXPONENTIAL_IN_OUT,
      },
      flyToExteriorOrientation: {
        duration: 800,
        easingFunction: Easing.QUADRATIC_IN,
      },
      flyToNextImage: {
        delay: 0,
        duration: 100,
        easingFunction: Easing.LINEAR_NONE,
      },
      flyToRotatedImage: {
        duration: 1800,
        easingFunction: Easing.CUBIC_IN_OUT,
      },
      rotateCamera: { duration: 1800, easingFunction: Easing.CUBIC_IN_OUT },
      leaveObliqueMode: { duration: 1100, easingFunction: Easing.CUBIC_IN_OUT },
    });
  });
});
