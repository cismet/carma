import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-commons/resources", () => ({
  WUPP_LOD2_TILESET: { url: "https://tiles.example/lod2/tileset.json" },
  WUPP_MESH_2024: { url: "https://tiles.example/mesh2024/tileset.json" },
}));
vi.mock("@carma-mapping/oblique-viewer", () => ({
  WUPPERTAL_OBLIQUE_2024: {
    id: "wuppertal-2024",
    enabledByDefault: true,
    exteriorOrientationsURI: "https://images.example/2024/orientation.json",
    previewPath: "https://images.example/2024",
  },
  WUPPERTAL_OBLIQUE_2026: {
    id: "wuppertal-2026",
    enabledByDefault: false,
    exteriorOrientationsURI: "https://images.example/2026/orientation.json",
    previewPath: "https://images.example/2026",
    allowUnverifiedSourceHeight: false,
  },
  WUPPERTAL_2026_RATHAUS_DATASET: {
    id: "wuppertal-2026-rathaus",
    enabledByDefault: false,
    exteriorOrientationsURI: "/oblique/2026-rathaus/metadata.json",
    previewPath: "/oblique/2026-rathaus",
    allowUnverifiedSourceHeight: false,
  },
}));
vi.mock("@carma-commons/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-commons/utils")>()),
  resolveDeployment: () => "pr",
}));

import { isAvailable } from "@carma-commons/utils";
import { resolveFeatureFlags } from "@carma-providers/feature-flag";
import { obliqueFachzwilling } from "../constants/fachzwillinge/oblique";
import { resolveObliqueViewerConfig } from "./oblique.config";

const prBase = "/carma-pr-deployments/822/geoportal/";
const flagConfig = {
  featureFlagObliqueViewerAddon: { alias: "oblique", default: false },
  featureFlagLibreMap: { alias: "ng", default: false },
};

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

  it("also accepts the established dot separator", () => {
    expect(resolveFlags("oblique.ng")).toEqual({
      featureFlagObliqueViewerAddon: true,
      featureFlagLibreMap: true,
    });
  });
});

describe("oblique imagery configuration", () => {
  it("retains the original TIFF bridge only for localhost development", () => {
    const config = resolveObliqueViewerConfig("localDev", "/");
    expect(config.devOriginalsBaseURI).toBe("http://127.0.0.1:8926");
    expect(
      config.series?.find((series) => series.id === "wuppertal-2026")
    ).toMatchObject({
      enabledByDefault: true,
      exteriorOrientationsURI:
        "http://127.0.0.1:8926/metadata/wuppertal-2026.json",
      allowUnverifiedSourceHeight: true,
    });
  });

  it.each(["dev", "pr", "live", null] as const)(
    "uses public imagery on %s and enables only 2024",
    (deployment) => {
      const config = resolveObliqueViewerConfig(deployment, prBase);
      expect(config.devOriginalsBaseURI).toBeUndefined();
      expect(
        config.series
          ?.filter((series) => series.enabledByDefault)
          .map((series) => series.id)
      ).toEqual(["wuppertal-2024"]);
      expect(JSON.stringify(config)).not.toContain("127.0.0.1");
      expect(
        config.series?.some((series) => series.allowUnverifiedSourceHeight)
      ).toBe(false);
      expect(
        config.series?.find((series) => series.id === "wuppertal-2026-rathaus")
      ).toMatchObject({
        exteriorOrientationsURI: `${prBase}oblique/2026-rathaus/metadata.json`,
        previewPath: `${prBase}oblique/2026-rathaus`,
      });
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
