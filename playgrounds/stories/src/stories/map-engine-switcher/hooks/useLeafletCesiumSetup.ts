/**
 * Shared hook for initializing Leaflet + Cesium maps in stories
 * Handles terrain providers, map creation, and cleanup
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CesiumWidget,
  CesiumTerrainProvider,
  Cesium3DTileset,
  waitForRenderFrames,
} from "@carma/cesium";
import L from "leaflet";
import {
  initializeCesium,
  initializeTerrainProviders,
  loadTileset,
  type CesiumSetupOptions,
} from "../helpers/cesium-setup";
import {
  initializeLeaflet,
  type LeafletSetupOptions,
} from "../helpers/leaflet-setup";

export interface LeafletCesiumSetupOptions {
  cesium?: CesiumSetupOptions;
  leaflet?: LeafletSetupOptions;
}

export interface LeafletCesiumRefs {
  leafletContainerRef: React.RefObject<HTMLDivElement>;
  cesiumContainerRef: React.RefObject<HTMLDivElement>;
  leafletMapRef: React.MutableRefObject<L.Map | null>;
  cesiumWidgetRef: React.MutableRefObject<CesiumWidget | null>;
  tilesetRef: React.MutableRefObject<Cesium3DTileset | null>;
  terrainProvidersRef: React.MutableRefObject<{
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  }>;
}

export interface UseLeafletCesiumSetupReturn extends LeafletCesiumRefs {
  isLeafletReady: boolean;
  isCesiumReady: boolean;
  mapsInitialized: boolean;
  ensureCesiumReady: () => Promise<void>;
}

/**
 * Hook to set up Leaflet + Cesium maps with Wuppertal configuration
 *
 * @param options - Configuration options for Cesium and Leaflet
 * @returns Refs to containers and map instances, plus initialization state
 *
 * @example
 * const { leafletContainerRef, cesiumContainerRef, mapsInitialized, ... } = useLeafletCesiumSetup({
 *   cesium: { useBrowserRecommendedResolution: false }
 * });
 *
 * // Use in JSX:
 * <div ref={leafletContainerRef} />
 * <div ref={cesiumContainerRef} />
 */
export const useLeafletCesiumSetup = (
  options: LeafletCesiumSetupOptions = {}
): UseLeafletCesiumSetupReturn => {
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [isCesiumReady, setIsCesiumReady] = useState(false);

  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const cesiumWidgetRef = useRef<CesiumWidget | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const terrainProvidersRef = useRef<{
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  }>({ TERRAIN: null, SURFACE: null });
  const cesiumInitPromiseRef = useRef<Promise<void> | null>(null);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    const leafletContainer = leafletContainerRef.current;
    if (!leafletContainer || leafletMapRef.current) {
      return;
    }

    try {
      const leafletMap = initializeLeaflet(leafletContainer, options.leaflet);
      leafletMapRef.current = leafletMap;
      if (!isUnmountedRef.current) {
        setIsLeafletReady(true);
      }
    } catch (error) {
      console.error("Leaflet initialization error:", error);
    }
  }, [options.leaflet]);

  const ensureCesiumReady = useCallback(async () => {
    const widget = cesiumWidgetRef.current;
    if (widget && !widget.isDestroyed()) {
      if (!isCesiumReady && !isUnmountedRef.current) {
        setIsCesiumReady(true);
      }
      return;
    }

    if (cesiumInitPromiseRef.current) {
      await cesiumInitPromiseRef.current;
      return;
    }

    const cesiumContainer = cesiumContainerRef.current;
    if (!cesiumContainer) {
      throw new Error("Cesium story container is not mounted.");
    }

    const initPromise = (async () => {
      const providers = await initializeTerrainProviders(
        options.cesium?.terrainProviderUrl,
        options.cesium?.surfaceProviderUrl
      );
      terrainProvidersRef.current = providers;

      const nextWidget = initializeCesium(cesiumContainer, options.cesium);
      cesiumWidgetRef.current = nextWidget;

      await waitForRenderFrames(nextWidget.scene);

      if (!isUnmountedRef.current) {
        setIsCesiumReady(true);
      }

      const tileset = await loadTileset(nextWidget, options.cesium?.tilesetUrl);
      if (tileset) {
        tilesetRef.current = tileset;
      }
    })();

    cesiumInitPromiseRef.current = initPromise;

    try {
      await initPromise;
    } catch (error) {
      console.error("Cesium initialization error:", error);
      throw error;
    } finally {
      if (cesiumInitPromiseRef.current === initPromise) {
        cesiumInitPromiseRef.current = null;
      }
    }
  }, [
    isCesiumReady,
    options.cesium,
    options.cesium?.surfaceProviderUrl,
    options.cesium?.terrainProviderUrl,
    options.cesium?.tilesetUrl,
  ]);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;

      try {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }
      } catch (error) {
        console.error("Error cleaning up Leaflet:", error);
      }

      try {
        if (tilesetRef.current && !tilesetRef.current.isDestroyed()) {
          tilesetRef.current.destroy();
          tilesetRef.current = null;
        }
      } catch (error) {
        console.error("Error cleaning up tileset:", error);
      }

      try {
        if (cesiumWidgetRef.current && !cesiumWidgetRef.current.isDestroyed()) {
          cesiumWidgetRef.current.destroy();
          cesiumWidgetRef.current = null;
        }
      } catch (error) {
        console.error("Error cleaning up Cesium:", error);
      }
    };
  }, []);

  return {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    tilesetRef,
    terrainProvidersRef,
    isLeafletReady,
    isCesiumReady,
    mapsInitialized: isCesiumReady,
    ensureCesiumReady,
  };
};
