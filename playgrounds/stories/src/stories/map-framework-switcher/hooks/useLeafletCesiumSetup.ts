/**
 * Shared hook for initializing Leaflet + Cesium maps in stories
 * Handles terrain providers, map creation, and cleanup
 */

import { useEffect, useRef, useState } from "react";
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
import L from "leaflet";

// Wuppertal aerial imagery WMS layer
const WUPPERTAL_LUFTBILD_WMS = {
  url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
  layers: "GIS-102:trueortho2024",
  format: "image/png",
  transparent: true,
  attribution: "© Stadt Wuppertal",
};

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
 * @returns Refs to containers and map instances, plus initialization state
 *
 * @example
 * const { leafletContainerRef, cesiumContainerRef, mapsInitialized, ... } = useLeafletCesiumSetup();
 *
 * // Use in JSX:
 * <div ref={leafletContainerRef} />
 * <div ref={cesiumContainerRef} />
 */
export const useLeafletCesiumSetup = (): UseLeafletCesiumSetupReturn => {
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

    const initMaps = () => {
      if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

      // Initialize terrain providers
      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER.url)
        .then((terrain) => {
          terrainProvidersRef.current.TERRAIN = terrain;
          console.log("[TERRAIN] TERRAIN provider initialized");
        })
        .catch((error) => {
          console.warn("TERRAIN provider failed:", error);
        });

      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url)
        .then((terrain) => {
          terrainProvidersRef.current.SURFACE = terrain;
          console.log("[TERRAIN] SURFACE provider initialized");
        })
        .catch((error) => {
          console.warn("SURFACE provider failed:", error);
        });

      try {
        // Create Leaflet map
        const leafletMap = L.map(leafletContainerRef.current, {
          center: [WUPPERTAL.position.latitude, WUPPERTAL.position.longitude],
          zoom: 17,
          minZoom: 8,
          maxZoom: 22,
          zoomControl: false,
          attributionControl: false,
          zoomSnap: 1,
          zoomDelta: 1,
        });

        // Add Wuppertal aerial imagery WMS layer
        L.tileLayer
          .wms(WUPPERTAL_LUFTBILD_WMS.url, {
            layers: WUPPERTAL_LUFTBILD_WMS.layers,
            format: WUPPERTAL_LUFTBILD_WMS.format,
            transparent: WUPPERTAL_LUFTBILD_WMS.transparent,
            attribution: WUPPERTAL_LUFTBILD_WMS.attribution,
            maxZoom: 22,
          })
          .addTo(leafletMap);

        setTimeout(() => leafletMap.invalidateSize(), 100);

        leafletMapRef.current = leafletMap;
      } catch (error) {
        console.error("Leaflet initialization error:", error);
      }

      try {
        // Create Cesium widget
        const widget = createMinimalCesiumWidget(cesiumContainerRef.current);
        cesiumWidgetRef.current = widget;

        // Signal that maps are initialized
        setMapsInitialized(true);

        // Load 3D tileset
        Cesium3DTileset.fromUrl(WUPP_MESH_2024.url, {
          preloadWhenHidden: false,
          scene: widget.scene,
          shadows: 0,
          enableCollision: false,
          maximumScreenSpaceError: 6,
          skipLevelOfDetail: true,
          skipScreenSpaceErrorFactor: 128,
          baseScreenSpaceError: 4096,
        })
          .then((tileset) => {
            if (widget.scene && !widget.isDestroyed()) {
              widget.scene.primitives.add(tileset);
              tilesetRef.current = tileset;
              widget.scene.requestRender();
              console.log("Tileset loaded");
            }
          })
          .catch((error) => {
            console.warn("3D Tileset failed to load:", error);
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
  }, []);

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
