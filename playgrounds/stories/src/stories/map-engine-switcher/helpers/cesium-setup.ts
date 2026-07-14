import {
  CesiumWidget,
  CesiumTerrainProvider,
  Cartesian3,
  Cesium3DTileset,
  type Scene,
} from "@carma-cesium";
import {
  createMinimalCesiumWidget,
  waitForRenderFrames,
} from "@carma-mapping/engines/cesium/core";
import { degToRadNumeric } from "@carma-units";
import {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPP_MESH_2024,
  WUPPERTAL,
} from "@carma-commons/resources";
import {
  readStoryCesiumScene,
  requestStoryCesiumRender,
} from "../../shared/cesiumRuntimeGuards";

const CESIUM_PATHNAME = "__cesium__";

const STORYBOOK_TERRAIN_PROXY_BASE = "/__wupp_terrain__";
const STORYBOOK_3D_PROXY_BASE = "/__wupp_3d__";

if (typeof window !== "undefined") {
  (window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = new URL(
    `${CESIUM_PATHNAME}/`,
    document.baseURI
  ).toString();
}

const toStorybookProxyUrl = (url: string, proxyBase: string): string => {
  if (!import.meta.env.DEV) return url;

  try {
    const parsed = new URL(url);
    return `${proxyBase}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

const DEFAULT_TERRAIN_PROVIDER_URL = toStorybookProxyUrl(
  WUPP_TERRAIN_PROVIDER.url,
  STORYBOOK_TERRAIN_PROXY_BASE
);

const DEFAULT_SURFACE_PROVIDER_URL = toStorybookProxyUrl(
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url,
  STORYBOOK_TERRAIN_PROXY_BASE
);

const DEFAULT_TILESET_URL = toStorybookProxyUrl(
  WUPP_MESH_2024.url,
  STORYBOOK_3D_PROXY_BASE
);

export interface CesiumSetupOptions {
  useBrowserRecommendedResolution?: boolean;
  terrainProviderUrl?: string;
  surfaceProviderUrl?: string;
  tilesetUrl?: string;
  showRenderLoopErrors?: boolean;
  loadTerrain?: boolean;
  loadTileset?: boolean;
}

export interface CesiumSetupResult {
  widget: CesiumWidget;
  terrainProviders: {
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  };
  tileset: Cesium3DTileset | null;
}

/**
 * Initialize terrain providers
 */
export const initializeTerrainProviders = async (
  terrainProviderUrl: string = DEFAULT_TERRAIN_PROVIDER_URL,
  surfaceProviderUrl: string = DEFAULT_SURFACE_PROVIDER_URL
): Promise<{
  TERRAIN: CesiumTerrainProvider | null;
  SURFACE: CesiumTerrainProvider | null;
}> => {
  const providers = {
    TERRAIN: null as CesiumTerrainProvider | null,
    SURFACE: null as CesiumTerrainProvider | null,
  };

  try {
    providers.TERRAIN = await CesiumTerrainProvider.fromUrl(terrainProviderUrl);
    console.log("[TERRAIN] TERRAIN provider initialized");
  } catch (error) {
    console.warn("TERRAIN provider failed:", error);
  }

  try {
    providers.SURFACE = await CesiumTerrainProvider.fromUrl(surfaceProviderUrl);
    console.log("[TERRAIN] SURFACE provider initialized");
  } catch (error) {
    console.warn("SURFACE provider failed:", error);
  }

  return providers;
};

/**
 * Load 3D tileset for Cesium widget
 */
export const loadTileset = async (
  widget: CesiumWidget,
  tilesetUrl: string = DEFAULT_TILESET_URL
): Promise<Cesium3DTileset | null> => {
  const scene = readStoryCesiumScene(widget);
  if (!scene) {
    return null;
  }

  try {
    await waitForRenderFrames(scene as Scene);

    const readySceneForLoad = readStoryCesiumScene(widget);
    if (!readySceneForLoad) {
      return null;
    }

    const tileset = await Cesium3DTileset.fromUrl(tilesetUrl, {
      preloadWhenHidden: false,
      scene: readySceneForLoad,
      shadows: 0,
      enableCollision: false,
      maximumScreenSpaceError: 6,
      skipLevelOfDetail: true,
      skipScreenSpaceErrorFactor: 128,
      baseScreenSpaceError: 4096,
    });

    const readyScene = readStoryCesiumScene(widget);
    if (readyScene) {
      readyScene.primitives.add(tileset);
      requestStoryCesiumRender(readyScene);
      console.log("Tileset loaded");
      return tileset;
    }
  } catch (error) {
    console.warn("3D Tileset failed to load:", error);
  }

  return null;
};

/**
 * Initialize Cesium widget with configuration
 */
export const initializeCesium = (
  container: HTMLDivElement,
  options: CesiumSetupOptions = {}
): CesiumWidget => {
  const {
    // Match the geoportal's Cesium widget: render at physical device pixels
    // (DPR) so the canvas is sharp on hi-dpi displays instead of blurry.
    useBrowserRecommendedResolution = false,
    showRenderLoopErrors = false,
  } = options;

  // Create Cesium widget with options
  const widget = createMinimalCesiumWidget(container, {
    requestRenderMode: true,
    useBrowserRecommendedResolution,
    showRenderLoopErrors,
  });
  widget.scene.requestRenderMode = true;
  widget.scene.rethrowRenderErrors = false;

  // Position camera over Wuppertal
  const position = Cartesian3.fromDegrees(
    WUPPERTAL.position.longitude,
    WUPPERTAL.position.latitude - 0.003,
    500
  );
  widget.camera.setView({
    destination: position,
    orientation: {
      heading: degToRadNumeric(0),
      pitch: degToRadNumeric(-45),
      roll: 0,
    },
  });

  return widget;
};

/**
 * Complete Cesium setup with terrain and tileset
 */
export const setupCesium = async (
  container: HTMLDivElement,
  options: CesiumSetupOptions = {}
): Promise<CesiumSetupResult> => {
  const {
    terrainProviderUrl = DEFAULT_TERRAIN_PROVIDER_URL,
    surfaceProviderUrl = DEFAULT_SURFACE_PROVIDER_URL,
    tilesetUrl = DEFAULT_TILESET_URL,
    loadTerrain = true,
    loadTileset: shouldLoadTileset = true,
  } = options;

  // Initialize widget
  const widget = initializeCesium(container, options);

  // Initialize terrain providers (async, don't block)
  const terrainProvidersPromise = loadTerrain
    ? initializeTerrainProviders(terrainProviderUrl, surfaceProviderUrl)
    : Promise.resolve({
        TERRAIN: null,
        SURFACE: null,
      });

  // Load tileset (async, don't block)
  const tilesetPromise = shouldLoadTileset
    ? loadTileset(widget, tilesetUrl)
    : Promise.resolve(null);

  // Wait for both
  const [terrainProviders, tileset] = await Promise.all([
    terrainProvidersPromise,
    tilesetPromise,
  ]);

  return {
    widget,
    terrainProviders,
    tileset,
  };
};
