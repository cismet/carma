/**
 * Shared hook for initializing Leaflet + Cesium maps in stories
 * Handles terrain providers, map creation, and cleanup
 */

import { useEffect, useRef, useState } from "react";
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
  mapsInitialized: boolean;
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
  const [mapsInitialized, setMapsInitialized] = useState(false);

  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const cesiumWidgetRef = useRef<CesiumWidget | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const terrainProvidersRef = useRef<{
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  }>({ TERRAIN: null, SURFACE: null });

  // Initialize maps
  useEffect(() => {
    if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

    const initMaps = async () => {
      if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

      try {
        // Initialize Leaflet with helper
        const leafletMap = initializeLeaflet(
          leafletContainerRef.current,
          options.leaflet
        );
        leafletMapRef.current = leafletMap;
      } catch (error) {
        console.error("Leaflet initialization error:", error);
      }

      try {
        // Initialize terrain providers first (before widget creation)
        const providers = await initializeTerrainProviders(
          options.cesium?.terrainProviderUrl,
          options.cesium?.surfaceProviderUrl
        );
        terrainProvidersRef.current = providers;

        // Initialize Cesium with helper
        const widget = initializeCesium(
          cesiumContainerRef.current,
          options.cesium
        );
        cesiumWidgetRef.current = widget;

        // Wait for scene to be ready before signaling initialization
        // Use waitForRenderFrames helper to ensure scene is valid
        waitForRenderFrames(widget.scene).then(() => {
          setMapsInitialized(true);
        });

        // Load tileset (async, don't block)
        loadTileset(widget, options.cesium?.tilesetUrl).then((tileset) => {
          if (tileset) {
            tilesetRef.current = tileset;
          }
        });
      } catch (error) {
        console.error("Cesium initialization error:", error);
      }
    };

    initMaps();

    return () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - initialize once on mount, cleanup on unmount

  return {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    tilesetRef,
    terrainProvidersRef,
    mapsInitialized,
  };
};
