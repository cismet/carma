import { useEffect, type MutableRefObject } from "react";
import type {
  ImageryLayer,
  CesiumTerrainProvider,
  Scene,
  Cesium3DTileset,
} from "cesium";

import {
  loadCesiumImageryLayer,
  loadCesiumTerrainProvider,
  type ProviderConfig,
} from "../../../utils/cesiumProviders";
import {
  loadTileset,
  type TilesetConfigs,
} from "../../../utils/cesiumTilesetProviders";

/**
 * Loads the imagery provider configuration
 */
export const useImageryProviderLoader = ({
  providerConfig,
  imageryLayerRef,
  isValidViewer,
}: {
  providerConfig: ProviderConfig;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
  isValidViewer: () => boolean;
}) => {
  useEffect(() => {
    if (providerConfig.imageryProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumImageryLayer(
        imageryLayerRef,
        providerConfig.imageryProvider,
        signal
      );

      return () => {
        !isValidViewer() && abortController.abort();
      };
    } else {
      console.info("[CESIUM|CONTEXT] No imagery provider configured");
    }
  }, [providerConfig.imageryProvider, isValidViewer, imageryLayerRef]);
};

/**
 * Adds imagery layer to scene when loaded
 */
export const useImageryLayer = ({
  isViewerReady,
  sceneRef,
  imageryLayerRef,
}: {
  isViewerReady: boolean;
  sceneRef: MutableRefObject<Scene | null>;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
}) => {
  useEffect(() => {
    if (!isViewerReady || !sceneRef.current || !imageryLayerRef.current) {
      return;
    }

    const scene = sceneRef.current;
    const imageryLayer = imageryLayerRef.current;

    // Check if layer is already in the collection
    let alreadyAdded = false;
    for (let i = 0; i < scene.imageryLayers.length; i++) {
      if (scene.imageryLayers.get(i) === imageryLayer) {
        alreadyAdded = true;
        break;
      }
    }

    if (!alreadyAdded && !imageryLayer.isDestroyed()) {
      console.debug("[CESIUM|CONTEXT] Adding imagery layer to scene");
      scene.imageryLayers.add(imageryLayer);
      // Start hidden - will be shown by secondary style
      imageryLayer.show = false;
    }
  }, [isViewerReady, sceneRef, imageryLayerRef]);
};

/**
 * Loads terrain provider
 */
export const useTerrainProviderLoader = ({
  providerConfig,
  terrainProviderRef,
  isViewerReady,
  isValidViewer,
}: {
  providerConfig: ProviderConfig;
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  isViewerReady: boolean;
  isValidViewer: () => boolean;
}) => {
  useEffect(() => {
    if (!isViewerReady) return;

    const abortController = new AbortController();
    const { signal } = abortController;

    loadCesiumTerrainProvider(
      terrainProviderRef,
      providerConfig.terrainProvider.url,
      signal
    );

    return () => {
      !isValidViewer() && abortController.abort();
    };
  }, [
    providerConfig.terrainProvider.url,
    isViewerReady,
    isValidViewer,
    terrainProviderRef,
  ]);
};

/**
 * Loads surface provider
 */
export const useSurfaceProviderLoader = ({
  providerConfig,
  surfaceProviderRef,
  isViewerReady,
  isValidViewer,
}: {
  providerConfig: ProviderConfig;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  isViewerReady: boolean;
  isValidViewer: () => boolean;
}) => {
  useEffect(() => {
    if (!isViewerReady) return;

    if (providerConfig.surfaceProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumTerrainProvider(
        surfaceProviderRef,
        providerConfig.surfaceProvider.url,
        signal
      );

      return () => {
        !isValidViewer() && abortController.abort();
      };
    }
  }, [
    providerConfig.surfaceProvider,
    isViewerReady,
    isValidViewer,
    surfaceProviderRef,
  ]);
};

/**
 * Loads primary tileset
 */
export const usePrimaryTilesetLoader = ({
  tilesetConfigs,
  primaryTilesetRef,
  isViewerReady,
  isValidViewer,
}: {
  tilesetConfigs: TilesetConfigs;
  primaryTilesetRef: MutableRefObject<Cesium3DTileset | null>;
  isViewerReady: boolean;
  isValidViewer: () => boolean;
}) => {
  useEffect(() => {
    if (tilesetConfigs.primary && isViewerReady) {
      const fetchPrimary = async () => {
        console.debug(
          "[CESIUM|DEBUG] Loading primary tileset",
          tilesetConfigs.primary
        );
        primaryTilesetRef.current = await loadTileset(tilesetConfigs.primary);
        console.debug(
          "[CESIUM|DEBUG] Loaded primary tileset",
          primaryTilesetRef.current
        );
      };
      fetchPrimary().catch(console.error);
    } else {
      console.debug("[CESIUM|DEBUG] No primary tileset configured");
    }

    return () => {
      const t = primaryTilesetRef.current;
      if (t && !t.isDestroyed() && !isValidViewer()) {
        console.debug("[CESIUM|DEBUG] Destroying primary tileset");
        t.destroy();
        primaryTilesetRef.current = null;
      }
    };
  }, [tilesetConfigs.primary, isViewerReady, isValidViewer, primaryTilesetRef]);
};

/**
 * Loads secondary tileset
 */
export const useSecondaryTilesetLoader = ({
  tilesetConfigs,
  secondaryTilesetRef,
  isViewerReady,
  isValidViewer,
}: {
  tilesetConfigs: TilesetConfigs;
  secondaryTilesetRef: MutableRefObject<Cesium3DTileset | null>;
  isViewerReady: boolean;
  isValidViewer: () => boolean;
}) => {
  useEffect(() => {
    if (tilesetConfigs.secondary && isViewerReady && isValidViewer()) {
      const fetchSecondary = async () => {
        console.debug(
          "[CESIUM|DEBUG] Loading secondary tileset",
          tilesetConfigs.secondary
        );
        secondaryTilesetRef.current = await loadTileset(
          tilesetConfigs.secondary!
        );
        console.debug(
          "[CESIUM|DEBUG] Loaded secondary tileset",
          secondaryTilesetRef.current
        );
      };
      fetchSecondary().catch(console.error);
    } else {
      console.debug("[CESIUM|DEBUG] No secondary tileset configured");
    }

    return () => {
      const t = secondaryTilesetRef.current;
      if (t && !t.isDestroyed() && !isValidViewer()) {
        console.debug("[CESIUM|DEBUG] Destroying secondary tileset");
        t.destroy();
        secondaryTilesetRef.current = null;
      }
    };
  }, [
    tilesetConfigs.secondary,
    isViewerReady,
    isValidViewer,
    secondaryTilesetRef,
  ]);
};
