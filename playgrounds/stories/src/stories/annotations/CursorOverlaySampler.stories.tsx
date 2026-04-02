import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  NAVIGATION_ORBIT_DIRECTIONS,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  RING_MATERIAL_PRESETS,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  createPointQueryPreviewController,
  type PointQueryPreviewController,
} from "@carma-mapping/annotations/runtime-v2";
import { registerCesiumScenePointQueryTileset } from "@carma-mapping/engines/cesium/react/interactions";
import { type CesiumWidget } from "@carma-cesium";

import { setupCesium } from "../map-engine-switcher/helpers/cesium-setup";
import { requestStoryCesiumRender } from "../shared/cesiumRuntimeGuards";
import { ViewSyncRuntimeNavigationControls } from "../mapping/view-sync/controls/view-sync-runtime-navigation-controls";
import {
  buildOrbitOptions,
  buildZoomOptions,
  DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
  DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
  ZOOM_DELTA_PRESETS,
} from "../mapping/view-sync/framework-controls.story-helpers";
import { CARMA_STORY_MAPPING_ENGINES } from "../mapping/view-sync/mappingEngines";
import { useContainerResize } from "../mapping/view-sync/viewSyncStoryHooks";
import {
  applyViewStateToCesiumWidget,
  createStoryTargetState,
  type CesiumRuntimeHandle,
} from "../mapping/view-sync/viewSyncStoryShared";

import "cesium/Build/Cesium/Widgets/widgets.css";

type CursorOverlaySamplerStoryProps = {
  queryEnabled: boolean;
  showCursor: boolean;
  showDisc: boolean;
  hideNativeCursor: boolean;
  discRadiusMeters: number;
  discScalingMode: "screen" | "world";
  discInnerHoleRadiusRatio: number;
  discTargetRadiusCssPx: number;
  discOpacity: number;
  discMaterialPreset: RingMaterialPreset;
  discColor: string;
};

const TOP_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const BOTTOM_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const STATUS_BAR_HEIGHT_PX = 24;
const NAVIGATION_CONTROL_MARGIN_PX = 10;
const NAVIGATION_CONTROLS_TOP_OFFSET_PX =
  STATUS_BAR_HEIGHT_PX + NAVIGATION_CONTROL_MARGIN_PX;

const CursorOverlaySamplerSandbox = ({
  queryEnabled,
  showCursor,
  showDisc,
  hideNativeCursor,
  discRadiusMeters,
  discScalingMode,
  discInnerHoleRadiusRatio,
  discTargetRadiusCssPx,
  discOpacity,
  discMaterialPreset,
  discColor,
}: CursorOverlaySamplerStoryProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const [runtimeHandle, setRuntimeHandle] =
    useState<CesiumRuntimeHandle | null>(null);
  const controllerRef = useRef<PointQueryPreviewController | null>(null);
  const tilesetStatusRef = useRef<HTMLSpanElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const mousePositionRateRef = useRef<HTMLSpanElement | null>(null);
  const sampleRateRef = useRef<HTMLSpanElement | null>(null);
  const discUpdateRateRef = useRef<HTMLSpanElement | null>(null);
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
        direction: NAVIGATION_ORBIT_DIRECTIONS.CW,
        revolutionDurationSec:
          DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
        minPitchDeg: 30,
      }),
    []
  );
  const zoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta: ZOOM_DELTA_PRESETS.ONE,
        animate: true,
        durationMs: 250,
        minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
        maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
      }),
    []
  );
  const fovZoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta: ZOOM_DELTA_PRESETS.ONE,
        animate: true,
        durationMs: 250,
        minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
        maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
      }),
    []
  );
  const dollyZoomOptions = useMemo(
    () =>
      buildZoomOptions({
        zoomDelta: ZOOM_DELTA_PRESETS.ONE,
        animate: true,
        durationMs: 2000,
        minimumFovDeg: DEFAULT_STORY_CESIUM_MINIMUM_FOV_DEG,
        maximumFovDeg: DEFAULT_STORY_CESIUM_MAXIMUM_FOV_DEG,
      }),
    []
  );
  const statusValues = [
    <span key="tileset-status" ref={tilesetStatusRef}>
      tileset loading
    </span>,
    `query ${queryEnabled ? "on" : "off"}`,
    `cursor ${showCursor ? "on" : "off"}`,
    `disc ${showDisc ? "on" : "off"}`,
    `scale ${discScalingMode}`,
    `hole ${discInnerHoleRadiusRatio.toFixed(2)}`,
    discScalingMode === "screen"
      ? `target ${Math.round(discTargetRadiusCssPx)}px`
      : `radius ${discRadiusMeters.toFixed(2)}m`,
    `material ${discMaterialPreset}`,
    <span key="readout" ref={readoutRef}>
      pointer idle
    </span>,
  ];
  const performanceStatusValues = [
    <span key="mouse-position-rate" ref={mousePositionRateRef}>
      mouse 0.0 Hz
    </span>,
    <span key="sample-rate" ref={sampleRateRef}>
      sample 0.0 Hz
    </span>,
    <span key="disc-update-rate" ref={discUpdateRateRef}>
      disc 0.0 Hz
    </span>,
  ];

  useEffect(() => {
    if (!cesiumContainerRef.current) {
      return;
    }

    let disposed = false;
    let unregisterPointQueryTileset: (() => void) | null = null;

    const initialize = async () => {
      if (tilesetStatusRef.current) {
        tilesetStatusRef.current.textContent = "tileset loading";
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = "pointer idle";
      }
      if (mousePositionRateRef.current) {
        mousePositionRateRef.current.textContent = "mouse 0.0 Hz";
      }
      if (sampleRateRef.current) {
        sampleRateRef.current.textContent = "sample 0.0 Hz";
      }
      if (discUpdateRateRef.current) {
        discUpdateRateRef.current.textContent = "disc 0.0 Hz";
      }

      const result = await setupCesium(
        cesiumContainerRef.current as HTMLDivElement,
        {
          useBrowserRecommendedResolution: false,
          loadTileset: true,
        }
      );

      if (disposed) {
        if (!result.widget.isDestroyed()) {
          result.widget.destroy();
        }
        return;
      }

      widgetRef.current = result.widget;
      if (result.terrainProviders.TERRAIN) {
        result.widget.scene.terrainProvider = result.terrainProviders.TERRAIN;
      }
      applyViewStateToCesiumWidget({
        widget: result.widget,
        state: homeTarget,
      });
      requestStoryCesiumRender(result.widget);
      setRuntimeHandle({
        engine: CARMA_STORY_MAPPING_ENGINES.CESIUM,
        widget: result.widget,
        container: cesiumContainerRef.current as HTMLDivElement,
        terrainProviders: result.terrainProviders,
        viewSync: null,
      });

      unregisterPointQueryTileset = result.tileset
        ? registerCesiumScenePointQueryTileset(
            result.widget.scene,
            result.tileset
          )
        : null;
      if (tilesetStatusRef.current) {
        tilesetStatusRef.current.textContent = result.tileset
          ? "tileset ready"
          : "tileset missing";
      }
      controllerRef.current = createPointQueryPreviewController({
        scene: result.widget.scene,
        readoutElement: readoutRef.current,
        mousePositionRateElement: mousePositionRateRef.current,
        sampleRateElement: sampleRateRef.current,
        discUpdateRateElement: discUpdateRateRef.current,
        options: {
          queryEnabled,
          showCursor,
          showDisc,
          hideNativeCursor,
          discRadiusMeters,
          discScalingMode,
          innerHoleRadiusRatio: discInnerHoleRadiusRatio,
          targetScreenRadiusCssPx: discTargetRadiusCssPx,
          discOpacity,
          discMaterialPreset,
          discColor,
        },
      });
      result.widget.scene.requestRender();
    };

    void initialize();

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      setRuntimeHandle(null);
      unregisterPointQueryTileset?.();
      unregisterPointQueryTileset = null;
      if (tilesetStatusRef.current) {
        tilesetStatusRef.current.textContent = "tileset loading";
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = "pointer idle";
      }
      if (mousePositionRateRef.current) {
        mousePositionRateRef.current.textContent = "mouse 0.0 Hz";
      }
      if (sampleRateRef.current) {
        sampleRateRef.current.textContent = "sample 0.0 Hz";
      }
      if (discUpdateRateRef.current) {
        discUpdateRateRef.current.textContent = "disc 0.0 Hz";
      }

      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, [homeTarget]);

  useEffect(() => {
    controllerRef.current?.updateOptions({
      queryEnabled,
      showCursor,
      showDisc,
      hideNativeCursor,
      discRadiusMeters,
      discScalingMode,
      innerHoleRadiusRatio: discInnerHoleRadiusRatio,
      targetScreenRadiusCssPx: discTargetRadiusCssPx,
      discOpacity,
      discMaterialPreset,
      discColor,
    });
  }, [
    discColor,
    discMaterialPreset,
    discOpacity,
    discInnerHoleRadiusRatio,
    discRadiusMeters,
    discScalingMode,
    discTargetRadiusCssPx,
    hideNativeCursor,
    queryEnabled,
    showCursor,
    showDisc,
  ]);

  useContainerResize(cesiumContainerRef, () => {
    if (!runtimeHandle?.widget || runtimeHandle.widget.isDestroyed()) {
      return;
    }

    runtimeHandle.widget.resize();
    requestStoryCesiumRender(runtimeHandle.widget);
  });

  return (
    <div
      ref={rootRef}
      data-annotation-cursor-root="true"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={cesiumContainerRef} style={{ position: "absolute", inset: 0 }} />
      <div style={TOP_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar
          label="cursor overlay sampler"
          values={statusValues}
          tone="dark"
        />
      </div>
      <div style={BOTTOM_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar
          label="performance"
          values={performanceStatusValues}
          tone="dark"
        />
      </div>
      <ViewSyncRuntimeNavigationControls
        controlId="cursor-overlay-sampler"
        engine={CARMA_STORY_MAPPING_ENGINES.CESIUM}
        runtimeHandle={runtimeHandle}
        homeTarget={homeTarget}
        showOrbitControl
        controlStyle={{
          top: NAVIGATION_CONTROLS_TOP_OFFSET_PX,
        }}
        orbitOptions={orbitOptions}
        showFovZoomControl
        showDollyZoomControl
        zoomOptions={zoomOptions}
        fovZoomOptions={fovZoomOptions}
        dollyZoomOptions={dollyZoomOptions}
      />
    </div>
  );
};

const meta: Meta<CursorOverlaySamplerStoryProps> = {
  title: "Annotations/Cursor Overlay",
  component: CursorOverlaySamplerSandbox,
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
  argTypes: {
    queryEnabled: {
      control: { type: "boolean" },
      table: { category: "Query" },
    },
    hideNativeCursor: {
      control: { type: "boolean" },
      table: { category: "Query" },
    },
    showCursor: {
      control: { type: "boolean" },
      table: { category: "Cursor" },
    },
    showDisc: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discRadiusMeters: {
      control: { type: "range", min: 0.25, max: 10, step: 0.25 },
      table: { category: "Disc" },
    },
    discScalingMode: {
      control: { type: "inline-radio" },
      options: ["screen", "world"],
      table: { category: "Disc" },
    },
    discInnerHoleRadiusRatio: {
      control: { type: "range", min: 0, max: 0.95, step: 0.01 },
      table: { category: "Disc" },
    },
    discTargetRadiusCssPx: {
      control: { type: "range", min: 8, max: 120, step: 1 },
      table: { category: "Disc" },
    },
    discOpacity: {
      control: { type: "range", min: 0.05, max: 1, step: 0.01 },
      table: { category: "Disc" },
    },
    discMaterialPreset: {
      control: { type: "select" },
      options: [
        RING_MATERIAL_PRESETS.COLOR,
        RING_MATERIAL_PRESETS.CHROME_MIRROR,
        RING_MATERIAL_PRESETS.FROSTED_GLASS,
      ],
      table: { category: "Disc" },
    },
    discColor: {
      control: { type: "color" },
      table: { category: "Disc" },
    },
  },
};

export default meta;

export const CursorOverlaySampler: StoryObj<CursorOverlaySamplerStoryProps> = {
  name: "Disc Sampler",
  args: {
    queryEnabled: true,
    hideNativeCursor: true,
    showCursor: true,
    showDisc: true,
    discRadiusMeters: 1,
    discScalingMode: "screen",
    discInnerHoleRadiusRatio: 0.5,
    discTargetRadiusCssPx: 48,
    discOpacity: 0.66,
    discMaterialPreset: RING_MATERIAL_PRESETS.COLOR,
    discColor: "#ffffff",
  },
};
