import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMinimalCesiumWidget,
  CesiumWidget,
  CesiumTerrainProvider,
  Cartesian3,
  Cesium3DTileset,
  Cartographic,
  sampleTerrainMostDetailedGuardedAsync,
} from "@carma/cesium";
import { degToRadNumeric } from "@carma/units/helpers";
import {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPP_MESH_2024,
  WUPPERTAL,
} from "@carma-commons/resources";
import { TransitionStage } from "@carma-mapping/engines-interop";
import {
  MapFrameworkSwitcher,
  useMapFrameworkSwitcher,
} from "@carma-mapping/components";
import { ElevationDisplay } from "./components/ElevationDisplay";
import { MapStatusCard } from "./components/MapStatusCard";
import { FovControl } from "./components/FovControl";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

// Configure Cesium base URL for Storybook
if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/__cesium__/";
}

// Wuppertal aerial imagery WMS layer
const WUPPERTAL_LUFTBILD_WMS = {
  url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
  layers: "GIS-102:trueortho2024",
  format: "image/png",
  transparent: true,
  attribution: "© Stadt Wuppertal",
};

/**
 * Leaflet + Cesium Widget with transition state tracking
 */
const LeafletCesium = () => {
  // Only transition-tracking state remains in main component
  const [lastZoom, setLastZoom] = useState<number | null>(null);
  const [lastDistance, setLastDistance] = useState<number | null>(null);
  const [lastTerrainHeight, setLastTerrainHeight] = useState<number | null>(
    null
  );
  const [currentFOV, setCurrentFOV] = useState<number | null>(null);
  const [currentStage, setCurrentStage] = useState<TransitionStage | null>(
    null
  );

  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const cesiumWidgetRef = useRef<CesiumWidget | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const terrainProvidersRef = useRef<{
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  }>({ TERRAIN: null, SURFACE: null });

  // Getter functions for the hook
  const getLeafletMap = useCallback(() => leafletMapRef.current, []);

  const getCesiumScene = useCallback(
    () => cesiumWidgetRef.current?.scene ?? null,
    []
  );

  const getCesiumContainer = useCallback(() => cesiumContainerRef.current, []);

  const getCesiumTerrainProviders = useCallback(() => {
    return {
      TERRAIN: terrainProvidersRef.current.TERRAIN ?? undefined,
      SURFACE: terrainProvidersRef.current.SURFACE ?? undefined,
    };
  }, []);

  const getResolutionScale = useCallback(() => 1.0, []);

  // Transition timing constants
  const CSS_TRANSITION_DURATION_MS = 2000; // 2s fade-in
  const CAMERA_ANIMATION_DURATION_MS = 3000; // 3s camera animation

  const switcherOptions = useMemo(
    () => ({
      onActiveFrameworkChange: (direction: any) => {
        console.log("[TRANSITION] Framework changed:", direction);
        setCurrentStage(null); // Clear stage when framework changes
      },
      onTransitionStart: (direction: any) => {
        console.log("[TRANSITION] Started:", direction);
        setCurrentStage(TransitionStage.PREPARE_2D);
        if (direction === 1 && leafletMapRef.current) {
          // Capture zoom and distance before transition
          setLastZoom(leafletMapRef.current.getZoom());

          // Capture terrain height at center
          const center = leafletMapRef.current.getCenter();
          const position = Cartographic.fromDegrees(center.lng, center.lat);

          if (terrainProvidersRef.current.SURFACE) {
            sampleTerrainMostDetailedGuardedAsync(
              terrainProvidersRef.current.SURFACE,
              [position],
              true,
              true
            )
              .then((results) => {
                if (results && results[0]?.height !== undefined) {
                  setLastTerrainHeight(results[0].height);
                }
              })
              .catch((err) => console.error("Failed to sample terrain:", err));
          }
        }
      },
      onTransitionComplete: (direction: any) => {
        console.log("[TRANSITION] Completed:", direction);
        setCurrentStage(TransitionStage.COMPLETE);
        if (direction === 1 && cesiumWidgetRef.current?.camera) {
          const camera = cesiumWidgetRef.current.camera;
          const height = camera.positionCartographic.height;
          setLastDistance(height);

          // Capture actual FOV from camera
          if (camera.frustum && "fov" in camera.frustum) {
            setCurrentFOV((camera.frustum as any).fov * (180 / Math.PI));
          }
        }
      },
      onTransitionFailed: (direction: any) => {
        console.error("[TRANSITION] Failed:", direction);
        setCurrentStage(TransitionStage.ERROR);
      },
      onTransitionStage: (stage: TransitionStage) => {
        setCurrentStage(stage);
      },
      transitionOptions: {
        step4_cssTransitionDurationMs: CSS_TRANSITION_DURATION_MS, // CSS fade-in duration
        step6_cameraAnimationDurationMs: CAMERA_ANIMATION_DURATION_MS, // Camera animation duration
      },
    }),
    []
  );

  // Map framework switcher hook
  const { activeFramework, isTransitioning, toggle } = useMapFrameworkSwitcher(
    getLeafletMap,
    getCesiumScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
    getResolutionScale,
    switcherOptions
  );

  // Initialize maps
  useEffect(() => {
    if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

    const initMaps = () => {
      if (!leafletContainerRef.current || !cesiumContainerRef.current) return;

      // Initialize terrain providers (ready but not applied to scene yet)
      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER.url)
        .then((terrain) => {
          terrainProvidersRef.current.TERRAIN = terrain;
          console.log("[TERRAIN] TERRAIN provider initialized successfully");
        })
        .catch((error) => {
          console.warn("TERRAIN provider failed to initialize:", error);
        });

      CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url)
        .then((terrain) => {
          terrainProvidersRef.current.SURFACE = terrain;
          console.log("[TERRAIN] SURFACE provider initialized successfully");
        })
        .catch((error) => {
          console.warn("SURFACE provider failed to initialize:", error);
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

        // Add Wuppertal aerial imagery (Luftbild) WMS layer
        const wmsLayer = L.tileLayer
          .wms(WUPPERTAL_LUFTBILD_WMS.url, {
            layers: WUPPERTAL_LUFTBILD_WMS.layers,
            format: WUPPERTAL_LUFTBILD_WMS.format,
            transparent: WUPPERTAL_LUFTBILD_WMS.transparent,
            attribution: WUPPERTAL_LUFTBILD_WMS.attribution,
            maxZoom: 22,
          })
          .addTo(leafletMap);

        console.log("[LEAFLET] WMS layer added:", {
          url: WUPPERTAL_LUFTBILD_WMS.url,
          layers: WUPPERTAL_LUFTBILD_WMS.layers,
          layerAdded: !!wmsLayer,
        });

        // Force Leaflet to recalculate size
        setTimeout(() => leafletMap.invalidateSize(), 100);

        leafletMapRef.current = leafletMap;
      } catch (error) {
        console.error("Leaflet initialization error:", error);
      }

      try {
        // Create Cesium widget - enable globe for transitions (depthTestAgainstTerrain requires it)
        const widget = createMinimalCesiumWidget(cesiumContainerRef.current);

        cesiumWidgetRef.current = widget;

        // Load 2024 mesh as 3D tileset after widget is ready
        // Using geoportal DEFAULT_MESH_OPTIONS from cesiumTilesetProviders.ts
        Cesium3DTileset.fromUrl(WUPP_MESH_2024.url, {
          preloadWhenHidden: false,
          scene: widget.scene,
          shadows: 0, // ShadowMode.DISABLED
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
              console.log("Tileset loaded and added to scene");
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

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {/* Leaflet container - base layer */}
      <div
        ref={leafletContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      />

      {/* Cesium container - overlay (opacity controlled by transition function) */}
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 2,
          // Opacity and pointer-events controlled by transition function
          // No transition property here - function handles it internally
        }}
      />

      {/* Map Framework Switcher - Top Left */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 1000,
        }}
      >
        <MapFrameworkSwitcher
          activeFramework={activeFramework}
          isTransitioning={isTransitioning}
          onToggle={toggle}
          nativeTooltip={true}
        />
      </div>

      {/* FOV Control - Top Right (with viewport & FOV cone visualizations) */}
      <FovControl cesiumWidget={cesiumWidgetRef.current} />

      {/* Map Status Card - Bottom Left */}
      <MapStatusCard
        cesiumScene={cesiumWidgetRef.current?.scene || null}
        leafletMap={leafletMapRef.current}
        activeFramework={activeFramework}
        cesiumResolutionScale={cesiumWidgetRef.current?.resolutionScale || 1}
        cesiumContainer={cesiumContainerRef.current}
        devicePixelRatio={window.devicePixelRatio || 1}
        currentStage={currentStage}
        lastZoom={lastZoom}
        lastDistance={lastDistance}
        lastTerrainHeight={lastTerrainHeight}
        currentFOV={currentFOV}
      />

      {/* Elevation Display - Bottom Right */}
      <ElevationDisplay
        cesiumScene={cesiumWidgetRef.current?.scene || null}
        leafletMap={leafletMapRef.current}
        terrainProvider={terrainProvidersRef.current.TERRAIN}
        surfaceProvider={terrainProvidersRef.current.SURFACE}
        devicePixelRatio={window.devicePixelRatio || 1}
        activeFramework={activeFramework}
      />
    </div>
  );
};

const meta: Meta<typeof LeafletCesium> = {
  title: "MapFrameworkSwitcher/Leaflet <-> Cesium",
  component: LeafletCesium,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
Leaflet + Cesium Widget with Leva controls for interactive exploration.

**Interactive Controls (via Leva):**
- **Terrain Provider**: Toggle between Terrain 2020 and 2024 Mesh (1m DSM)
- **Cesium Opacity**: Smooth blend slider between Leaflet (2D) and Cesium (3D) views

**Features:**
- Leaflet map with Wuppertal aerial imagery (Luftbild 2024) WMS layer
- Cesium widget overlaid with high-resolution terrain
- Real-time opacity transition between 2D/3D
- Both maps centered on Wuppertal city center
- Using terrain providers from @carma-commons/resources
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof LeafletCesium>;

export const Default: Story = {};
