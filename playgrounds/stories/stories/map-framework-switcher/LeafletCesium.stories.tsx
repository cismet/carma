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

**Resolution Scale Notes:**
- Device Pixel Ratio: ${
          typeof window !== "undefined" ? window.devicePixelRatio : "N/A"
        }
- useBrowserRecommendedResolution: true (CSS pixels, resolutionScale = 1.0 / DPR)
- For crisp rendering, use false + pass window.devicePixelRatio to transitions
        `,
      },
    },
  },
};

// Story 4: Resolution Scale Test
const ResolutionScaleTest = ({
  useBrowserRecommendedResolution = false,
  resolutionScale: customResolutionScale,
}: {
  useBrowserRecommendedResolution?: boolean;
  resolutionScale?: number;
}) => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup({
    cesium: { useBrowserRecommendedResolution },
  });

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1.0;

  // Resolution scale for transitions - CRITICAL:
  // Leaflet uses CSS pixels, Cesium drawingBuffer uses device pixels
  // frustum.getPixelDimensions(..., resolutionScale) returns meters per CSS pixel
  // When useBrowserRecommendedResolution: false:
  //   - drawingBuffer = CSS size × DPR (e.g., 2568 = 1284 × 2)
  //   - viewer.resolutionScale = 1.0 (wrong for our needs!)
  //   - We need DPR to convert device pixels → CSS pixels for Leaflet
  // When useBrowserRecommendedResolution: true:
  //   - drawingBuffer = CSS size × 1.0 (e.g., 1284)
  //   - viewer.resolutionScale = 1.0 / DPR = 0.5 (correct!)
  const cesiumReportedScale = cesiumWidgetRef.current?.resolutionScale ?? 1.0;
  const activeResolutionScale =
    customResolutionScale ??
    (useBrowserRecommendedResolution ? cesiumReportedScale : dpr);

  // Register maps with correct resolutionScale for transitions
  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
    // Use devicePixelRatio for crisp rendering with useBrowserRecommendedResolution: false
    resolutionScale: activeResolutionScale,
  });

  const { activeFramework } = useMapFrameworkSwitcherContext();

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {/* Leaflet container */}
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

      {/* Cesium container */}
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

      {/* Resolution info panel */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          zIndex: 1000,
          background: "rgba(0,0,0,0.8)",
          color: "white",
          padding: "12px 16px",
          borderRadius: "4px",
          fontFamily: "monospace",
          fontSize: "12px",
        }}
      >
        <div>
          <strong>Resolution Info:</strong>
        </div>
        <div>Device Pixel Ratio: {dpr.toFixed(2)}</div>
        <div>
          CSS Size: {cesiumContainerRef.current?.clientWidth ?? "N/A"}×
          {cesiumContainerRef.current?.clientHeight ?? "N/A"}
        </div>
        <div>
          Drawing Buffer:{" "}
          {cesiumWidgetRef.current?.scene.drawingBufferWidth ?? "N/A"}×
          {cesiumWidgetRef.current?.scene.drawingBufferHeight ?? "N/A"}
        </div>
        <div style={{ color: "#4ade80", marginTop: "8px" }}>
          <strong>
            Transition resolutionScale: {activeResolutionScale.toFixed(2)}
          </strong>
        </div>
        <div style={{ opacity: 0.7, fontSize: "10px" }}>
          Cesium reports: {cesiumReportedScale.toFixed(2)}
          <br />
          {!useBrowserRecommendedResolution &&
            `Using DPR (${dpr.toFixed(2)}) for CSS pixel conversion`}
          {useBrowserRecommendedResolution && "Using Cesium value (correct)"}
        </div>
        <div style={{ marginTop: "8px", fontSize: "10px", opacity: 0.8 }}>
          useBrowserRecommendedResolution:{" "}
          {useBrowserRecommendedResolution.toString()}
          <br />
          {!useBrowserRecommendedResolution &&
            "→ Rendering at device pixels (crisp)"}
          {useBrowserRecommendedResolution && "→ Rendering at CSS pixels"}
        </div>
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

export const ResolutionScale: StoryObj<typeof ResolutionScaleTest> = {
  args: {
    useBrowserRecommendedResolution: false,
    resolutionScale: undefined, // undefined = auto-detect (DPR when false, Cesium value when true)
  },
  argTypes: {
    useBrowserRecommendedResolution: {
      control: "boolean",
      description:
        "When false, Cesium renders at device pixels (crisp). When true, uses CSS pixels (default Cesium behavior).",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true (Cesium default)" },
      },
    },
    resolutionScale: {
      control: { type: "number", min: 0.5, max: 3, step: 0.1 },
      description:
        "Resolution scale for transitions. If undefined, uses window.devicePixelRatio when useBrowserRecommended=false, or 1.0 when true. Default: 1.0",
      table: {
        type: { summary: "number | undefined" },
        defaultValue: { summary: "1.0 (CSS pixels)" },
      },
    },
  },
  render: (args) => (
    <MapFrameworkSwitcherProvider initialFramework="leaflet">
      <ResolutionScaleTest {...args} />
    </MapFrameworkSwitcherProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: `
**Resolution Scale Test Story**

Tests transition calculations with configurable resolution settings.

**The Critical Issue:**
Leaflet uses **CSS pixels**, but Cesium's drawing buffer uses **device pixels**.
Cesium's \`frustum.getPixelDimensions(drawingBufferWidth, drawingBufferHeight, distance, resolutionScale)\` 
returns meters per **CSS pixel** when you pass the resolution scale parameter.

**When \`useBrowserRecommendedResolution: false\` (crisp rendering):**
- Drawing buffer: CSS width × DPR (e.g., 2568 = 1284 × 2.0)
- Cesium reports \`viewer.resolutionScale = 1.0\` (WRONG for our purpose!)
- We need \`resolutionScale = window.devicePixelRatio\` to convert device pixels → CSS pixels
- **Solution:** Pass DPR to transitions

**When \`useBrowserRecommendedResolution: true\` (CSS pixel rendering):**
- Drawing buffer: CSS width × 1.0 (e.g., 1284)
- Cesium reports \`viewer.resolutionScale = 1.0 / DPR = 0.5\` (CORRECT!)
- **Solution:** Use Cesium's value

**Why this matters:**
- Leaflet zoom level is based on meters per CSS pixel
- If we use wrong resolutionScale, camera distance calculation is off by DPR factor
- On DPR=2 displays: zoom 17 becomes zoom 18 (or vice versa) - exactly 1 zoom level off!

**Example URLs:**
- Correct (uses DPR): \`?args=useBrowserRecommendedResolution:false\`
- Test forced values: \`?args=useBrowserRecommendedResolution:false;resolutionScale:1\`
        `,
      },
    },
  },
};
