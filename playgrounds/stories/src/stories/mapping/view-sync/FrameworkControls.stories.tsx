import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";

import { WUPPERTAL } from "@carma-commons/resources";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  NAVIGATION_ORBIT_DIRECTIONS,
} from "@carma-mapping/engines-interop/navigation-controls";
import type {
  NavigationOrbitDirection,
  NavigationOrbitOptions,
  NavigationZoomOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  registerCesiumWidgetAdaptiveRenderScale,
  subscribeCesiumAdaptiveRenderScaleStatus,
  type CesiumAdaptiveRenderScaleActivitySummary,
  type CesiumAdaptiveRenderScaleChange,
  type CesiumAdaptiveRenderScaleStatus,
} from "@carma-mapping/engines/cesium/core";

import { setupCesium } from "../../map-engine-switcher/helpers/cesium-setup";
import { initializeLeaflet } from "../../map-engine-switcher/helpers/leaflet-setup";
import { requestStoryCesiumRender } from "../../shared/cesiumRuntimeGuards";
import { ViewSyncRuntimeNavigationControls } from "./controls/view-sync-runtime-navigation-controls";
import {
  buildHomeOptions,
  buildOrbitOptions,
  buildZoomOptions,
  DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
  DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
  DOLLY_ZOOM_DURATION_ARG_TYPE,
  HOME_ANIMATE_ARG_TYPE,
  HOME_DURATION_ARG_TYPE,
  MAX_STORY_CESIUM_FOV_DEG,
  MIN_STORY_CESIUM_FOV_DEG,
  readZoomDeltaArgValue,
  ZOOM_ANIMATE_ARG_TYPE,
  ZOOM_DELTA_ARG_TYPE,
  ZOOM_DELTA_PRESETS,
  ZOOM_DURATION_ARG_TYPE,
} from "./framework-controls.story-helpers";
import { CARMA_STORY_MAPPING_ENGINES } from "./mappingEngines";
import { useContainerResize } from "./viewSyncStoryHooks";
import {
  GEO_PORTAL_MAPLIBRE_STYLE,
  applyViewStateToCesiumWidget,
  buildLeafletViewFromState,
  buildMapLibreCameraOptionsFromState,
  createStoryTargetState,
  shellStyle,
  type CesiumRuntimeHandle,
  type LeafletRuntimeHandle,
  type MapLibreRuntimeHandle,
} from "./viewSyncStoryShared";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
const meta: Meta = {
  title: "Mapping/Controls",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

const standaloneSurfaceStyle = {
  ...shellStyle,
  minHeight: "100vh",
  height: "100vh",
};

const standaloneCanvasStyle = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  background: "#cbd5e1",
} as const;

const standaloneLabelStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 20,
} as const;

const formatCesiumAdaptiveScale = (renderScale: number): string =>
  Number.isFinite(renderScale)
    ? renderScale.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "")
    : "1";

const formatCesiumAdaptiveMetric = (
  value: number | null,
  digits: number
): string | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits).replace(/0+$/u, "").replace(/\.$/u, "")
    : null;

const formatCesiumAdaptiveStatusLabel = (
  status: CesiumAdaptiveRenderScaleStatus | null,
  lastSummary: CesiumAdaptiveRenderScaleActivitySummary | null
): string =>
  status
    ? (() => {
        const lastFps = formatCesiumAdaptiveMetric(
          lastSummary?.averageFps ?? null,
          1
        );
        const lastRenderMs = formatCesiumAdaptiveMetric(
          lastSummary?.averageRenderMs ?? null,
          2
        );
        const lastSummaryLabel =
          lastSummary !== null
            ? ` • last ${lastSummary.activityKey} ${lastFps ?? "?"} fps / ${
                lastRenderMs ?? "?"
              } ms`
            : "";
        const scaleChange = status.lastScaleChange;
        const scaleChangeLabel =
          scaleChange !== null
            ? ` • scale ${formatCesiumAdaptiveScale(
                scaleChange.previousRenderScale
              )}→${formatCesiumAdaptiveScale(scaleChange.nextRenderScale)} (${
                scaleChange.reason
              })`
            : "";
        const liveFps = formatCesiumAdaptiveMetric(status.measuredFps, 1);
        const liveMs = formatCesiumAdaptiveMetric(status.averageRenderMs, 2);
        const livePixelsMpx =
          status.drawingBufferPixels !== null
            ? formatCesiumAdaptiveMetric(
                status.drawingBufferPixels / 1_000_000,
                2
              )
            : null;
        const liveFpsLabel =
          status.active && liveFps !== null
            ? ` • ${liveFps} fps / ${liveMs ?? "?"} ms`
            : "";
        const livePixelsLabel =
          livePixelsMpx !== null ? ` • ${livePixelsMpx} Mpx` : "";
        return `Cesium Reference • target ${
          status.targetFps
        } fps • scale ${formatCesiumAdaptiveScale(
          status.renderScale
        )}×${livePixelsLabel}${liveFpsLabel}${lastSummaryLabel}${scaleChangeLabel}`;
      })()
    : "Cesium Reference";

const StandaloneSurface = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div style={standaloneSurfaceStyle}>
    <div style={standaloneCanvasStyle}>
      {children}
      <div style={standaloneLabelStyle}>
        <ResponsiveStatusBar text={label} tone="dark" />
      </div>
    </div>
  </div>
);

const LeafletReferenceSurface = ({
  zoomDelta = ZOOM_DELTA_PRESETS.ONE,
  animate = true,
  durationMs = 250,
  homeAnimate = true,
  homeDurationMs = 900,
}: {
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
  homeAnimate?: boolean;
  homeDurationMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<LeafletRuntimeHandle | null>(null);
  const homeTarget = useMemo(() => createStoryTargetState(), []);
  const homeOptions = useMemo(
    () =>
      buildHomeOptions({ animate: homeAnimate, durationMs: homeDurationMs }),
    [homeAnimate, homeDurationMs]
  );
  const zoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta,
        animate,
        durationMs,
      }),
    [animate, durationMs, zoomDelta]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const map = initializeLeaflet(container, {
      zoomDelta,
    });
    const initialView = buildLeafletViewFromState(
      homeTarget,
      container.clientWidth,
      container.clientHeight
    );

    if (initialView) {
      map.setView(initialView.center, initialView.zoom);
    }

    setRuntimeHandle({
      engine: CARMA_STORY_MAPPING_ENGINES.LEAFLET,
      map,
      container,
      viewSync: null,
    });

    return () => {
      setRuntimeHandle(null);
      map.remove();
    };
  }, [homeTarget]);

  useEffect(() => {
    const map = runtimeHandle?.map;
    if (!map) {
      return;
    }

    map.options.zoomSnap = zoomDelta;
    map.options.zoomDelta = zoomDelta;
  }, [runtimeHandle, zoomDelta]);

  useContainerResize(containerRef, () => {
    runtimeHandle?.map.invalidateSize(false);
  });

  return (
    <StandaloneSurface label="Leaflet Reference">
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <ViewSyncRuntimeNavigationControls
        controlId="leaflet-reference"
        engine={CARMA_STORY_MAPPING_ENGINES.LEAFLET}
        runtimeHandle={runtimeHandle}
        homeTarget={homeTarget}
        showCompass={false}
        homeOptions={homeOptions}
        zoomOptions={zoomOptions}
      />
    </StandaloneSurface>
  );
};

const MapLibreReferenceSurface = ({
  orbitRevolutionDurationSec = DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  orbitDirection = NAVIGATION_ORBIT_DIRECTIONS.CW,
  orbitMinPitchDeg = 30,
  zoomDelta = ZOOM_DELTA_PRESETS.ONE,
  animate = true,
  durationMs = 250,
  homeAnimate = true,
  homeDurationMs = 900,
}: {
  orbitRevolutionDurationSec?: number;
  orbitDirection?: NavigationOrbitDirection;
  orbitMinPitchDeg?: number;
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
  homeAnimate?: boolean;
  homeDurationMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<MapLibreRuntimeHandle | null>(null);
  const homeTarget = useMemo(() => createStoryTargetState(), []);
  const homeOptions = useMemo(
    () =>
      buildHomeOptions({ animate: homeAnimate, durationMs: homeDurationMs }),
    [homeAnimate, homeDurationMs]
  );
  const orbitOptions = useMemo(
    () =>
      buildOrbitOptions({
        direction: orbitDirection,
        revolutionDurationSec: orbitRevolutionDurationSec,
        minPitchDeg: orbitMinPitchDeg,
      }),
    [orbitDirection, orbitMinPitchDeg, orbitRevolutionDurationSec]
  );
  const zoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta,
        animate,
        durationMs,
      }),
    [animate, durationMs, zoomDelta]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const initialCameraOptions = buildMapLibreCameraOptionsFromState(
      homeTarget,
      container.clientWidth,
      container.clientHeight
    );

    const map = new maplibregl.Map({
      container,
      style: GEO_PORTAL_MAPLIBRE_STYLE as StyleSpecification,
      center: initialCameraOptions
        ? initialCameraOptions.center
        : [WUPPERTAL.position.longitude, WUPPERTAL.position.latitude],
      zoom: initialCameraOptions?.zoom ?? 16.5,
      bearing: initialCameraOptions?.bearing ?? 0,
      pitch: initialCameraOptions?.pitch ?? 0,
      zoomSnap: zoomDelta,
      attributionControl: false,
      hash: false,
    });

    setRuntimeHandle({
      engine: CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL,
      map,
      container,
      viewSync: null,
    });

    return () => {
      setRuntimeHandle(null);
      map.remove();
    };
  }, [homeTarget]);

  useEffect(() => {
    const map = runtimeHandle?.map;
    if (!map) {
      return;
    }

    map.setZoomSnap(zoomDelta);
  }, [runtimeHandle, zoomDelta]);

  useContainerResize(containerRef, () => {
    runtimeHandle?.map.resize();
  });

  return (
    <StandaloneSurface label="MapLibre GL JS Reference">
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <ViewSyncRuntimeNavigationControls
        controlId="maplibre-reference"
        engine={CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL}
        runtimeHandle={runtimeHandle}
        homeTarget={homeTarget}
        showOrbitControl
        homeOptions={homeOptions}
        orbitOptions={orbitOptions}
        zoomOptions={zoomOptions}
      />
    </StandaloneSurface>
  );
};

const CesiumReferenceSurface = ({
  orbitDirection = NAVIGATION_ORBIT_DIRECTIONS.CW,
  orbitRevolutionDurationSec = DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  orbitMinPitchDeg = 30,
  zoomDelta = ZOOM_DELTA_PRESETS.ONE,
  animate = true,
  travelDurationMs = 250,
  fovDurationMs = 250,
  dollyDurationMs = 2000,
  minimumFovDeg = DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
  maximumFovDeg = DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
}: {
  orbitDirection?: NavigationOrbitDirection;
  orbitRevolutionDurationSec?: number;
  orbitMinPitchDeg?: number;
  zoomDelta?: number;
  animate?: boolean;
  travelDurationMs?: number;
  fovDurationMs?: number;
  dollyDurationMs?: number;
  minimumFovDeg?: number;
  maximumFovDeg?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<CesiumRuntimeHandle | null>(null);
  const [adaptiveRenderScaleStatus, setAdaptiveRenderScaleStatus] =
    useState<CesiumAdaptiveRenderScaleStatus | null>(null);
  const [lastAdaptiveRenderScaleSummary, setLastAdaptiveRenderScaleSummary] =
    useState<CesiumAdaptiveRenderScaleActivitySummary | null>(null);
  const homeTarget = useMemo(
    () =>
      createStoryTargetState({
        fovVerticalDeg: 60,
      }),
    []
  );
  const orbitOptions = useMemo(
    () =>
      buildOrbitOptions({
        direction: orbitDirection,
        revolutionDurationSec: orbitRevolutionDurationSec,
        minPitchDeg: orbitMinPitchDeg,
      }),
    [orbitDirection, orbitMinPitchDeg, orbitRevolutionDurationSec]
  );
  const zoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta,
        animate,
        durationMs: travelDurationMs,
        minimumFovDeg,
        maximumFovDeg,
      }),
    [animate, maximumFovDeg, minimumFovDeg, travelDurationMs, zoomDelta]
  );
  const fovZoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta,
        animate,
        durationMs: fovDurationMs,
        minimumFovDeg,
        maximumFovDeg,
      }),
    [animate, fovDurationMs, maximumFovDeg, minimumFovDeg, zoomDelta]
  );
  const dollyZoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta,
        animate,
        durationMs: dollyDurationMs,
        minimumFovDeg,
        maximumFovDeg,
      }),
    [animate, dollyDurationMs, maximumFovDeg, minimumFovDeg, zoomDelta]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let disposed = false;
    let activeWidget: Awaited<ReturnType<typeof setupCesium>>["widget"] | null =
      null;
    let unregisterAdaptiveRenderScale = () => {};

    const initialize = async () => {
      const setup = await setupCesium(container, {
        useBrowserRecommendedResolution: false,
      });

      if (disposed) {
        if (!setup.widget.isDestroyed()) {
          setup.widget.destroy();
        }
        return;
      }

      if (setup.terrainProviders.TERRAIN) {
        setup.widget.scene.terrainProvider = setup.terrainProviders.TERRAIN;
      }

      applyViewStateToCesiumWidget({
        widget: setup.widget,
        state: homeTarget,
      });
      requestStoryCesiumRender(setup.widget);

      activeWidget = setup.widget;
      unregisterAdaptiveRenderScale = registerCesiumWidgetAdaptiveRenderScale(
        setup.widget,
        {
          targetFps: 144,
          restingScale: 1,
          onActivitySummary: setLastAdaptiveRenderScaleSummary,
        }
      );
      setRuntimeHandle({
        engine: CARMA_STORY_MAPPING_ENGINES.CESIUM,
        widget: setup.widget,
        container,
        terrainProviders: setup.terrainProviders,
        viewSync: null,
      });
    };

    initialize().catch((error) => {
      console.error(
        "[STORY][CONTROLS] Failed to initialize Cesium story",
        error
      );
    });

    return () => {
      disposed = true;
      unregisterAdaptiveRenderScale();
      setAdaptiveRenderScaleStatus(null);
      setLastAdaptiveRenderScaleSummary(null);
      setRuntimeHandle(null);
      if (activeWidget && !activeWidget.isDestroyed()) {
        activeWidget.destroy();
      }
    };
  }, [homeTarget]);

  useEffect(() => {
    if (!runtimeHandle) {
      setAdaptiveRenderScaleStatus(null);
      setLastAdaptiveRenderScaleSummary(null);
      return;
    }

    return subscribeCesiumAdaptiveRenderScaleStatus(
      runtimeHandle.widget,
      setAdaptiveRenderScaleStatus
    );
  }, [runtimeHandle]);

  useContainerResize(containerRef, () => {
    if (!runtimeHandle?.widget || runtimeHandle.widget.isDestroyed()) {
      return;
    }

    runtimeHandle.widget.resize();
    requestStoryCesiumRender(runtimeHandle.widget);
  });

  return (
    <StandaloneSurface
      label={formatCesiumAdaptiveStatusLabel(
        adaptiveRenderScaleStatus,
        lastAdaptiveRenderScaleSummary
      )}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <ViewSyncRuntimeNavigationControls
        controlId="cesium-reference"
        engine={CARMA_STORY_MAPPING_ENGINES.CESIUM}
        runtimeHandle={runtimeHandle}
        homeTarget={homeTarget}
        showOrbitControl
        orbitOptions={orbitOptions}
        showFovZoomControl
        showDollyZoomControl
        zoomOptions={zoomOptions}
        fovZoomOptions={fovZoomOptions}
        dollyZoomOptions={dollyZoomOptions}
      />
    </StandaloneSurface>
  );
};

export const Leaflet: StoryObj = {
  args: {
    homeAnimate: true,
    homeDurationMs: 900,
    zoomDelta: "one",
    animate: true,
    durationMs: 250,
  },
  argTypes: {
    homeAnimate: {
      ...HOME_ANIMATE_ARG_TYPE,
      table: { category: "Home" },
    },
    homeDurationMs: {
      ...HOME_DURATION_ARG_TYPE,
      if: { arg: "homeAnimate" },
      table: { category: "Home" },
    },
    zoomDelta: ZOOM_DELTA_ARG_TYPE,
    animate: ZOOM_ANIMATE_ARG_TYPE,
    durationMs: ZOOM_DURATION_ARG_TYPE,
  },
  render: (args) => (
    <LeafletReferenceSurface
      homeAnimate={args.homeAnimate}
      homeDurationMs={args.homeDurationMs}
      zoomDelta={readZoomDeltaArgValue(args.zoomDelta)}
      animate={args.animate}
      durationMs={args.durationMs}
    />
  ),
};

export const MapLibreGLJS: StoryObj = {
  name: "MapLibre GL JS",
  args: {
    homeAnimate: true,
    homeDurationMs: 900,
    orbitDirection: NAVIGATION_ORBIT_DIRECTIONS.CW,
    orbitRevolutionDurationSec:
      DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
    orbitMinPitchDeg: 30,
    zoomDelta: "one",
    animate: true,
    durationMs: 250,
  },
  argTypes: {
    homeAnimate: {
      ...HOME_ANIMATE_ARG_TYPE,
      table: { category: "Home" },
    },
    homeDurationMs: {
      ...HOME_DURATION_ARG_TYPE,
      if: { arg: "homeAnimate" },
      table: { category: "Home" },
    },
    orbitDirection: {
      name: "orbit direction",
      options: [
        NAVIGATION_ORBIT_DIRECTIONS.CW,
        NAVIGATION_ORBIT_DIRECTIONS.CCW,
      ],
      control: { type: "inline-radio" },
      labels: {
        [NAVIGATION_ORBIT_DIRECTIONS.CW]: "cw",
        [NAVIGATION_ORBIT_DIRECTIONS.CCW]: "ccw",
      },
      table: { category: "Orbit" },
    },
    orbitRevolutionDurationSec: {
      name: "orbit revolution duration (s)",
      control: {
        type: "range",
        min: 4,
        max: 120,
        step: 1,
      },
      table: { category: "Orbit" },
    },
    orbitMinPitchDeg: {
      name: "orbit min pitch (deg)",
      control: { type: "range", min: 0, max: 85, step: 1 },
      table: { category: "Orbit" },
    },
    zoomDelta: ZOOM_DELTA_ARG_TYPE,
    animate: ZOOM_ANIMATE_ARG_TYPE,
    durationMs: ZOOM_DURATION_ARG_TYPE,
  },
  render: (args) => (
    <MapLibreReferenceSurface
      homeAnimate={args.homeAnimate}
      homeDurationMs={args.homeDurationMs}
      orbitDirection={args.orbitDirection}
      orbitRevolutionDurationSec={args.orbitRevolutionDurationSec}
      orbitMinPitchDeg={args.orbitMinPitchDeg}
      zoomDelta={readZoomDeltaArgValue(args.zoomDelta)}
      animate={args.animate}
      durationMs={args.durationMs}
    />
  ),
};

export const Cesium: StoryObj = {
  args: {
    orbitDirection: NAVIGATION_ORBIT_DIRECTIONS.CW,
    orbitRevolutionDurationSec:
      DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
    orbitMinPitchDeg: 30,
    zoomDelta: "one",
    animate: true,
    travelDurationMs: 250,
    fovDurationMs: 250,
    dollyDurationMs: 2000,
    minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
    maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
  },
  argTypes: {
    orbitDirection: {
      name: "orbit direction",
      options: [
        NAVIGATION_ORBIT_DIRECTIONS.CW,
        NAVIGATION_ORBIT_DIRECTIONS.CCW,
      ],
      control: { type: "inline-radio" },
      labels: {
        [NAVIGATION_ORBIT_DIRECTIONS.CW]: "cw",
        [NAVIGATION_ORBIT_DIRECTIONS.CCW]: "ccw",
      },
      table: { category: "Orbit" },
    },
    orbitRevolutionDurationSec: {
      name: "orbit revolution duration (s)",
      control: {
        type: "range",
        min: 4,
        max: 120,
        step: 1,
      },
      table: { category: "Orbit" },
    },
    orbitMinPitchDeg: {
      name: "orbit min pitch (deg)",
      control: { type: "range", min: 0, max: 85, step: 1 },
      table: { category: "Orbit" },
    },
    minimumFovDeg: {
      name: "minimum fov (deg)",
      control: {
        type: "number",
        min: MIN_STORY_CESIUM_FOV_DEG,
        max: MAX_STORY_CESIUM_FOV_DEG,
        step: 0.1,
      },
      table: { category: "Zoom · FOV" },
    },
    maximumFovDeg: {
      name: "maximum fov (deg)",
      control: {
        type: "number",
        min: MIN_STORY_CESIUM_FOV_DEG,
        max: MAX_STORY_CESIUM_FOV_DEG,
        step: 0.1,
      },
      table: { category: "Zoom · FOV" },
    },
    zoomDelta: {
      ...ZOOM_DELTA_ARG_TYPE,
      table: { category: "Zoom · General" },
    },
    animate: {
      ...ZOOM_ANIMATE_ARG_TYPE,
      table: { category: "Zoom · General" },
    },
    travelDurationMs: {
      ...ZOOM_DURATION_ARG_TYPE,
      name: "travel duration (ms)",
      description: "Applies to the primary travel zoom buttons.",
      table: { category: "Zoom · Travel" },
    },
    fovDurationMs: {
      ...ZOOM_DURATION_ARG_TYPE,
      name: "fov duration (ms)",
      description: "Applies to the camera-only FOV zoom buttons.",
      table: { category: "Zoom · FOV" },
    },
    dollyDurationMs: {
      ...DOLLY_ZOOM_DURATION_ARG_TYPE,
      name: "dolly duration (ms)",
      description: "Applies to the synchronized travel + FOV dolly buttons.",
      table: { category: "Zoom · Dolly" },
    },
  },
  render: (args) => (
    <CesiumReferenceSurface
      orbitDirection={args.orbitDirection}
      orbitRevolutionDurationSec={args.orbitRevolutionDurationSec}
      orbitMinPitchDeg={args.orbitMinPitchDeg}
      minimumFovDeg={args.minimumFovDeg}
      maximumFovDeg={args.maximumFovDeg}
      zoomDelta={readZoomDeltaArgValue(args.zoomDelta)}
      animate={args.animate}
      travelDurationMs={args.travelDurationMs}
      fovDurationMs={args.fovDurationMs}
      dollyDurationMs={args.dollyDurationMs}
    />
  ),
};
