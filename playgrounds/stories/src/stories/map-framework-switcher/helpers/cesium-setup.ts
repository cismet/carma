/**
 * Cesium initialization helpers for stories
 */

import {
  createMinimalCesiumWidget,
  CesiumWidget,
  CesiumTerrainProvider,
  Cartesian3,
  Cesium3DTileset,
} from "@carma/cesium";
import { degToRadNumeric } from "@carma/units/helpers";
import {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPP_MESH_2024,
  WUPPERTAL,
} from "@carma-commons/resources";

export interface CesiumSetupOptions {
  useBrowserRecommendedResolution?: boolean;
  terrainProviderUrl?: string;
  surfaceProviderUrl?: string;
  tilesetUrl?: string;
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
  terrainProviderUrl: string = WUPP_TERRAIN_PROVIDER.url,
  surfaceProviderUrl: string = WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url
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
  tilesetUrl: string = WUPP_MESH_2024.url
): Promise<Cesium3DTileset | null> => {
  try {
    const tileset = await Cesium3DTileset.fromUrl(tilesetUrl, {
      preloadWhenHidden: false,
      scene: widget.scene,
      shadows: 0,
      enableCollision: false,
      maximumScreenSpaceError: 6,
      skipLevelOfDetail: true,
      skipScreenSpaceErrorFactor: 128,
      baseScreenSpaceError: 4096,
    });

    if (widget.scene && !widget.isDestroyed()) {
      widget.scene.primitives.add(tileset);
      widget.scene.requestRender();
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
  const { useBrowserRecommendedResolution = true } = options;

  // Create Cesium widget with options
  const widget = createMinimalCesiumWidget(container, {
    useBrowserRecommendedResolution,
  });

  // Position camera over Wuppertal
  const position = Cartesian3.fromDegrees(
    WUPPERTAL.position.longitude,
    WUPPERTAL.position.latitude,
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
    terrainProviderUrl = WUPP_TERRAIN_PROVIDER.url,
    surfaceProviderUrl = WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url,
    tilesetUrl = WUPP_MESH_2024.url,
  } = options;

  // Initialize widget
  const widget = initializeCesium(container, options);

  // Initialize terrain providers (async, don't block)
  const terrainProvidersPromise = initializeTerrainProviders(
    terrainProviderUrl,
    surfaceProviderUrl
  );

  // Load tileset (async, don't block)
  const tilesetPromise = loadTileset(widget, tilesetUrl);

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
