import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  MapFrameworkSwitcher,
  MapFrameworkSwitcherProvider,
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import { useLeafletCesiumSetup } from "./hooks/useLeafletCesiumSetup";
import { ElevationDisplay } from "./components/ElevationDisplay";
import { MapStatusCard } from "./components/MapStatusCard";
import { FovControl } from "./components/FovControl";
import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

// Configure Cesium base URL for Storybook
if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/__cesium__/";
}

/**
 * Minimal story - Leaflet to Cesium (2D → 3D)
 * Starting with Leaflet, simple UI with just the toggle button
 */
const LeafletToCesium = () => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup();

  // Register maps with context once they're initialized
  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
    resolutionScale: 1.0,
  });

  const { activeFramework } = useMapFrameworkSwitcherContext();

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

      {/* Cesium container - overlay (visibility controlled by context) */}
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 2,
        }}
      />

      {/* Framework switcher button */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 1000,
        }}
      >
        <MapFrameworkSwitcher nativeTooltip={true} />
      </div>

      {/* Active framework indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          right: "16px",
          zIndex: 1000,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "8px 16px",
          borderRadius: "4px",
          fontFamily: "monospace",
        }}
      >
        Active: {activeFramework}
      </div>
    </div>
  );
};

/**
 * Minimal story - Cesium to Leaflet (3D → 2D)
 * Starting with Cesium, simple UI with just the toggle button
 */
const CesiumToLeaflet = () => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup();

  // Register maps with context once they're initialized
  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
    resolutionScale: 1.0,
  });

  const { activeFramework } = useMapFrameworkSwitcherContext();

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

      {/* Cesium container - overlay (visibility controlled by context) */}
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 2,
        }}
      />

      {/* Framework switcher button */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 1000,
        }}
      >
        <MapFrameworkSwitcher nativeTooltip={true} />
      </div>

      {/* Active framework indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          right: "16px",
          zIndex: 1000,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "8px 16px",
          borderRadius: "4px",
          fontFamily: "monospace",
        }}
      >
        Active: {activeFramework}
      </div>
    </div>
  );
};

/**
 * Full-featured story with metrics and controls for debugging
 * Starting with Leaflet (2D)
 */
const FullFeatured = () => {
  // Transition metrics tracking
  const [lastZoom, setLastZoom] = useState<number | null>(null);
  const [lastDistance, setLastDistance] = useState<number | null>(null);
  const [lastTerrainHeight, setLastTerrainHeight] = useState<number | null>(
    null
  );
  const [currentFOV, setCurrentFOV] = useState<number | null>(null);

  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup();

  // Register maps with context once they're initialized
  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
    resolutionScale: 1.0,
  });

  // Get state and transition functions from context
  const { activeFramework, isTransitioning, isReady } =
    useMapFrameworkSwitcherContext();

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
        <MapFrameworkSwitcher nativeTooltip={true} />
      </div>
      <FovControl cesiumWidget={cesiumWidgetRef.current} />
      <MapStatusCard
        lastZoom={lastZoom}
        lastDistance={lastDistance}
        lastTerrainHeight={lastTerrainHeight}
        currentFOV={currentFOV}
      />
      <ElevationDisplay />
    </div>
  );
};

const meta: Meta = {
  title: "MapFrameworkSwitcher/Switching with Context",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

// Story 1: Leaflet > Cesium
export const LeafletCesium: StoryObj<typeof LeafletToCesium> = {
  render: () => (
    <MapFrameworkSwitcherProvider initialFramework="leaflet">
      <LeafletToCesium />
    </MapFrameworkSwitcherProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Minimal story demonstrating **Leaflet → Cesium transition**.

**Features:**
- Starts in 2D Leaflet view
- Toggle button to switch to 3D Cesium
- Context handles container visibility automatically
- Clean, minimal UI
        `,
      },
    },
  },
};

// Story 2: Cesium > Leaflet
export const CesiumLeaflet: StoryObj<typeof CesiumToLeaflet> = {
  render: () => (
    <MapFrameworkSwitcherProvider initialFramework="cesium">
      <CesiumToLeaflet />
    </MapFrameworkSwitcherProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Minimal story demonstrating **Cesium → Leaflet transition**.

**Features:**
- Starts in 3D Cesium view
- Toggle button to switch to 2D Leaflet
- Context handles container visibility automatically
- Clean, minimal UI
        `,
      },
    },
  },
};

// Story 3: Debugging
export const Debugging: StoryObj<typeof FullFeatured> = {
  render: () => (
    <MapFrameworkSwitcherProvider initialFramework="leaflet">
      <FullFeatured />
    </MapFrameworkSwitcherProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: `
Full-featured story with **metrics and controls for debugging**.

**Features:**
- Starts in 2D Leaflet view
- Toggle button to switch between 2D/3D
- FOV control, elevation display, map status card
- Leaflet map with Wuppertal aerial imagery (Luftbild 2024) WMS layer
- Cesium widget with high-resolution terrain
- Real-time opacity transition between 2D/3D
- Transition metrics tracking (zoom, distance, terrain height, FOV)
        `,
      },
    },
  },
};
