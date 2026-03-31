import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { WUPPERTAL } from "@carma-commons/resources";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import type {
  NavigationOrbitDirection,
  NavigationOrbitOptions,
  NavigationZoomOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  NAVIGATION_ORBIT_DIRECTIONS,
} from "@carma-mapping/engines-interop/navigation-controls";
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
import {
  registerCesiumWidgetAdaptiveRenderScale,
  subscribeCesiumAdaptiveRenderScaleStatus,
  type CesiumAdaptiveRenderScaleStatus,
} from "@carma-mapping/engines/cesium/api";
import { ViewSyncRuntimeNavigationControls } from "./controls/view-sync-runtime-navigation-controls";
import { useContainerResize } from "./viewSyncStoryHooks";
import { setupCesium } from "../../map-engine-switcher/helpers/cesium-setup";
import { initializeLeaflet } from "../../map-engine-switcher/helpers/leaflet-setup";
import { requestStoryCesiumRender } from "../../shared/cesiumRuntimeGuards";
import { CARMA_STORY_MAPPING_ENGINES } from "./mappingEngines";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

const meta: Meta = {
  title: "Mapping/Controls",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

const readOrbitRevolutionDurationSec = (durationSec?: number) =>
  typeof durationSec === "number" &&
  Number.isFinite(durationSec) &&
  durationSec > 0
    ? durationSec
    : DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC;

const buildOrbitOptions = ({
  direction = NAVIGATION_ORBIT_DIRECTIONS.CW,
  revolutionDurationSec,
  durationMs,
  minPitchDeg,
  rangeM,
}: {
  direction?: NavigationOrbitDirection;
  revolutionDurationSec?: number;
  durationMs?: number;
  minPitchDeg?: number;
  rangeM?: number;
}): NavigationOrbitOptions => ({
  direction,
  revolutionDurationSec: readOrbitRevolutionDurationSec(revolutionDurationSec),
  durationMs,
  minPitchDeg,
  rangeM,
});

const ZOOM_DELTA_PRESETS = {
  QUARTER: 0.25,
  THIRD: 1 / 3,
  HALF: 0.5,
  TWO_THIRDS: 2 / 3,
  ONE: 1,
} as const;

const ZOOM_DELTA_OPTIONS = {
  QUARTER: "quarter",
  THIRD: "third",
  HALF: "half",
  TWO_THIRDS: "two-thirds",
  ONE: "one",
} as const;

const ZOOM_DELTA_OPTION_TO_VALUE = {
  [ZOOM_DELTA_OPTIONS.QUARTER]: ZOOM_DELTA_PRESETS.QUARTER,
  [ZOOM_DELTA_OPTIONS.THIRD]: ZOOM_DELTA_PRESETS.THIRD,
  [ZOOM_DELTA_OPTIONS.HALF]: ZOOM_DELTA_PRESETS.HALF,
  [ZOOM_DELTA_OPTIONS.TWO_THIRDS]: ZOOM_DELTA_PRESETS.TWO_THIRDS,
  [ZOOM_DELTA_OPTIONS.ONE]: ZOOM_DELTA_PRESETS.ONE,
} as const;

const readZoomDelta = (zoomDelta?: number) =>
  typeof zoomDelta === "number" &&
  Number.isFinite(zoomDelta) &&
  zoomDelta > 0
    ? zoomDelta
    : ZOOM_DELTA_PRESETS.ONE;

const readZoomDeltaArgValue = (zoomDelta?: number | string) =>
  typeof zoomDelta === "string"
    ? ZOOM_DELTA_OPTION_TO_VALUE[
        zoomDelta as keyof typeof ZOOM_DELTA_OPTION_TO_VALUE
      ] ?? ZOOM_DELTA_PRESETS.ONE
    : readZoomDelta(zoomDelta);

const buildZoomOptions = ({
  zoomDelta,
  animate = true,
  durationMs = 250,
}: {
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
}): NavigationZoomOptions => ({
  zoomDelta: readZoomDelta(zoomDelta),
  durationMs:
    animate &&
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
      ? durationMs
      : 0,
});

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
  Number.isFinite(renderScale) ? renderScale.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "") : "1";

const formatCesiumAdaptiveStatusLabel = (
  status: CesiumAdaptiveRenderScaleStatus | null
): string =>
  status
    ? `Cesium Reference • target ${status.targetFps} fps • scale ${formatCesiumAdaptiveScale(status.renderScale)}×`
    : "Cesium Reference";

const ZOOM_DELTA_ARG_TYPE = {
  name: "zoomDelta",
  options: [
    ZOOM_DELTA_OPTIONS.QUARTER,
    ZOOM_DELTA_OPTIONS.THIRD,
    ZOOM_DELTA_OPTIONS.HALF,
    ZOOM_DELTA_OPTIONS.TWO_THIRDS,
    ZOOM_DELTA_OPTIONS.ONE,
  ],
  control: {
    type: "inline-radio",
    labels: {
      [ZOOM_DELTA_OPTIONS.QUARTER]: "¼",
      [ZOOM_DELTA_OPTIONS.THIRD]: "⅓",
      [ZOOM_DELTA_OPTIONS.HALF]: "½",
      [ZOOM_DELTA_OPTIONS.TWO_THIRDS]: "⅔",
      [ZOOM_DELTA_OPTIONS.ONE]: "1",
    },
  },
  mapping: ZOOM_DELTA_OPTION_TO_VALUE,
} as const;

const ZOOM_ANIMATE_ARG_TYPE = {
  name: "animate",
  control: { type: "boolean" },
} as const;

const ZOOM_DURATION_ARG_TYPE = {
  name: "duration (ms)",
  control: { type: "range", min: 0, max: 1200, step: 25 },
  if: { arg: "animate" },
} as const;

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
}: {
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<LeafletRuntimeHandle | null>(null);
  const homeTarget = useMemo(() => createStoryTargetState(), []);
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
        zoomOptions={zoomOptions}
      />
    </StandaloneSurface>
  );
};

const MapLibreReferenceSurface = ({
  orbitRevolutionDurationSec = DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  orbitDirection = NAVIGATION_ORBIT_DIRECTIONS.CW,
  zoomDelta = ZOOM_DELTA_PRESETS.ONE,
  animate = true,
  durationMs = 250,
}: {
  orbitRevolutionDurationSec?: number;
  orbitDirection?: NavigationOrbitDirection;
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<MapLibreRuntimeHandle | null>(null);
  const homeTarget = useMemo(() => createStoryTargetState(), []);
  const orbitOptions = useMemo(
    () =>
      buildOrbitOptions({
        direction: orbitDirection,
        revolutionDurationSec: orbitRevolutionDurationSec,
      }),
    [orbitDirection, orbitRevolutionDurationSec]
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
    <StandaloneSurface label="MapLibre Reference">
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
        orbitOptions={orbitOptions}
        zoomOptions={zoomOptions}
      />
    </StandaloneSurface>
  );
};

const CesiumReferenceSurface = ({
  orbitDirection = NAVIGATION_ORBIT_DIRECTIONS.CW,
  orbitRevolutionDurationSec = DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  orbitAnimationDurationMs = 300,
  orbitMinPitchDeg = 30,
  orbitRangeM,
  zoomDelta = ZOOM_DELTA_PRESETS.ONE,
  animate = true,
  durationMs = 250,
}: {
  orbitDirection?: NavigationOrbitDirection;
  orbitRevolutionDurationSec?: number;
  orbitAnimationDurationMs?: number;
  orbitMinPitchDeg?: number;
  orbitRangeM?: number;
  zoomDelta?: number;
  animate?: boolean;
  durationMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<CesiumRuntimeHandle | null>(null);
  const [adaptiveRenderScaleStatus, setAdaptiveRenderScaleStatus] =
    useState<CesiumAdaptiveRenderScaleStatus | null>(null);
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
        durationMs: orbitAnimationDurationMs,
        minPitchDeg: orbitMinPitchDeg,
        rangeM: orbitRangeM,
      }),
    [
      orbitAnimationDurationMs,
      orbitDirection,
      orbitMinPitchDeg,
      orbitRangeM,
      orbitRevolutionDurationSec,
    ]
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
          targetFps: 60,
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
      setRuntimeHandle(null);
      if (activeWidget && !activeWidget.isDestroyed()) {
        activeWidget.destroy();
      }
    };
  }, [homeTarget]);

  useEffect(() => {
    if (!runtimeHandle) {
      setAdaptiveRenderScaleStatus(null);
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
      label={formatCesiumAdaptiveStatusLabel(adaptiveRenderScaleStatus)}
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
      />
    </StandaloneSurface>
  );
};

export const Leaflet: StoryObj = {
  args: {
    zoomDelta: ZOOM_DELTA_OPTIONS.ONE,
    animate: true,
    durationMs: 250,
  },
  argTypes: {
    zoomDelta: ZOOM_DELTA_ARG_TYPE,
    animate: ZOOM_ANIMATE_ARG_TYPE,
    durationMs: ZOOM_DURATION_ARG_TYPE,
  },
  render: (args) => (
    <LeafletReferenceSurface
      zoomDelta={readZoomDeltaArgValue(args.zoomDelta)}
      animate={args.animate}
      durationMs={args.durationMs}
    />
  ),
};

export const MapLibre: StoryObj = {
  args: {
    orbitRevolutionDurationSec:
      DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
    orbitDirection: NAVIGATION_ORBIT_DIRECTIONS.CW,
    zoomDelta: ZOOM_DELTA_OPTIONS.ONE,
    animate: true,
    durationMs: 250,
  },
  argTypes: {
    orbitRevolutionDurationSec: {
      name: "orbit revolution duration (s)",
      control: {
        type: "range",
        min: 4,
        max: 120,
        step: 1,
      },
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
    },
    zoomDelta: ZOOM_DELTA_ARG_TYPE,
    animate: ZOOM_ANIMATE_ARG_TYPE,
    durationMs: ZOOM_DURATION_ARG_TYPE,
  },
  render: (args) => (
    <MapLibreReferenceSurface
      orbitDirection={args.orbitDirection}
      orbitRevolutionDurationSec={args.orbitRevolutionDurationSec}
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
    orbitAnimationDurationMs: 300,
    orbitMinPitchDeg: 30,
    orbitRangeM: undefined,
    zoomDelta: ZOOM_DELTA_OPTIONS.ONE,
    animate: true,
    durationMs: 250,
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
    },
    orbitRevolutionDurationSec: {
      name: "orbit revolution duration (s)",
      control: {
        type: "range",
        min: 4,
        max: 120,
        step: 1,
      },
    },
    orbitAnimationDurationMs: {
      name: "orbit prep animation duration (ms)",
      control: { type: "range", min: 0, max: 2000, step: 25 },
    },
    orbitMinPitchDeg: {
      name: "orbit min pitch (deg)",
      control: { type: "range", min: 0, max: 85, step: 1 },
    },
    orbitRangeM: {
      name: "orbit range (m)",
      control: { type: "number", min: 1, step: 1 },
    },
    zoomDelta: ZOOM_DELTA_ARG_TYPE,
    animate: ZOOM_ANIMATE_ARG_TYPE,
    durationMs: ZOOM_DURATION_ARG_TYPE,
  },
  render: (args) => (
    <CesiumReferenceSurface
      orbitDirection={args.orbitDirection}
      orbitRevolutionDurationSec={args.orbitRevolutionDurationSec}
      orbitAnimationDurationMs={args.orbitAnimationDurationMs}
      orbitMinPitchDeg={args.orbitMinPitchDeg}
      orbitRangeM={args.orbitRangeM}
      zoomDelta={readZoomDeltaArgValue(args.zoomDelta)}
      animate={args.animate}
      durationMs={args.durationMs}
    />
  ),
};
