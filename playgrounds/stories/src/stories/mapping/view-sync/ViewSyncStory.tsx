import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import L from "leaflet";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { Button, Radio, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { SceneNavigationControls } from "@carma-mapping/components";
import { WUPPERTAL } from "@carma-commons/resources";
import {
  WUPPERTAL_CONFIG,
  createDefaultStyle,
} from "@carma-mapping/engines/maplibre";
import { animateOrbitHeadingPitchRange } from "@carma-mapping/engines/cesium/api";
import {
  ViewStateProvider,
  ViewStateContext,
  useViewState,
  useViewStateDerived,
  useViewStateControllerId,
  useViewAdapter,
  buildCommonViewState,
  deriveView,
  deriveOrbitAngles,
  encodeHashFromViewState,
  readFromCesium,
  applyToCesium,
  readFromMaplibre,
  applyToMaplibre,
  readFromLeaflet,
  applyToLeaflet,
  type CommonViewState,
  type DerivedView,
  type AngleBasedViewInput,
  type ViewStateContextValue,
} from "@carma-mapping/engines-interop/view-sync";
import {
  transitionToCesium,
  transitionToLeaflet,
} from "@carma-mapping/engines-interop/leaflet-cesium";
import {
  Cartographic,
  PerspectiveFrustum,
  type CesiumWidget,
} from "@carma/cesium";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import {
  initializeCesium,
  initializeTerrainProviders,
  loadTileset,
} from "../../map-framework-switcher/helpers/cesium-setup";
import { initializeLeaflet } from "../../map-framework-switcher/helpers/leaflet-setup";
import {
  buildPanelStatusText,
  formatTargetSummary,
  ViewSyncMetaOverlay,
} from "./ViewSyncStoryUi";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

type SlotFramework = "cesium" | "maplibre" | "leaflet";

type SlotConfig = {
  id: string;
  framework: SlotFramework;
};

type SlotMountConfig = {
  id: string;
  framework: SlotFramework;
  registerWithViewSync: boolean;
  reportStatus: boolean;
  layer: "base" | "overlay" | "underlay";
};

type CesiumRuntimeHandle = {
  framework: "cesium";
  widget: CesiumWidget;
  container: HTMLDivElement;
  terrainProviders: Awaited<ReturnType<typeof initializeTerrainProviders>>;
};

type LeafletRuntimeHandle = {
  framework: "leaflet";
  map: L.Map;
  container: HTMLDivElement;
};

type MapLibreRuntimeHandle = {
  framework: "maplibre";
  map: MapLibreMap;
  container: HTMLDivElement;
};

type SlotRuntimeHandle =
  | CesiumRuntimeHandle
  | LeafletRuntimeHandle
  | MapLibreRuntimeHandle;

type SlotTransitionRequest = {
  sourceMountId: string;
  targetMountId: string;
  sourceFramework: "leaflet" | "cesium";
  targetFramework: "leaflet" | "cesium";
  restoreControllerAfterTransition: boolean;
};

type StoryHomePoseValues = {
  lngDeg: number;
  latDeg: number;
  bearingDeg: number;
  pitchDeg: number;
  altitudeM: number;
};

export type ViewSyncStoryProps = {
  longitudeDeg?: number;
  latitudeDeg?: number;
  altitudeM?: number;
  bearingDeg?: number;
  pitchDeg?: number;
  rangeM?: number;
  fovVerticalDeg?: number;
  nearPlaneM?: number;
  farPlaneM?: number;
};

const formatDerivedSummary = (view: DerivedView): string => {
  return [
    `${radToDegNumeric(view.longitude as number).toFixed(5)}`,
    `${radToDegNumeric(view.latitude as number).toFixed(5)}`,
    `${(view.altitude as number).toFixed(1)}m`,
    `b ${radToDegNumeric(view.bearing as number).toFixed(1)}°`,
    `p ${radToDegNumeric(view.pitch as number).toFixed(1)}°`,
    `r ${(view.range as number).toFixed(1)}m`,
  ].join(" • ");
};

const DEFAULT_FOV_RAD = Math.PI / 3;
const DEFAULT_ANCHOR_ALTITUDE_M = 200;
const PANEL_MIN_WIDTH_PX = 320;
const FRAMEWORK_OPTIONS: SlotFramework[] = ["cesium", "maplibre", "leaflet"];
const GEO_PORTAL_MAPLIBRE_STYLE = createDefaultStyle({
  ...WUPPERTAL_CONFIG,
  baseMap: {
    // Match the Geoportal "Stadtplan" / "amtlich" WMTS basemap.
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    tileSize: 256,
    opacity: 1,
  },
});

const LEAFLET_TO_CESIUM_TRANSITION_OPTIONS = {
  step1_prepare2dViewMaxZoom: 20,
  step1_zoomOutDurationMs: 300,
  step1_zoomOutEaseLinearity: 0.75,
  step2_initialRenderTimeoutMs: 100,
  step3_resourceWaitTimeoutMs: 100,
  step4_cssTransitionDurationMs: 600,
  step5_postCssDelayMs: 100,
  step6_cameraAnimationDurationMs: 800,
} as const;

const shellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background:
    "linear-gradient(180deg, rgba(226,232,240,0.92) 0%, rgba(203,213,225,0.98) 100%)",
  overflow: "hidden",
};

const overlayLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 40,
  pointerEvents: "none",
};

const panelsRowStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  gap: 0,
  padding: 0,
  boxSizing: "border-box",
  overflowX: "auto",
  overflowY: "hidden",
  alignItems: "stretch",
};

const addButtonStyle: CSSProperties = {
  width: 48,
  minWidth: 48,
  height: "100%",
  borderRadius: 0,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "stretch",
  background: "rgba(15, 23, 42, 0.92)",
};

const ANNOTATIONS_DEMO_HOME_POSE: StoryHomePoseValues = {
  lngDeg: 7.1960888,
  latDeg: 51.2696499,
  bearingDeg: 3.23,
  pitchDeg: 58.73,
  altitudeM: 149.95,
};

const DEFAULT_STORY_RANGE_M = 620;

const createStoryTargetState = ({
  longitudeDeg = ANNOTATIONS_DEMO_HOME_POSE.lngDeg,
  latitudeDeg = ANNOTATIONS_DEMO_HOME_POSE.latDeg,
  altitudeM = ANNOTATIONS_DEMO_HOME_POSE.altitudeM,
  bearingDeg = ANNOTATIONS_DEMO_HOME_POSE.bearingDeg,
  pitchDeg = ANNOTATIONS_DEMO_HOME_POSE.pitchDeg,
  rangeM,
  fovVerticalDeg = radToDegNumeric(DEFAULT_FOV_RAD),
  nearPlaneM,
  farPlaneM,
}: ViewSyncStoryProps = {}): CommonViewState => {
  const resolvedRangeM =
    typeof rangeM === "number" && Number.isFinite(rangeM)
      ? rangeM
      : DEFAULT_STORY_RANGE_M;

  const input: AngleBasedViewInput = {
    longitude: degToRadNumeric(longitudeDeg),
    latitude: degToRadNumeric(latitudeDeg),
    altitude: altitudeM,
    bearing: degToRadNumeric(bearingDeg),
    pitch: degToRadNumeric(pitchDeg),
    range: resolvedRangeM ?? DEFAULT_STORY_RANGE_M,
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: degToRadNumeric(fovVerticalDeg),
      ...(Number.isFinite(nearPlaneM) || Number.isFinite(farPlaneM)
        ? {
            frustum: {
              ...(Number.isFinite(nearPlaneM) ? { near: nearPlaneM } : {}),
              ...(Number.isFinite(farPlaneM) ? { far: farPlaneM } : {}),
            },
          }
        : {}),
    },
    metadata: {
      frameId: 0,
      timestampMs: Date.now(),
      sourceId: "bootstrap",
      source: "restore",
    },
  };

  return buildCommonViewState(input);
};

const DEFAULT_STORY_TARGET_STATE = createStoryTargetState();

const claimOnContainerInteraction = (
  element: HTMLElement,
  claimControl: () => void,
  isApplyingExternalRef: MutableRefObject<boolean>
) => {
  const maybeClaim = () => {
    if (isApplyingExternalRef.current) {
      return;
    }
    claimControl();
  };

  element.addEventListener("pointerdown", maybeClaim);
  element.addEventListener("wheel", maybeClaim, { passive: true });
  element.addEventListener("touchstart", maybeClaim, { passive: true });

  return () => {
    element.removeEventListener("pointerdown", maybeClaim);
    element.removeEventListener("wheel", maybeClaim);
    element.removeEventListener("touchstart", maybeClaim);
  };
};

const readMapLibreViewState = (map: MapLibreMap) => {
  const center = map.getCenter();
  return {
    lngDeg: center.lng,
    latDeg: center.lat,
    zoom: map.getZoom() + 1,
    bearingDeg: map.getBearing(),
    pitchDeg: map.getPitch(),
  };
};

const readLeafletViewState = (map: L.Map) => {
  if (!(map as L.Map & { _loaded?: boolean })._loaded) {
    return null;
  }

  try {
    const center = map.getCenter();
    return {
      lngDeg: center.lng,
      latDeg: center.lat,
      zoom: map.getZoom(),
    };
  } catch {
    return null;
  }
};

const isLeafletCesiumFramework = (
  framework: SlotFramework
): framework is "leaflet" | "cesium" =>
  framework === "leaflet" || framework === "cesium";

const isLeafletCesiumTransition = (
  fromFramework: SlotFramework,
  toFramework: SlotFramework
): boolean =>
  isLeafletCesiumFramework(fromFramework) &&
  isLeafletCesiumFramework(toFramework);

const getCurrentAnchorAltitude = (state: CommonViewState | null): number =>
  state
    ? (state.anchorCartographic.altitude as number)
    : DEFAULT_ANCHOR_ALTITUDE_M;

const getCurrentVerticalFov = (state: CommonViewState | null): number => {
  if (!state) return DEFAULT_FOV_RAD;
  const fov = state.intrinsics.fov;
  return typeof fov === "number" && Number.isFinite(fov)
    ? fov
    : DEFAULT_FOV_RAD;
};

const MIN_COMPASS_PITCH_DEG = 0;
const MAX_COMPASS_PITCH_DEG = 85;
const COMPASS_DRAG_FACTOR_DEG_PER_PX = 0.3;
const META_VISUAL_WIDTH_PX = 176;
const META_VISUAL_HEIGHT_PX = 176;
const INITIAL_SLOT_BOOT_DELAY_STEP_MS = 220;
const VIEW_SYNC_CONTROL_SOURCE_ENGINE = "view-sync-control";
const COMPASS_CLICK_DELAY_MS = 180;
const COMPASS_DRAG_THRESHOLD_PX = 3;

const applyCommonViewStateToCesiumWidget = ({
  widget,
  state,
}: {
  widget: CesiumWidget;
  state: CommonViewState;
}): boolean => {
  if (typeof widget.isDestroyed === "function" && widget.isDestroyed()) {
    return false;
  }

  const scene = widget.scene;
  if (!scene) {
    return false;
  }

  applyToCesium(scene, state);
  scene.requestRender();
  return true;
};
const COMPASS_ALIGN_NORTH_DURATION_MS = 700;
const COMPASS_ALIGN_NORTH_NADIR_DURATION_MS = 900;
const ZOOM_CONTROL_DURATION_MS = 280;

const toCompassPitchDeg = (pitchRad: number): number =>
  Math.max(
    MIN_COMPASS_PITCH_DEG,
    Math.min(MAX_COMPASS_PITCH_DEG, radToDegNumeric(pitchRad))
  );

const fromCompassPitchDeg = (pitchDeg: number): number =>
  degToRadNumeric(pitchDeg);

/** Build a new CommonViewState from a DerivedView with modified angles. */
const buildFromDerived = (
  derived: DerivedView,
  overrides: Partial<{
    bearing: number;
    pitch: number;
    range: number;
  }>,
  intrinsics: CommonViewState["intrinsics"],
  sourceId: string
): CommonViewState => {
  const input: AngleBasedViewInput = {
    longitude: derived.longitude as number,
    latitude: derived.latitude as number,
    altitude: derived.altitude as number,
    bearing: overrides.bearing ?? (derived.bearing as number),
    pitch: overrides.pitch ?? (derived.pitch as number),
    range: overrides.range ?? (derived.range as number),
    intrinsics,
    metadata: {
      frameId: 0,
      timestampMs: Date.now(),
      sourceId,
      source: "user-interaction",
    },
  };
  return buildCommonViewState(input);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const buildMapLibreCameraOptionsFromState = (
  state: CommonViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
} | null => {
  const view = deriveView(state, viewportWidthPx, viewportHeightPx);
  const lngDeg = radToDegNumeric(view.longitude as number);
  const latDeg = radToDegNumeric(view.latitude as number);
  const bearingDeg = radToDegNumeric(view.bearing as number);
  const pitchDeg = radToDegNumeric(view.pitch as number);

  if (
    !Number.isFinite(lngDeg) ||
    !Number.isFinite(latDeg) ||
    !Number.isFinite(view.zoom)
  ) {
    return null;
  }

  return {
    center: [lngDeg, latDeg],
    zoom: view.zoom,
    bearing: Number.isFinite(bearingDeg) ? bearingDeg : 0,
    pitch: Number.isFinite(pitchDeg) ? pitchDeg : 0,
  };
};

const buildLeafletViewFromState = (
  state: CommonViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): { center: { lat: number; lng: number }; zoom: number } | null => {
  const view = deriveView(state, viewportWidthPx, viewportHeightPx);
  const lngDeg = radToDegNumeric(view.longitude as number);
  const latDeg = radToDegNumeric(view.latitude as number);

  if (
    !Number.isFinite(lngDeg) ||
    !Number.isFinite(latDeg) ||
    !Number.isFinite(view.zoom)
  ) {
    return null;
  }

  // Convert 512px zoom to 256px (Leaflet) zoom
  return {
    center: { lat: latDeg, lng: lngDeg },
    zoom: view.zoom + 1,
  };
};

const formatHashFromState = (
  state: CommonViewState | null | undefined
): string | null => {
  if (!state) return null;
  const params = encodeHashFromViewState(state);
  const parts = Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : v}`)
    .join("&");
  return parts || null;
};

const isCommonViewState = (
  value: CommonViewState | null | undefined
): value is CommonViewState =>
  Boolean(
    value &&
      typeof value === "object" &&
      value.anchor &&
      value.cameraPosition &&
      value.orientation &&
      value.anchorCartographic
  );

const useElementWidth = (elementRef: RefObject<HTMLElement>) => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [elementRef]);

  return width;
};

const useContainerResize = (
  containerRef: RefObject<HTMLElement>,
  onResize: () => void
) => {
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      onResizeRef.current();
    });

    observer.observe(container);
    onResizeRef.current();

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);
};

const useDeferredBootReady = (enabled: boolean, delayMs: number = 0) => {
  const [isReady, setIsReady] = useState(!enabled || delayMs <= 0);

  useEffect(() => {
    if (!enabled) {
      setIsReady(false);
      return;
    }

    if (delayMs <= 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    let frameId: number | null = null;

    const activate = () => {
      setIsReady(true);
    };

    timeoutId = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(activate, {
          timeout: delayMs + 400,
        });
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        activate();
      });
    }, delayMs);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [delayMs, enabled]);

  return isReady;
};

/** Read the current shared view state. */
const usePanelViewState = (): CommonViewState | null => {
  return useViewState();
};

/** Read the derived (angle-based) view from current state. */
const usePanelDerivedView = (): DerivedView | null => {
  return useViewStateDerived();
};

type CompassDisplayMode = "scene-state" | "rotation-locked-2d";

const PanelNavigationControls = ({
  slotId,
  framework,
  getRuntimeHandle,
  disabled = false,
}: {
  slotId: string;
  framework: SlotFramework;
  getRuntimeHandle: () => SlotRuntimeHandle | null;
  disabled?: boolean;
}) => {
  const ctx = useContext(ViewStateContext);
  const currentState = usePanelViewState();
  const derived = usePanelDerivedView();
  const compassDisplayMode: CompassDisplayMode =
    framework === "leaflet" ? "rotation-locked-2d" : "scene-state";
  const isRotationLockedCompass = compassDisplayMode === "rotation-locked-2d";
  const canPitchDrag = !isRotationLockedCompass && framework !== "leaflet";
  const canNorthInteract = !isRotationLockedCompass;
  const initialDragStateRef = useRef<{
    mouseX: number;
    mouseY: number;
    bearingDeg: number;
    pitchDeg: number;
    range: number;
  } | null>(null);
  const pendingCompassClickTimeoutRef = useRef<number | null>(null);
  const didCompassDragRef = useRef(false);
  const cancelCesiumCompassAnimationRef = useRef<(() => void) | null>(null);

  /** Apply a modified CommonViewState to the active framework directly. */
  const applyStateToRuntime = useCallback(
    (nextState: CommonViewState) => {
      ctx?.claimControl(slotId, "user-interaction");
      const runtimeHandle = getRuntimeHandle();

      if (runtimeHandle?.framework === "maplibre") {
        applyToMaplibre(runtimeHandle.map, nextState);
        return;
      }

      if (runtimeHandle?.framework === "leaflet") {
        applyToLeaflet(runtimeHandle.map, nextState);
        return;
      }

      if (runtimeHandle?.framework === "cesium") {
        applyCommonViewStateToCesiumWidget({
          widget: runtimeHandle.widget,
          state: nextState,
        });
        return;
      }
    },
    [ctx, getRuntimeHandle, slotId]
  );

  /** Build a CommonViewState with modified angles and apply it. */
  const applyAngleUpdate = useCallback(
    (overrides: Partial<{ bearing: number; pitch: number; range: number }>) => {
      if (!currentState || !derived) return;
      const nextState = buildFromDerived(
        derived,
        overrides,
        currentState.intrinsics,
        slotId
      );
      applyStateToRuntime(nextState);
    },
    [applyStateToRuntime, currentState, derived, slotId]
  );

  const handleCompassMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!canPitchDrag || !derived) {
        return;
      }

      didCompassDragRef.current = false;
      initialDragStateRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        bearingDeg: radToDegNumeric(derived.bearing as number),
        pitchDeg: toCompassPitchDeg(derived.pitch as number),
        range: derived.range as number,
      };
    },
    [canPitchDrag, derived]
  );

  const animateRuntimeToAngles = useCallback(
    (
      overrides: Partial<{ bearing: number; pitch: number; range: number }>,
      durationMs: number
    ): boolean => {
      if (!currentState || !derived) return false;
      const runtimeHandle = getRuntimeHandle();
      if (!runtimeHandle) return false;

      ctx?.claimControl(slotId, "user-interaction");
      const targetBearing = overrides.bearing ?? (derived.bearing as number);
      const targetPitch = overrides.pitch ?? (derived.pitch as number);
      const targetRange = overrides.range ?? (derived.range as number);

      if (runtimeHandle.framework === "maplibre") {
        const nextState = buildFromDerived(
          derived,
          overrides,
          currentState.intrinsics,
          slotId
        );
        const cameraOptions = buildMapLibreCameraOptionsFromState(
          nextState,
          runtimeHandle.map.getCanvas().clientWidth,
          runtimeHandle.map.getCanvas().clientHeight
        );
        if (!cameraOptions) return false;

        runtimeHandle.map.stop();
        runtimeHandle.map.easeTo({
          ...cameraOptions,
          duration: durationMs,
          essential: true,
        });
        return true;
      }

      if (runtimeHandle.framework === "cesium") {
        const camera = runtimeHandle.widget.scene?.camera;
        if (!camera) return false;

        const carto = currentState.anchorCartographic;
        const center = Cartographic.toCartesian(
          Cartographic.fromRadians(
            carto.longitude as number,
            carto.latitude as number,
            carto.altitude as number
          )
        );
        if (!center) return false;

        const fov = currentState.intrinsics.fov;
        if (fov && camera.frustum instanceof PerspectiveFrustum) {
          camera.frustum.fov = fov;
        }

        // Convert orbit pitch (0=nadir, PI/2=horizon) to Cesium pitch (-PI/2=nadir, 0=horizon)
        const cesiumPitch = targetPitch - Math.PI * 0.5;

        cancelCesiumCompassAnimationRef.current?.();
        cancelCesiumCompassAnimationRef.current = animateOrbitHeadingPitchRange(
          runtimeHandle.widget.scene,
          center,
          {
            heading: targetBearing,
            pitch: cesiumPitch,
            range: targetRange,
          },
          {
            durationMs,
            onComplete: () => {
              cancelCesiumCompassAnimationRef.current = null;
              runtimeHandle.widget.scene.requestRender();
            },
            onCancel: () => {
              cancelCesiumCompassAnimationRef.current = null;
              runtimeHandle.widget.scene.requestRender();
            },
          }
        );
        return true;
      }

      return false;
    },
    [ctx, currentState, derived, getRuntimeHandle, slotId]
  );

  const handleZoomIn = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!derived) return;

      const nextRange = Math.max(5, (derived.range as number) * 0.5);
      if (
        !animateRuntimeToAngles({ range: nextRange }, ZOOM_CONTROL_DURATION_MS)
      ) {
        applyAngleUpdate({ range: nextRange });
      }
    },
    [animateRuntimeToAngles, applyAngleUpdate, derived]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!derived) return;

      const nextRange = (derived.range as number) * 2;
      if (
        !animateRuntimeToAngles({ range: nextRange }, ZOOM_CONTROL_DURATION_MS)
      ) {
        applyAngleUpdate({ range: nextRange });
      }
    },
    [animateRuntimeToAngles, applyAngleUpdate, derived]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = initialDragStateRef.current;
      if (!dragState || !derived) return;

      if (
        Math.abs(event.clientX - dragState.mouseX) >
          COMPASS_DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - dragState.mouseY) > COMPASS_DRAG_THRESHOLD_PX
      ) {
        didCompassDragRef.current = true;
      }

      const nextBearingDeg =
        dragState.bearingDeg +
        (event.clientX - dragState.mouseX) * COMPASS_DRAG_FACTOR_DEG_PER_PX;
      const nextPitchDeg = Math.max(
        MIN_COMPASS_PITCH_DEG,
        Math.min(
          MAX_COMPASS_PITCH_DEG,
          dragState.pitchDeg -
            (event.clientY - dragState.mouseY) * COMPASS_DRAG_FACTOR_DEG_PER_PX
        )
      );

      applyAngleUpdate({
        bearing: degToRadNumeric(nextBearingDeg),
        pitch: fromCompassPitchDeg(nextPitchDeg),
        range: dragState.range,
      });
    };

    const handleMouseUp = () => {
      initialDragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [applyAngleUpdate, derived]);

  useEffect(
    () => () => {
      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
      }
      cancelCesiumCompassAnimationRef.current?.();
      cancelCesiumCompassAnimationRef.current = null;
    },
    []
  );

  const handleCompassClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!canNorthInteract) return;

      if (didCompassDragRef.current) {
        didCompassDragRef.current = false;
        return;
      }

      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
      }

      pendingCompassClickTimeoutRef.current = window.setTimeout(() => {
        if (
          !animateRuntimeToAngles(
            { bearing: 0 },
            COMPASS_ALIGN_NORTH_DURATION_MS
          )
        ) {
          applyAngleUpdate({ bearing: 0 });
        }
        pendingCompassClickTimeoutRef.current = null;
      }, COMPASS_CLICK_DELAY_MS);
    },
    [animateRuntimeToAngles, applyAngleUpdate, canNorthInteract]
  );

  const handleCompassDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!canNorthInteract) return;

      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
        pendingCompassClickTimeoutRef.current = null;
      }

      didCompassDragRef.current = false;

      if (
        !animateRuntimeToAngles(
          { bearing: 0, pitch: fromCompassPitchDeg(0) },
          COMPASS_ALIGN_NORTH_NADIR_DURATION_MS
        )
      ) {
        applyAngleUpdate({ bearing: 0, pitch: fromCompassPitchDeg(0) });
      }
    },
    [animateRuntimeToAngles, applyAngleUpdate, canNorthInteract]
  );

  const sceneBearingDeg = derived
    ? radToDegNumeric(derived.bearing as number)
    : 0;
  const scenePitchDeg = derived
    ? toCompassPitchDeg(derived.pitch as number)
    : 0;
  const bearingDeg = isRotationLockedCompass ? 0 : sceneBearingDeg;
  const pitchDeg = isRotationLockedCompass ? 0 : scenePitchDeg;
  const compassTooltip = isRotationLockedCompass
    ? "2D / rotation locked: north-up display only."
    : "Einfachklick: Norden ausrichten. Doppelklick: Norden + Nadir.";
  const showCompass = framework !== "leaflet";

  return (
    <SceneNavigationControls
      disabled={disabled}
      style={{ top: 10, left: 10, zIndex: 16 }}
      zoomIn={{
        tooltip: "Maßstab vergrößern (Zoom in)",
        title: "Vergrößern",
        dataTestId: `${slotId}-zoom-in-control`,
        onClick: handleZoomIn,
      }}
      zoomOut={{
        tooltip: "Maßstab verkleinern (Zoom out)",
        title: "Verkleinern",
        dataTestId: `${slotId}-zoom-out-control`,
        onClick: handleZoomOut,
      }}
      compass={
        showCompass
          ? {
              bearingDeg,
              pitchDeg,
              tooltip: compassTooltip,
              title: "Kompass",
              dataTestId: `${slotId}-compass-control`,
              cursor: disabled
                ? "default"
                : canPitchDrag
                ? "grab"
                : canNorthInteract
                ? "pointer"
                : "default",
              onMouseDown: canPitchDrag ? handleCompassMouseDown : undefined,
              onClick: canNorthInteract ? handleCompassClick : undefined,
              onDoubleClick: canNorthInteract
                ? handleCompassDoubleClick
                : undefined,
            }
          : null
      }
    />
  );
};

const FrameworkPanel = ({
  slot,
  activeRuntimeFramework,
  isController,
  canDelete,
  isFrameworkTransitioning,
  disableFrameworkSelection,
  onFrameworkChange,
  onDelete,
  statusText,
  hashText,
  children,
}: {
  slot: SlotConfig;
  activeRuntimeFramework: SlotFramework;
  isController: boolean;
  canDelete: boolean;
  isFrameworkTransitioning: boolean;
  disableFrameworkSelection: boolean;
  onFrameworkChange: (framework: SlotFramework) => void;
  onDelete: () => void;
  statusText: string;
  hashText?: string | null;
  children: ReactNode;
}) => {
  const panelRef = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={panelRef}
      style={{
        position: "relative",
        flex: 1,
        minWidth: PANEL_MIN_WIDTH_PX,
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 0,
        overflow: "hidden",
        border: "none",
        boxShadow: "none",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(15, 23, 42, 0.94)",
          borderBottom: "none",
        }}
      >
        <Radio.Group
          value={slot.framework}
          optionType="button"
          buttonStyle="solid"
          size="small"
          disabled={disableFrameworkSelection}
          onChange={(event) =>
            onFrameworkChange(event.target.value as SlotFramework)
          }
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
          }}
        >
          {FRAMEWORK_OPTIONS.map((framework) => (
            <Radio.Button
              key={framework}
              value={framework}
              style={{
                flex: 1,
                textAlign: "center",
                fontWeight:
                  framework === activeRuntimeFramework &&
                  framework !== slot.framework
                    ? 700
                    : 500,
              }}
            >
              {framework}
            </Radio.Button>
          ))}
        </Radio.Group>

        <Button
          danger
          ghost
          size="small"
          icon={<DeleteOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={!canDelete}
          style={{
            width: 32,
            minWidth: 32,
            paddingInline: 0,
          }}
        />
      </header>

      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          background: "#cbd5e1",
          overflow: "hidden",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
          }}
        >
          <ResponsiveStatusBar
            text={buildPanelStatusText(statusText, hashText)}
            barHeight="42px"
            tone={isController ? "light" : "dark"}
          />
        </div>
      </div>
    </section>
  );
};

const CesiumViewSyncBridge = ({
  slotId,
  widget,
  setStatusText,
  setHashText,
}: {
  slotId: string;
  widget: CesiumWidget;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
}) => {
  const { isController, claimControl, pushState } = useViewAdapter(
    slotId,
    "cesium",
    useMemo(
      () => ({
        read: () => readFromCesium(widget.scene, slotId),
        apply: (state: CommonViewState) => applyToCesium(widget.scene, state),
      }),
      [widget.scene, slotId]
    )
  );
  const isControllerRef = useRef(isController);
  isControllerRef.current = isController;

  // Claim control on user interaction with the canvas
  useEffect(() => {
    const canvas = widget.scene.canvas;
    return claimOnContainerInteraction(canvas, claimControl, {
      current: false,
    });
  }, [claimControl, widget.scene.canvas]);

  // Subscribe to Cesium postRender to read state and push when controller
  useEffect(() => {
    const scene = widget.scene;
    const handler = () => {
      const state = readFromCesium(scene, slotId);
      if (!state) {
        setStatusText("cesium • waiting for terrain target");
        return;
      }

      // Update status/hash display
      const view = deriveView(state);
      setStatusText(`cesium • ${formatDerivedSummary(view)}`);
      setHashText(formatHashFromState(state));

      // Push state when we're the controller
      if (isControllerRef.current) {
        pushState(state);
      }
    };

    scene.postRender.addEventListener(handler);
    return () => {
      scene.postRender.removeEventListener(handler);
    };
  }, [pushState, setHashText, setStatusText, slotId, widget.scene]);

  return null;
};

const CesiumSlot = ({
  slotId,
  setStatusText,
  setHashText,
  initialTarget,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  initialTarget?: CommonViewState | null;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: CesiumRuntimeHandle | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widget, setWidget] = useState<CesiumWidget | null>(null);
  const initialTargetRef = useRef(initialTarget ?? null);
  const terrainProvidersRef = useRef<Awaited<
    ReturnType<typeof initializeTerrainProviders>
  > | null>(null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

  if (!initialTargetRef.current && initialTarget) {
    initialTargetRef.current = initialTarget;
  }

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    if (!isBootReady) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let nextWidget: CesiumWidget | null = null;
    let initialApplyFrameId: number | null = null;

    (async () => {
      nextWidget = initializeCesium(container, {
        useBrowserRecommendedResolution: true,
      });

      if (initialTargetRef.current) {
        initialApplyFrameId = window.requestAnimationFrame(() => {
          if (!nextWidget || cancelled) {
            return;
          }

          applyCommonViewStateToCesiumWidget({
            widget: nextWidget,
            state: initialTargetRef.current as CommonViewState,
          });
        });
      }

      const terrainProviders = await initializeTerrainProviders();
      if (cancelled || !nextWidget || nextWidget.isDestroyed()) {
        return;
      }

      terrainProvidersRef.current = terrainProviders;

      if (terrainProviders.TERRAIN) {
        nextWidget.scene.terrainProvider = terrainProviders.TERRAIN;
      }

      await loadTileset(nextWidget);
      if (cancelled || !nextWidget || nextWidget.isDestroyed()) {
        return;
      }

      setWidget(nextWidget);
      onReadyChangeRef.current?.({
        framework: "cesium",
        widget: nextWidget,
        container,
        terrainProviders,
      });
      nextWidget.scene.requestRender();
    })();

    return () => {
      cancelled = true;
      if (initialApplyFrameId !== null) {
        window.cancelAnimationFrame(initialApplyFrameId);
      }
      onReadyChangeRef.current?.(null);
      terrainProvidersRef.current = null;
      if (nextWidget && !nextWidget.isDestroyed()) {
        nextWidget.destroy();
      }
      setWidget(null);
    };
  }, [isBootReady]);

  useContainerResize(containerRef, () => {
    if (!widget || widget.isDestroyed()) {
      return;
    }

    widget.resize();
    widget.scene.requestRender();
  });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...containerStyle,
        }}
      />
      {widget && registerWithViewSync ? (
        <CesiumViewSyncBridge
          slotId={slotId}
          widget={widget}
          setStatusText={reportStatus ? setStatusText : () => {}}
          setHashText={reportStatus ? setHashText : () => {}}
        />
      ) : null}
    </>
  );
};

const MapLibreViewSyncBridge = ({
  slotId,
  map,
  setStatusText,
  setHashText,
}: {
  slotId: string;
  map: MapLibreMap;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
}) => {
  const { isController, claimControl, pushState } = useViewAdapter(
    slotId,
    "maplibre",
    useMemo(
      () => ({
        read: () => readFromMaplibre(map, slotId),
        apply: (state: CommonViewState) => applyToMaplibre(map, state),
      }),
      [map, slotId]
    )
  );
  const isControllerRef = useRef(isController);
  isControllerRef.current = isController;

  // Claim control on user interaction
  useEffect(() => {
    const container = map.getContainer();
    return claimOnContainerInteraction(container, claimControl, {
      current: false,
    });
  }, [claimControl, map]);

  // Subscribe to MapLibre events to read state and push when controller
  useEffect(() => {
    const updateStatus = () => {
      const view = readMapLibreViewState(map);
      setStatusText(
        `maplibre • ${view.lngDeg.toFixed(5)} • ${view.latDeg.toFixed(
          5
        )} • z ${view.zoom.toFixed(2)} • b ${view.bearingDeg.toFixed(
          1
        )}° • p ${view.pitchDeg.toFixed(1)}°`
      );

      const state = readFromMaplibre(map, slotId);
      setHashText(formatHashFromState(state));

      if (!isControllerRef.current || !state) return;
      pushState(state);
    };

    map.on("load", updateStatus);
    map.on("move", updateStatus);
    map.on("rotate", updateStatus);
    map.on("pitch", updateStatus);
    map.on("resize", updateStatus);

    return () => {
      map.off("load", updateStatus);
      map.off("move", updateStatus);
      map.off("rotate", updateStatus);
      map.off("pitch", updateStatus);
      map.off("resize", updateStatus);
    };
  }, [map, pushState, setHashText, setStatusText, slotId]);

  return null;
};

const MapLibreSlot = ({
  slotId,
  setStatusText,
  setHashText,
  initialTarget,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  initialTarget?: CommonViewState | null;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: MapLibreRuntimeHandle | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const initialTargetRef = useRef(initialTarget ?? null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

  if (!initialTargetRef.current && initialTarget) {
    initialTargetRef.current = initialTarget;
  }

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    if (!isBootReady) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const initialCameraOptions = isCommonViewState(initialTargetRef.current)
      ? buildMapLibreCameraOptionsFromState(
          initialTargetRef.current,
          container.clientWidth,
          container.clientHeight
        )
      : null;

    const map = new maplibregl.Map({
      container,
      style: GEO_PORTAL_MAPLIBRE_STYLE as StyleSpecification,
      center: initialCameraOptions
        ? initialCameraOptions.center
        : [WUPPERTAL.position.longitude, WUPPERTAL.position.latitude],
      zoom: initialCameraOptions?.zoom ?? 16.5,
      bearing: initialCameraOptions?.bearing ?? 0,
      pitch: initialCameraOptions?.pitch ?? 0,
      attributionControl: false,
      hash: false,
    });

    setMap(map);
    onReadyChangeRef.current?.({
      framework: "maplibre",
      map,
      container,
    });

    return () => {
      onReadyChangeRef.current?.(null);
      map.remove();
      setMap(null);
    };
  }, [isBootReady]);

  useContainerResize(containerRef, () => {
    if (!map) {
      return;
    }

    map.resize();
  });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...containerStyle,
        }}
      />
      {map && registerWithViewSync ? (
        <MapLibreViewSyncBridge
          slotId={slotId}
          map={map}
          setStatusText={reportStatus ? setStatusText : () => {}}
          setHashText={reportStatus ? setHashText : () => {}}
        />
      ) : null}
    </>
  );
};

const LeafletViewSyncBridge = ({
  slotId,
  map,
  setStatusText,
  setHashText,
}: {
  slotId: string;
  map: L.Map;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
}) => {
  const sharedState = useViewState();
  const sharedStateRef = useRef(sharedState);
  sharedStateRef.current = sharedState;
  const readLeafletState = useCallback(
    () =>
      readFromLeaflet(map, slotId, {
        seedState: sharedStateRef.current,
      }),
    [map, slotId]
  );
  const { isController, claimControl, pushState } = useViewAdapter(
    slotId,
    "leaflet",
    useMemo(
      () => ({
        read: readLeafletState,
        apply: (state: CommonViewState) => applyToLeaflet(map, state),
      }),
      [map, readLeafletState]
    )
  );
  const isControllerRef = useRef(isController);
  isControllerRef.current = isController;

  // Claim control on user interaction
  useEffect(() => {
    const container = map.getContainer();
    return claimOnContainerInteraction(container, claimControl, {
      current: false,
    });
  }, [claimControl, map]);

  // Subscribe to Leaflet events to read state and push when controller
  useEffect(() => {
    const updateStatus = () => {
      const view = readLeafletViewState(map);
      if (!view) return;

      setStatusText(
        `leaflet • ${view.lngDeg.toFixed(5)} • ${view.latDeg.toFixed(
          5
        )} • z ${view.zoom.toFixed(2)}`
      );

      const state = readLeafletState();
      setHashText(formatHashFromState(state));

      if (!isControllerRef.current || !state) return;
      pushState(state);
    };

    map.on("move", updateStatus);
    map.on("zoom", updateStatus);
    map.whenReady(updateStatus);

    return () => {
      map.off("move", updateStatus);
      map.off("zoom", updateStatus);
    };
  }, [map, pushState, readLeafletState, setHashText, setStatusText]);

  return null;
};

const LeafletSlot = ({
  slotId,
  setStatusText,
  setHashText,
  initialTarget,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  initialTarget?: CommonViewState | null;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: LeafletRuntimeHandle | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const initialTargetRef = useRef(initialTarget ?? null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

  if (!initialTargetRef.current && initialTarget) {
    initialTargetRef.current = initialTarget;
  }

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    if (!isBootReady) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const nextMap = initializeLeaflet(container);
    const initialView = isCommonViewState(initialTargetRef.current)
      ? buildLeafletViewFromState(
          initialTargetRef.current,
          container.clientWidth,
          container.clientHeight
        )
      : null;
    if (initialView) {
      nextMap.setView(
        [initialView.center.lat, initialView.center.lng],
        initialView.zoom,
        { animate: false }
      );
    }
    setMap(nextMap);
    onReadyChangeRef.current?.({
      framework: "leaflet",
      map: nextMap,
      container,
    });

    return () => {
      onReadyChangeRef.current?.(null);
      nextMap.remove();
      setMap(null);
    };
  }, [isBootReady]);

  useContainerResize(containerRef, () => {
    if (!map) {
      return;
    }

    map.invalidateSize(false);
  });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...containerStyle,
        }}
      />
      {map && registerWithViewSync ? (
        <LeafletViewSyncBridge
          slotId={slotId}
          map={map}
          setStatusText={reportStatus ? setStatusText : () => {}}
          setHashText={reportStatus ? setHashText : () => {}}
        />
      ) : null}
    </>
  );
};

const SlotMountRenderer = ({
  slotId,
  mount,
  initialTarget,
  setStatusText,
  setHashText,
  onRuntimeHandleChange,
  bootDelayMs = 0,
}: {
  slotId: string;
  mount: SlotMountConfig;
  initialTarget: CommonViewState | null;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  onRuntimeHandleChange: (
    mountId: string,
    handle: SlotRuntimeHandle | null
  ) => void;
  bootDelayMs?: number;
}) => {
  const containerStyle: CSSProperties =
    mount.layer === "overlay"
      ? {
          zIndex: 6,
          opacity: 0,
          pointerEvents: "none",
        }
      : mount.layer === "underlay"
      ? {
          zIndex: 1,
        }
      : {
          zIndex: 3,
        };

  if (!initialTarget) {
    return null;
  }

  if (mount.framework === "cesium") {
    return (
      <CesiumSlot
        slotId={slotId}
        setStatusText={setStatusText}
        setHashText={setHashText}
        initialTarget={initialTarget}
        registerWithViewSync={mount.registerWithViewSync}
        reportStatus={mount.reportStatus}
        onReadyChange={(handle) => onRuntimeHandleChange(mount.id, handle)}
        containerStyle={containerStyle}
        bootDelayMs={bootDelayMs}
      />
    );
  }

  if (mount.framework === "maplibre") {
    return (
      <MapLibreSlot
        slotId={slotId}
        setStatusText={setStatusText}
        setHashText={setHashText}
        initialTarget={initialTarget}
        registerWithViewSync={mount.registerWithViewSync}
        reportStatus={mount.reportStatus}
        onReadyChange={(handle) => onRuntimeHandleChange(mount.id, handle)}
        containerStyle={containerStyle}
        bootDelayMs={bootDelayMs}
      />
    );
  }

  return (
    <LeafletSlot
      slotId={slotId}
      setStatusText={setStatusText}
      setHashText={setHashText}
      initialTarget={initialTarget}
      registerWithViewSync={mount.registerWithViewSync}
      reportStatus={mount.reportStatus}
      onReadyChange={(handle) => onRuntimeHandleChange(mount.id, handle)}
      containerStyle={containerStyle}
      bootDelayMs={bootDelayMs}
    />
  );
};

const SlotsLayout = ({
  fallbackTarget,
}: {
  fallbackTarget: CommonViewState;
}) => {
  const [slots, setSlots] = useState<SlotConfig[]>([
    { id: "slot-1", framework: "cesium" },
    { id: "slot-2", framework: "maplibre" },
    { id: "slot-3", framework: "leaflet" },
  ]);
  const nextSlotIndexRef = useRef(4);
  const ctx = useContext(ViewStateContext);
  const controllerId = useViewStateControllerId();
  const initialControllerAssignedRef = useRef(false);
  const [transitioningSlotIds, setTransitioningSlotIds] = useState<string[]>(
    []
  );
  const isAnyFrameworkTransitioning = transitioningSlotIds.length > 0;

  // Auto-assign controller to the first slot only once during initial boot.
  // Do not silently steal control back later when a user-controlled framework
  // goes idle.
  useEffect(() => {
    if (
      initialControllerAssignedRef.current ||
      controllerId ||
      slots.length === 0 ||
      !ctx
    ) {
      return;
    }

    let rafId: number | null = null;
    const tryInitialClaim = () => {
      if (initialControllerAssignedRef.current || ctx.getControllerId()) {
        return;
      }

      if (ctx.claimControl(slots[0]?.id ?? "", "sync")) {
        initialControllerAssignedRef.current = true;
        return;
      }

      rafId = window.requestAnimationFrame(tryInitialClaim);
    };

    rafId = window.requestAnimationFrame(tryInitialClaim);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [controllerId, ctx, slots]);

  const addSlot = useCallback(() => {
    const nextIndex = nextSlotIndexRef.current++;
    setSlots((previousSlots) => [
      ...previousSlots,
      {
        id: `slot-${nextIndex}`,
        framework:
          FRAMEWORK_OPTIONS[(nextIndex - 1) % FRAMEWORK_OPTIONS.length],
      },
    ]);
  }, []);

  const updateSlotFramework = useCallback(
    (slotId: string, framework: SlotFramework) => {
      setSlots((previousSlots) =>
        previousSlots.map((slot) =>
          slot.id === slotId ? { ...slot, framework } : slot
        )
      );
    },
    []
  );

  const deleteSlot = useCallback((slotId: string) => {
    setSlots((previousSlots) =>
      previousSlots.length > 1
        ? previousSlots.filter((slot) => slot.id !== slotId)
        : previousSlots
    );
  }, []);

  const handleTransitioningChange = useCallback(
    (slotId: string, isTransitioning: boolean) => {
      setTransitioningSlotIds((previous) => {
        const next = new Set(previous);
        if (isTransitioning) {
          next.add(slotId);
        } else {
          next.delete(slotId);
        }
        return [...next];
      });
    },
    []
  );

  return (
    <>
      <div style={panelsRowStyle}>
        {slots.map((slot, index) => (
          <SlotPanelController
            key={slot.id}
            slot={slot}
            fallbackTarget={fallbackTarget}
            initialBootDelayMs={INITIAL_SLOT_BOOT_DELAY_STEP_MS * index}
            canDelete={slots.length > 1}
            isController={controllerId === slot.id}
            disableFrameworkSelection={isAnyFrameworkTransitioning}
            onFrameworkChange={(framework) =>
              updateSlotFramework(slot.id, framework)
            }
            onDelete={() => deleteSlot(slot.id)}
            onTransitioningChange={(isTransitioning) =>
              handleTransitioningChange(slot.id, isTransitioning)
            }
          />
        ))}

        <div style={addButtonStyle}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addSlot}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 0,
            }}
          />
        </div>
      </div>
      <div style={overlayLayerStyle}>
        <ViewSyncMetaOverlay
          fallbackTarget={fallbackTarget}
          style={{
            position: "absolute",
            top: 44,
            right: 12,
            zIndex: 1,
          }}
        />
      </div>
    </>
  );
};

const SlotPanelController = ({
  slot,
  fallbackTarget,
  initialBootDelayMs = 0,
  isController,
  disableFrameworkSelection,
  canDelete,
  onFrameworkChange,
  onDelete,
  onTransitioningChange,
}: {
  slot: SlotConfig;
  fallbackTarget: CommonViewState;
  initialBootDelayMs?: number;
  isController: boolean;
  disableFrameworkSelection: boolean;
  canDelete: boolean;
  onFrameworkChange: (framework: SlotFramework) => void;
  onDelete: () => void;
  onTransitioningChange: (isTransitioning: boolean) => void;
}) => {
  const ctx = useContext(ViewStateContext);
  const controllerId = useViewStateControllerId();
  const currentState = useViewState();
  const providerTarget = currentState ?? fallbackTarget;
  const [statusText, setStatusText] = useState(`${slot.framework} • booting`);
  const [hashText, setHashText] = useState<string | null>(null);
  const [mounts, setMounts] = useState<SlotMountConfig[]>([
    {
      id: `${slot.id}-mount-1`,
      framework: slot.framework,
      registerWithViewSync: true,
      reportStatus: true,
      layer: "base",
    },
  ]);
  const [transitionRequest, setTransitionRequest] =
    useState<SlotTransitionRequest | null>(null);
  const runtimeHandlesRef = useRef<Record<string, SlotRuntimeHandle | null>>(
    {}
  );
  const transitionRunRef = useRef<string | null>(null);
  const nextMountIndexRef = useRef(2);
  const [initialBootDelayConsumed, setInitialBootDelayConsumed] = useState(
    initialBootDelayMs <= 0
  );
  const activeRuntimeFramework =
    mounts.find((mount) => mount.registerWithViewSync)?.framework ??
    slot.framework;
  const isFrameworkTransitioning = transitionRequest !== null;

  useEffect(() => {
    onTransitioningChange(isFrameworkTransitioning);
    return () => {
      onTransitioningChange(false);
    };
  }, [isFrameworkTransitioning, onTransitioningChange]);

  useEffect(() => {
    setStatusText(`${slot.framework} • booting`);
    setHashText(null);
  }, [slot.framework]);

  useEffect(() => {
    if (isFrameworkTransitioning) {
      return;
    }

    setMounts((previousMounts) => {
      const activeMount = previousMounts.find(
        (mount) => mount.registerWithViewSync
      );
      if (
        previousMounts.length === 1 &&
        activeMount &&
        activeMount.framework === slot.framework
      ) {
        return previousMounts;
      }

      return [
        {
          id: activeMount?.id ?? `${slot.id}-mount-1`,
          framework: slot.framework,
          registerWithViewSync: true,
          reportStatus: true,
          layer: "base",
        },
      ];
    });
  }, [isFrameworkTransitioning, slot.framework, slot.id]);

  const handleRuntimeHandleChange = useCallback(
    (mountId: string, handle: SlotRuntimeHandle | null) => {
      runtimeHandlesRef.current[mountId] = handle;
      if (handle && !initialBootDelayConsumed) {
        setInitialBootDelayConsumed(true);
      }
    },
    [initialBootDelayConsumed]
  );

  const getActiveRuntimeHandle = useCallback((): SlotRuntimeHandle | null => {
    const activeMount = mounts.find((mount) => mount.registerWithViewSync);
    if (!activeMount) {
      return null;
    }
    return runtimeHandlesRef.current[activeMount.id] ?? null;
  }, [mounts]);

  const handleFrameworkSelection = useCallback(
    (nextFramework: SlotFramework) => {
      if (nextFramework === slot.framework || isFrameworkTransitioning) {
        return;
      }

      const activeMount = mounts.find((mount) => mount.registerWithViewSync);
      if (!activeMount) {
        onFrameworkChange(nextFramework);
        return;
      }

      if (isLeafletCesiumTransition(activeMount.framework, nextFramework)) {
        const targetMountId = `${slot.id}-mount-${nextMountIndexRef.current++}`;
        const restoreControllerAfterTransition = controllerId === slot.id;

        // Pause shared sync while this slot is visually handing off between engines.
        // The slot can reclaim controller ownership after the transition completes.
        if (restoreControllerAfterTransition) {
          ctx?.releaseControl(slot.id);
        }

        setMounts((previousMounts) => [
          ...previousMounts.map((mount) =>
            mount.id === activeMount.id
              ? {
                  ...mount,
                  registerWithViewSync: false,
                  reportStatus: false,
                  layer: "base",
                }
              : mount
          ),
          {
            id: targetMountId,
            framework: nextFramework,
            registerWithViewSync: false,
            reportStatus: false,
            layer: nextFramework === "cesium" ? "overlay" : "underlay",
          },
        ]);
        setTransitionRequest({
          sourceMountId: activeMount.id,
          targetMountId,
          sourceFramework: activeMount.framework,
          targetFramework: nextFramework,
          restoreControllerAfterTransition,
        });
        onFrameworkChange(nextFramework);
        return;
      }

      setMounts([
        {
          id: `${slot.id}-mount-${nextMountIndexRef.current++}`,
          framework: nextFramework,
          registerWithViewSync: true,
          reportStatus: true,
          layer: "base",
        },
      ]);
      onFrameworkChange(nextFramework);
    },
    [
      isFrameworkTransitioning,
      mounts,
      onFrameworkChange,
      slot.framework,
      slot.id,
      controllerId,
      ctx,
    ]
  );

  useEffect(() => {
    if (
      !transitionRequest ||
      transitionRunRef.current === transitionRequest.targetMountId
    ) {
      return;
    }

    const sourceHandle =
      runtimeHandlesRef.current[transitionRequest.sourceMountId];
    const targetHandle =
      runtimeHandlesRef.current[transitionRequest.targetMountId];
    if (!sourceHandle || !targetHandle) {
      return;
    }

    transitionRunRef.current = transitionRequest.targetMountId;

    const completeTransition = () => {
      setMounts((previousMounts) =>
        previousMounts
          .filter((mount) => mount.id !== transitionRequest.sourceMountId)
          .map((mount) =>
            mount.id === transitionRequest.targetMountId
              ? {
                  ...mount,
                  registerWithViewSync: true,
                  reportStatus: true,
                  layer: "base",
                }
              : mount
          )
      );
      delete runtimeHandlesRef.current[transitionRequest.sourceMountId];
      setTransitionRequest(null);
      transitionRunRef.current = null;

      if (transitionRequest.restoreControllerAfterTransition) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            ctx?.claimControl(slot.id, "sync");
          });
        });
      }
    };

    const revertTransition = (message: string) => {
      setStatusText(message);
      setMounts((previousMounts) =>
        previousMounts
          .filter((mount) => mount.id !== transitionRequest.targetMountId)
          .map((mount) =>
            mount.id === transitionRequest.sourceMountId
              ? {
                  ...mount,
                  registerWithViewSync: true,
                  reportStatus: true,
                  layer: "base",
                }
              : mount
          )
      );
      delete runtimeHandlesRef.current[transitionRequest.targetMountId];
      onFrameworkChange(transitionRequest.sourceFramework);
      setTransitionRequest(null);
      transitionRunRef.current = null;
    };

    const runTransition = async () => {
      try {
        if (
          transitionRequest.sourceFramework === "leaflet" &&
          transitionRequest.targetFramework === "cesium" &&
          sourceHandle.framework === "leaflet" &&
          targetHandle.framework === "cesium"
        ) {
          const targetCameraState =
            toCesiumCameraStateFromViewSyncTarget(
              providerTarget,
              targetHandle.widget.scene
            ) ?? lastCesiumCameraStateRef.current;

          await transitionToCesium(
            targetHandle.widget.scene,
            sourceHandle.map,
            targetHandle.container,
            targetHandle.terrainProviders,
            targetCameraState,
            {
              onStageChange: (_stage, message) =>
                setStatusText(`leaflet -> cesium • ${message}`),
              onComplete: completeTransition,
              onError: (error) =>
                revertTransition(`leaflet -> cesium • ${error.message}`),
            },
            LEAFLET_TO_CESIUM_TRANSITION_OPTIONS
          );
          return;
        }

        if (
          transitionRequest.sourceFramework === "cesium" &&
          transitionRequest.targetFramework === "leaflet" &&
          sourceHandle.framework === "cesium" &&
          targetHandle.framework === "leaflet"
        ) {
          const lastCameraState = await transitionToLeaflet(
            sourceHandle.widget.scene,
            targetHandle.map,
            sourceHandle.container,
            sourceHandle.terrainProviders,
            {
              onStageChange: (_stage, message) =>
                setStatusText(`cesium -> leaflet • ${message}`),
              onComplete: completeTransition,
              onError: (error) =>
                revertTransition(`cesium -> leaflet • ${error.message}`),
            }
          );
          lastCesiumCameraStateRef.current = lastCameraState ?? null;
          return;
        }

        revertTransition("framework transition unsupported");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "transition failed";
        revertTransition(
          `${transitionRequest.sourceFramework} -> ${transitionRequest.targetFramework} • ${message}`
        );
      }
    };

    void runTransition();
  }, [onFrameworkChange, providerTarget, slot.id, transitionRequest]);

  return (
    <FrameworkPanel
      slot={slot}
      activeRuntimeFramework={activeRuntimeFramework}
      isController={isController}
      canDelete={canDelete}
      isFrameworkTransitioning={isFrameworkTransitioning}
      disableFrameworkSelection={disableFrameworkSelection}
      onFrameworkChange={handleFrameworkSelection}
      onDelete={onDelete}
      statusText={statusText}
      hashText={hashText}
    >
      <PanelNavigationControls
        slotId={slot.id}
        framework={activeRuntimeFramework}
        getRuntimeHandle={getActiveRuntimeHandle}
        disabled={isFrameworkTransitioning}
      />
      {mounts.map((mount) => (
        <SlotMountRenderer
          key={mount.id}
          slotId={slot.id}
          mount={mount}
          initialTarget={providerTarget}
          setStatusText={setStatusText}
          setHashText={setHashText}
          onRuntimeHandleChange={handleRuntimeHandleChange}
          bootDelayMs={
            !initialBootDelayConsumed &&
            !isFrameworkTransitioning &&
            mounts.length === 1 &&
            mount.layer === "base"
              ? initialBootDelayMs
              : 0
          }
        />
      ))}
    </FrameworkPanel>
  );
};

const ViewSyncStoryArgsSync = ({ target }: { target: CommonViewState }) => {
  const ctx = useContext(ViewStateContext);
  const animationFrameRef = useRef<number | null>(null);

  // Register as a source so we can push state
  useEffect(() => {
    return ctx?.register("storybook-controls", "system");
  }, [ctx]);

  useEffect(() => {
    if (!ctx) return;

    const push = () => {
      ctx.update(target, {
        sourceId: "storybook-controls",
        timestampMs: Date.now(),
        priority: "restore",
      });
    };

    if (typeof window === "undefined") {
      push();
      return;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      push();
      animationFrameRef.current = null;
    });

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [ctx, target]);

  return null;
};

export const ViewSyncStory = (props: ViewSyncStoryProps) => {
  const initialTarget = useMemo(
    () => createStoryTargetState(props),
    [
      props.altitudeM,
      props.bearingDeg,
      props.fovVerticalDeg,
      props.farPlaneM,
      props.latitudeDeg,
      props.longitudeDeg,
      props.nearPlaneM,
      props.pitchDeg,
      props.rangeM,
    ]
  );
  return (
    <ViewStateProvider>
      <ViewSyncStoryArgsSync target={initialTarget} />
      <div style={shellStyle}>
        <SlotsLayout fallbackTarget={initialTarget} />
      </div>
    </ViewStateProvider>
  );
};
