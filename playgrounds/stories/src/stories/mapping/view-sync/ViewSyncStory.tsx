import {
  useCallback,
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
import type { StyleSpecification } from "maplibre-gl";
import { Button, Radio, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { CompassNeedleSVG } from "@carma-mapping/components";
import { WUPPERTAL } from "@carma-commons/resources";
import {
  WUPPERTAL_CONFIG,
  createDefaultStyle,
} from "@carma-mapping/engines/maplibre";
import {
  CesiumSceneStateProvider,
  useCesiumSceneStateOptional,
} from "@carma-mapping/engines/cesium/react/scene-state";
import {
  ViewSyncProvider,
  readViewSyncVerticalFov,
  projectLeafletViewToViewSyncTarget,
  projectMapLibreViewToViewSyncTarget,
  projectViewSyncTargetToLeaflet,
  projectViewSyncTargetToMapLibre,
  readViewSyncTargetFromSceneState,
  transitionToCesium,
  transitionToLeaflet,
  useRegisterViewSyncParticipant,
  useViewSyncState,
  useViewSyncStore,
  useViewSyncTargetState,
  type ViewSyncPublishedState,
  type ViewSyncState,
  type ViewSyncTargetState,
} from "@carma-mapping/engines-interop";
import {
  Cartographic,
  HeadingPitchRange,
  PerspectiveFrustum,
  releaseCameraFromOrbitMode,
  type HeadingPitchJson,
  type CesiumWidget,
} from "@carma/cesium";
import {
  readCesiumCameraHashSnapshotFromSceneState,
  readCesiumCarmaObjectCentricHashParams,
} from "@carma-providers/hash-state";
import {
  degToRadNumeric,
  radToDegNumeric,
} from "@carma/units/helpers";
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
} from "./ViewSyncStoryChrome";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/__cesium__/";
}

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
  map: maplibregl.Map;
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

type MapLibreViewState = {
  lngDeg: number;
  latDeg: number;
  zoom: number;
  bearingDeg: number;
  pitchDeg: number;
};

type LeafletViewState = {
  lngDeg: number;
  latDeg: number;
  zoom: number;
};

export type ViewSyncStoryProps = {
  longitudeDeg?: number;
  latitudeDeg?: number;
  altitudeM?: number;
  headingDeg?: number;
  pitchDeg?: number;
  rangeM?: number;
  fovVerticalDeg?: number;
  nearPlaneM?: number;
  farPlaneM?: number;
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

const storyTargetState: ViewSyncTargetState = {
  anchor: {
    longitude: degToRadNumeric(WUPPERTAL.position.longitude),
    latitude: degToRadNumeric(WUPPERTAL.position.latitude),
    altitude: WUPPERTAL.position.altitude,
  },
  headingPitchRange: {
    heading: degToRadNumeric(214),
    pitch: degToRadNumeric(-48),
    range: 620,
  },
  fovVertical: DEFAULT_FOV_RAD,
  type: "PerspectiveCamera",
};

const createStoryTargetState = ({
  longitudeDeg = WUPPERTAL.position.longitude,
  latitudeDeg = WUPPERTAL.position.latitude,
  altitudeM = WUPPERTAL.position.altitude,
  headingDeg = 214,
  pitchDeg = -48,
  rangeM = 620,
  fovVerticalDeg = radToDegNumeric(DEFAULT_FOV_RAD),
  nearPlaneM,
  farPlaneM,
}: ViewSyncStoryProps = {}): ViewSyncTargetState => ({
  anchor: {
    longitude: degToRadNumeric(longitudeDeg),
    latitude: degToRadNumeric(latitudeDeg),
    altitude: altitudeM,
  },
  headingPitchRange: {
    heading: degToRadNumeric(headingDeg),
    pitch: degToRadNumeric(pitchDeg),
    range: rangeM,
  },
  fovVertical: degToRadNumeric(fovVerticalDeg),
  ...(Number.isFinite(nearPlaneM) ? { near: nearPlaneM } : {}),
  ...(Number.isFinite(farPlaneM) ? { far: farPlaneM } : {}),
  type: "PerspectiveCamera",
});

const createInitialViewSyncState = (
  target: ViewSyncTargetState
): Partial<ViewSyncState> => ({
  target: {
    sourceId: "bootstrap",
    sourceEngine: "system",
    frameNumber: null,
    timestampMs: Date.now(),
    target,
  },
});

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

const readMapLibreViewState = (map: maplibregl.Map): MapLibreViewState => {
  const center = map.getCenter();
  return {
    lngDeg: center.lng,
    latDeg: center.lat,
    zoom: map.getZoom(),
    bearingDeg: map.getBearing(),
    pitchDeg: map.getPitch(),
  };
};

const readLeafletViewState = (map: L.Map): LeafletViewState | null => {
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
): toFramework is "leaflet" | "cesium" =>
  fromFramework !== toFramework &&
  isLeafletCesiumFramework(fromFramework) &&
  isLeafletCesiumFramework(toFramework);

const getViewportFromElement = (element: HTMLElement) => ({
  widthPx: Math.max(1, element.clientWidth),
  heightPx: Math.max(1, element.clientHeight),
});

const getCurrentAnchorAltitude = (
  targetState: ViewSyncPublishedState | null
): number => targetState?.target.anchor.altitude ?? DEFAULT_ANCHOR_ALTITUDE_M;

const getCurrentVerticalFov = (
  targetState: ViewSyncPublishedState | null
): number => {
  const target = targetState?.target;
  return target ? readViewSyncVerticalFov(target) ?? DEFAULT_FOV_RAD : DEFAULT_FOV_RAD;
};

const getCurrentHeadingDeg = (
  targetState: ViewSyncPublishedState | null
): number =>
  targetState ? radToDegNumeric(targetState.target.headingPitchRange.heading) : 0;

const toHeadingPitchJsonFromViewSyncTarget = (
  target: ViewSyncTargetState | null | undefined
): HeadingPitchJson | null => {
  if (!target) {
    return null;
  }

  return {
    heading: target.headingPitchRange.heading,
    pitch: target.headingPitchRange.pitch,
  };
};

const MIN_COMPASS_PITCH_DEG = 0;
const MAX_COMPASS_PITCH_DEG = 85;
const COMPASS_DRAG_FACTOR_DEG_PER_PX = 0.3;
const META_VISUAL_WIDTH_PX = 176;
const META_VISUAL_HEIGHT_PX = 176;
const INITIAL_SLOT_BOOT_DELAY_STEP_MS = 220;

const toCompassPitchDeg = (pitchRad: number): number =>
  Math.max(
    MIN_COMPASS_PITCH_DEG,
    Math.min(MAX_COMPASS_PITCH_DEG, 90 + radToDegNumeric(pitchRad))
  );

const fromCompassPitchDeg = (pitchDeg: number): number =>
  degToRadNumeric(pitchDeg - 90);

const formatHashDecimal = (value: number, fractionDigits: number): string =>
  Number(value.toFixed(fractionDigits)).toString();

const encodeQueryHash = (params: Record<string, number | undefined>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      query.set(key, String(value));
    }
  }
  return `#/?${query.toString()}`;
};

const buildCesiumObjectCentricHash = (
  sceneState: ReturnType<typeof useCesiumSceneStateOptional>
): string | null => {
  const snapshot = readCesiumCameraHashSnapshotFromSceneState({
    sceneState,
    anchorMode: "screen-center",
    fallbackHeightM: DEFAULT_ANCHOR_ALTITUDE_M,
  });
  if (!snapshot) {
    return null;
  }

  return encodeQueryHash(readCesiumCarmaObjectCentricHashParams({ snapshot, sceneState }));
};

const buildMapLibreHash = (view: MapLibreViewState): string =>
  `#${formatHashDecimal(view.zoom, 2)}/${formatHashDecimal(
    view.latDeg,
    5
  )}/${formatHashDecimal(view.lngDeg, 5)}/${formatHashDecimal(
    view.bearingDeg,
    1
  )}/${formatHashDecimal(view.pitchDeg, 1)}`;

const buildLeafletHash = (view: LeafletViewState): string =>
  `#${formatHashDecimal(view.zoom, 2)}/${formatHashDecimal(
    view.latDeg,
    5
  )}/${formatHashDecimal(view.lngDeg, 5)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

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

const useDeferredBootReady = (
  enabled: boolean,
  delayMs: number = 0
) => {
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

const usePanelTargetState = (
  slotId: string
): ViewSyncPublishedState | null => {
  const viewSyncState = useViewSyncState();
  return (
    viewSyncState.latestById[slotId] ??
    (viewSyncState.target?.sourceId === slotId ? viewSyncState.target : null) ??
    viewSyncState.target ??
    null
  );
};

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
  const viewSyncStore = useViewSyncStore();
  const publishedState = usePanelTargetState(slotId);
  const canPitch = framework !== "leaflet";
  const initialDragStateRef = useRef<{
    mouseX: number;
    mouseY: number;
    headingDeg: number;
    pitchDeg: number;
    range: number;
  } | null>(null);

  const applyTargetUpdate = useCallback(
    (update: (target: ViewSyncTargetState) => ViewSyncTargetState) => {
      const baseTarget = publishedState?.target;
      if (!baseTarget) {
        return;
      }

      viewSyncStore.setController(slotId);
      const nextTarget = update(baseTarget);
      const runtimeHandle = getRuntimeHandle();

      if (runtimeHandle?.framework === "maplibre") {
        const projection = projectViewSyncTargetToMapLibre({
          target: nextTarget,
          viewport: getViewportFromElement(runtimeHandle.container),
        });
        if (projection) {
          runtimeHandle.map.jumpTo({
            center: [projection.lng, projection.lat],
            zoom: projection.zoom,
            bearing: projection.bearing,
            pitch: projection.pitch,
          });
          return;
        }
      }

      if (runtimeHandle?.framework === "leaflet") {
        const projection = projectViewSyncTargetToLeaflet({
          target: nextTarget,
          viewport: getViewportFromElement(runtimeHandle.container),
        });
        if (projection) {
          runtimeHandle.map.setView(
            [projection.center.lat, projection.center.lng],
            projection.zoom,
            { animate: false }
          );
          return;
        }
      }

      if (runtimeHandle?.framework === "cesium") {
        const cartographic = Cartographic.fromRadians(
          nextTarget.anchor.longitude,
          nextTarget.anchor.latitude,
          nextTarget.anchor.altitude
        );
        const destination = Cartographic.toCartesian(cartographic);
        if (destination) {
          runtimeHandle.widget.camera.lookAt(
            destination,
            new HeadingPitchRange(
              nextTarget.headingPitchRange.heading,
              nextTarget.headingPitchRange.pitch,
              nextTarget.headingPitchRange.range
            )
          );
          releaseCameraFromOrbitMode(runtimeHandle.widget.camera);
          if (
            nextTarget.fovVertical &&
            runtimeHandle.widget.camera.frustum instanceof PerspectiveFrustum
          ) {
            runtimeHandle.widget.camera.frustum.fov = nextTarget.fovVertical;
          }
          runtimeHandle.widget.scene.requestRender();
          return;
        }
      }

      viewSyncStore.setTargetState(nextTarget, {
        sourceId: slotId,
        sourceEngine: framework,
      });
    },
    [framework, getRuntimeHandle, publishedState, slotId, viewSyncStore]
  );

  const handleZoomIn = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      applyTargetUpdate((target) => ({
        ...target,
        headingPitchRange: {
          ...target.headingPitchRange,
          range: Math.max(5, target.headingPitchRange.range * 0.5),
        },
      }));
    },
    [applyTargetUpdate]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      applyTargetUpdate((target) => ({
        ...target,
        headingPitchRange: {
          ...target.headingPitchRange,
          range: target.headingPitchRange.range * 2,
        },
      }));
    },
    [applyTargetUpdate]
  );

  const handleCompassMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!canPitch || !publishedState) {
        return;
      }

      initialDragStateRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        headingDeg: radToDegNumeric(
          publishedState.target.headingPitchRange.heading
        ),
        pitchDeg: toCompassPitchDeg(
          publishedState.target.headingPitchRange.pitch
        ),
        range: publishedState.target.headingPitchRange.range,
      };
    },
    [canPitch, publishedState, slotId, viewSyncStore]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = initialDragStateRef.current;
      if (!dragState || !publishedState) {
        return;
      }

      const nextHeadingDeg =
        dragState.headingDeg +
        (event.clientX - dragState.mouseX) * COMPASS_DRAG_FACTOR_DEG_PER_PX;
      const nextPitchDeg = Math.max(
        MIN_COMPASS_PITCH_DEG,
        Math.min(
          MAX_COMPASS_PITCH_DEG,
          dragState.pitchDeg -
            (event.clientY - dragState.mouseY) * COMPASS_DRAG_FACTOR_DEG_PER_PX
        )
      );

      applyTargetUpdate((target) => ({
        ...target,
        headingPitchRange: {
          ...target.headingPitchRange,
          heading: degToRadNumeric(nextHeadingDeg),
          pitch: fromCompassPitchDeg(nextPitchDeg),
          range: dragState.range,
        },
      }));
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
  }, [applyTargetUpdate, publishedState]);

  const handleCompassReset = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canPitch) {
        return;
      }

      applyTargetUpdate((target) => ({
        ...target,
        headingPitchRange: {
          ...target.headingPitchRange,
          heading: degToRadNumeric(0),
          pitch: fromCompassPitchDeg(0),
        },
      }));
    },
    [applyTargetUpdate, canPitch]
  );

  const headingDeg = publishedState
    ? radToDegNumeric(publishedState.target.headingPitchRange.heading)
    : 0;
  const pitchDeg = publishedState
    ? toCompassPitchDeg(publishedState.target.headingPitchRange.pitch)
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex flex-col">
        <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
          <ControlButtonStyler
            onClick={handleZoomIn}
            disabled={disabled}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
            dataTestId={`${slotId}-zoom-in-control`}
            title="Vergrößern"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
        </Tooltip>
        <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
          <ControlButtonStyler
            onClick={handleZoomOut}
            disabled={disabled}
            className="!rounded-t-none !border-t-[1px]"
            dataTestId={`${slotId}-zoom-out-control`}
            title="Verkleinern"
          >
            <FontAwesomeIcon icon={faMinus} className="text-base" />
          </ControlButtonStyler>
        </Tooltip>
      </div>

      <Tooltip
        title={
          canPitch
            ? "Kippen und drehen"
            : "Pitch-Kompass für Leaflet nicht verfügbar"
        }
        placement="right"
      >
        <div>
          <ControlButtonStyler
            disabled={disabled || !canPitch}
            useDisabledStyle={disabled || !canPitch}
            // Leaflet has no pitch/rotation controls, and slot transitions should not be interrupted.
            dataTestId={`${slotId}-compass-control`}
          >
            <div
              onMouseDown={handleCompassMouseDown}
              onClick={handleCompassReset}
              style={{
                border: "none",
                background: "transparent",
                width: "28px",
                height: "28px",
                display: "flex",
                margin: 0,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <CompassNeedleSVG pitch={pitchDeg} heading={headingDeg} />
            </div>
          </ControlButtonStyler>
        </div>
      </Tooltip>
    </div>
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
  const sceneState = useCesiumSceneStateOptional();
  const providerTarget = useViewSyncTargetState();
  const { isController, claimControl, publishViewState } =
    useRegisterViewSyncParticipant({
      id: slotId,
      engine: "cesium",
    });

  useEffect(() => {
    const canvas = widget.scene.canvas;
    return claimOnContainerInteraction(canvas, claimControl, {
      current: false,
    });
  }, [claimControl, widget.scene.canvas]);

  useEffect(() => {
    const nextTarget = readViewSyncTargetFromSceneState(sceneState);
    setStatusText(
      nextTarget
        ? `cesium • ${formatTargetSummary(nextTarget)}`
        : "cesium • waiting for terrain target"
    );
    setHashText(buildCesiumObjectCentricHash(sceneState));

    if (!isController || !nextTarget || !sceneState) {
      return;
    }

    publishViewState(nextTarget, {
      frameNumber: sceneState.frameNumber,
      timestampMs: sceneState.timestampMs,
      claimControl: true,
    });
  }, [isController, publishViewState, sceneState, setHashText, setStatusText]);

  useEffect(() => {
    if (
      isController ||
      !providerTarget ||
      providerTarget.sourceId === slotId
    ) {
      return;
    }

    const cartographic = Cartographic.fromRadians(
      providerTarget.target.anchor.longitude,
      providerTarget.target.anchor.latitude,
      providerTarget.target.anchor.altitude
    );
    const destination = Cartographic.toCartesian(cartographic);
    if (!destination) {
      return;
    }

    widget.camera.lookAt(
      destination,
      new HeadingPitchRange(
        providerTarget.target.headingPitchRange.heading,
        providerTarget.target.headingPitchRange.pitch,
        providerTarget.target.headingPitchRange.range
      )
    );
    releaseCameraFromOrbitMode(widget.camera);

    if (
      providerTarget.target.fovVertical &&
      widget.camera.frustum instanceof PerspectiveFrustum
    ) {
      widget.camera.frustum.fov = providerTarget.target.fovVertical;
    }

    widget.scene.requestRender();
  }, [isController, providerTarget, slotId, widget]);

  return null;
};

const CesiumSlot = ({
  slotId,
  setStatusText,
  setHashText,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: CesiumRuntimeHandle | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widget, setWidget] = useState<CesiumWidget | null>(null);
  const terrainProvidersRef = useRef<
    Awaited<ReturnType<typeof initializeTerrainProviders>> | null
  >(null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

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

    (async () => {
      nextWidget = initializeCesium(container, {
        useBrowserRecommendedResolution: true,
      });

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
        <CesiumSceneStateProvider
          scene={widget.scene}
          options={{
            orbitPointMode: "screen-center",
            screenCenterSamplingStrategy: "terrain-first",
          }}
        >
          <CesiumViewSyncBridge
            slotId={slotId}
            widget={widget}
            setStatusText={reportStatus ? setStatusText : () => {}}
            setHashText={reportStatus ? setHashText : () => {}}
          />
        </CesiumSceneStateProvider>
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
  map: maplibregl.Map;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
}) => {
  const isApplyingExternalRef = useRef(false);
  const providerTarget = useViewSyncTargetState();
  const { isController, claimControl, publishViewState } =
    useRegisterViewSyncParticipant({
      id: slotId,
      engine: "maplibre",
    });
  const providerTargetRef = useRef(providerTarget);
  const isControllerRef = useRef(isController);

  useEffect(() => {
    providerTargetRef.current = providerTarget;
  }, [providerTarget]);

  useEffect(() => {
    isControllerRef.current = isController;
  }, [isController]);

  useEffect(() => {
    const container = map.getContainer();
    const cleanupInteraction = claimOnContainerInteraction(
      container,
      claimControl,
      isApplyingExternalRef
    );

    const updateStatus = () => {
      const view = readMapLibreViewState(map);
      setStatusText(
        `maplibre • ${view.lngDeg.toFixed(5)} • ${view.latDeg.toFixed(
          5
        )} • z ${view.zoom.toFixed(2)} • b ${view.bearingDeg.toFixed(
          1
        )}° • p ${view.pitchDeg.toFixed(1)}°`
      );
      setHashText(buildMapLibreHash(view));

      if (!isControllerRef.current) {
        return;
      }

      const target = projectMapLibreViewToViewSyncTarget({
        ...view,
        anchorAltitudeM: getCurrentAnchorAltitude(providerTargetRef.current),
        fovVertical: getCurrentVerticalFov(providerTargetRef.current),
        viewport: getViewportFromElement(map.getContainer()),
      });

      if (target) {
        publishViewState(target, {
          claimControl: true,
        });
      }
    };

    map.on("load", updateStatus);
    map.on("move", updateStatus);
    map.on("rotate", updateStatus);
    map.on("pitch", updateStatus);
    map.on("resize", updateStatus);

    return () => {
      cleanupInteraction();
      map.off("load", updateStatus);
      map.off("move", updateStatus);
      map.off("rotate", updateStatus);
      map.off("pitch", updateStatus);
      map.off("resize", updateStatus);
    };
  }, [claimControl, map, publishViewState, setHashText, setStatusText]);

  useEffect(() => {
    if (isController || !providerTarget || providerTarget.sourceId === slotId) {
      return;
    }

    const projection = projectViewSyncTargetToMapLibre({
      target: providerTarget.target,
      viewport: getViewportFromElement(map.getContainer()),
    });

    if (!projection) {
      return;
    }

    isApplyingExternalRef.current = true;
    map.jumpTo({
      center: [projection.lng, projection.lat],
      zoom: projection.zoom,
      bearing: projection.bearing,
      pitch: projection.pitch,
    });
    window.requestAnimationFrame(() => {
      isApplyingExternalRef.current = false;
    });
  }, [isController, map, providerTarget, slotId]);

  return null;
};

const MapLibreSlot = ({
  slotId,
  setStatusText,
  setHashText,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: MapLibreRuntimeHandle | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

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

    const map = new maplibregl.Map({
      container,
      style: GEO_PORTAL_MAPLIBRE_STYLE as StyleSpecification,
      center: [WUPPERTAL.position.longitude, WUPPERTAL.position.latitude],
      zoom: 16.5,
      bearing: 0,
      pitch: 0,
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
  const isApplyingExternalRef = useRef(false);
  const providerTarget = useViewSyncTargetState();
  const { isController, claimControl, publishViewState } =
    useRegisterViewSyncParticipant({
      id: slotId,
      engine: "leaflet",
    });
  const providerTargetRef = useRef(providerTarget);
  const isControllerRef = useRef(isController);

  useEffect(() => {
    providerTargetRef.current = providerTarget;
  }, [providerTarget]);

  useEffect(() => {
    isControllerRef.current = isController;
  }, [isController]);

  useEffect(() => {
    const container = map.getContainer();
    const cleanupInteraction = claimOnContainerInteraction(
      container,
      claimControl,
      isApplyingExternalRef
    );

    const updateStatus = () => {
      const view = readLeafletViewState(map);
      if (!view) {
        return;
      }
      setStatusText(
        `leaflet • ${view.lngDeg.toFixed(5)} • ${view.latDeg.toFixed(
          5
        )} • z ${view.zoom.toFixed(2)}`
      );
      setHashText(buildLeafletHash(view));

      if (!isControllerRef.current) {
        return;
      }

      const target = projectLeafletViewToViewSyncTarget({
        ...view,
        anchorAltitudeM: getCurrentAnchorAltitude(providerTargetRef.current),
        fovVertical: getCurrentVerticalFov(providerTargetRef.current),
        headingDeg: getCurrentHeadingDeg(providerTargetRef.current),
        viewport: getViewportFromElement(map.getContainer()),
      });

      if (target) {
        publishViewState(target, {
          claimControl: true,
        });
      }
    };

    map.on("move", updateStatus);
    map.on("zoom", updateStatus);
    map.whenReady(updateStatus);

    return () => {
      cleanupInteraction();
      map.off("move", updateStatus);
      map.off("zoom", updateStatus);
    };
  }, [claimControl, map, publishViewState, setHashText, setStatusText]);

  useEffect(() => {
    if (isController || !providerTarget || providerTarget.sourceId === slotId) {
      return;
    }

    if (!(map as L.Map & { _loaded?: boolean })._loaded) {
      return;
    }

    const projection = projectViewSyncTargetToLeaflet({
      target: providerTarget.target,
      viewport: getViewportFromElement(map.getContainer()),
    });

    if (!projection) {
      return;
    }

    isApplyingExternalRef.current = true;
    try {
      map.setView([projection.center.lat, projection.center.lng], projection.zoom, {
        animate: false,
      });
    } catch {
      isApplyingExternalRef.current = false;
      return;
    }
    window.requestAnimationFrame(() => {
      isApplyingExternalRef.current = false;
    });
  }, [isController, map, providerTarget, slotId]);

  return null;
};

const LeafletSlot = ({
  slotId,
  setStatusText,
  setHashText,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: LeafletRuntimeHandle | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

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
  setStatusText,
  setHashText,
  onRuntimeHandleChange,
  bootDelayMs = 0,
}: {
  slotId: string;
  mount: SlotMountConfig;
  setStatusText: (value: string) => void;
  setHashText: (value: string | null) => void;
  onRuntimeHandleChange: (mountId: string, handle: SlotRuntimeHandle | null) => void;
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

  if (mount.framework === "cesium") {
    return (
      <CesiumSlot
        slotId={slotId}
        setStatusText={setStatusText}
        setHashText={setHashText}
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
  fallbackTarget: ViewSyncTargetState;
}) => {
  const [slots, setSlots] = useState<SlotConfig[]>([
    { id: "slot-1", framework: "cesium" },
    { id: "slot-2", framework: "maplibre" },
    { id: "slot-3", framework: "leaflet" },
  ]);
  const nextSlotIndexRef = useRef(4);
  const viewSyncState = useViewSyncState();
  const viewSyncStore = useViewSyncStore();
  const controllerId = viewSyncState.controllerId;
  const registrationCount = Object.keys(viewSyncState.registrations).length;
  const [transitioningSlotIds, setTransitioningSlotIds] = useState<string[]>([]);
  const isAnyFrameworkTransitioning = transitioningSlotIds.length > 0;

  useEffect(() => {
    if (controllerId || slots.length === 0 || registrationCount === 0) {
      return;
    }

    viewSyncStore.setController(slots[0]?.id ?? null);
  }, [controllerId, registrationCount, slots, viewSyncStore]);

  const addSlot = useCallback(() => {
    const nextIndex = nextSlotIndexRef.current++;
    setSlots((previousSlots) => [
      ...previousSlots,
      {
        id: `slot-${nextIndex}`,
        framework: FRAMEWORK_OPTIONS[(nextIndex - 1) % FRAMEWORK_OPTIONS.length],
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
  initialBootDelayMs = 0,
  isController,
  disableFrameworkSelection,
  canDelete,
  onFrameworkChange,
  onDelete,
  onTransitioningChange,
}: {
  slot: SlotConfig;
  initialBootDelayMs?: number;
  isController: boolean;
  disableFrameworkSelection: boolean;
  canDelete: boolean;
  onFrameworkChange: (framework: SlotFramework) => void;
  onDelete: () => void;
  onTransitioningChange: (isTransitioning: boolean) => void;
}) => {
  const viewSyncState = useViewSyncState();
  const viewSyncStore = useViewSyncStore();
  const providerTarget = viewSyncState.target?.target ?? null;
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
  const runtimeHandlesRef = useRef<Record<string, SlotRuntimeHandle | null>>({});
  const transitionRunRef = useRef<string | null>(null);
  const nextMountIndexRef = useRef(2);
  const lastCesiumHeadingPitchRef = useRef<HeadingPitchJson | null>(null);
  const [initialBootDelayConsumed, setInitialBootDelayConsumed] = useState(
    initialBootDelayMs <= 0
  );
  const activeRuntimeFramework = mounts.find((mount) => mount.registerWithViewSync)
    ?.framework ?? slot.framework;
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
      const activeMount = previousMounts.find((mount) => mount.registerWithViewSync);
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
        const restoreControllerAfterTransition =
          viewSyncState.controllerId === slot.id;

        // Pause shared sync while this slot is visually handing off between engines.
        // The slot can reclaim controller ownership after the transition completes.
        if (restoreControllerAfterTransition) {
          viewSyncStore.setController(null);
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
      viewSyncState.controllerId,
      viewSyncStore,
    ]
  );

  useEffect(() => {
    if (!transitionRequest || transitionRunRef.current === transitionRequest.targetMountId) {
      return;
    }

    const sourceHandle = runtimeHandlesRef.current[transitionRequest.sourceMountId];
    const targetHandle = runtimeHandlesRef.current[transitionRequest.targetMountId];
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
            viewSyncStore.setController(slot.id);
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
          const targetHeadingPitch =
            toHeadingPitchJsonFromViewSyncTarget(providerTarget) ??
            lastCesiumHeadingPitchRef.current;

          await transitionToCesium(
            targetHandle.widget.scene,
            sourceHandle.map,
            targetHandle.container,
            targetHandle.terrainProviders,
            targetHeadingPitch,
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
          const lastHeadingPitch = await transitionToLeaflet(
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
          lastCesiumHeadingPitchRef.current = lastHeadingPitch ?? null;
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
  }, [
    onFrameworkChange,
    providerTarget,
    slot.id,
    transitionRequest,
    viewSyncStore,
  ]);

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

const ViewSyncStoryArgsSync = ({
  target,
}: {
  target: ViewSyncTargetState;
}) => {
  const viewSyncStore = useViewSyncStore();
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      viewSyncStore.setTargetState(target, {
        sourceId: "storybook-controls",
        sourceEngine: "system",
      });
      return;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      viewSyncStore.setTargetState(target, {
        sourceId: "storybook-controls",
        sourceEngine: "system",
      });
      animationFrameRef.current = null;
    });

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [target, viewSyncStore]);

  return null;
};

export const ViewSyncStory = (props: ViewSyncStoryProps) => {
  const initialTarget = useMemo(
    () => createStoryTargetState(props),
    [
      props.altitudeM,
      props.fovVerticalDeg,
      props.farPlaneM,
      props.headingDeg,
      props.latitudeDeg,
      props.longitudeDeg,
      props.nearPlaneM,
      props.pitchDeg,
      props.rangeM,
    ]
  );
  const initialStateRef = useRef<Partial<ViewSyncState> | null>(null);

  if (initialStateRef.current === null) {
    initialStateRef.current = createInitialViewSyncState(initialTarget);
  }

  return (
    <ViewSyncProvider initialState={initialStateRef.current}>
      <ViewSyncStoryArgsSync target={initialTarget} />
      <div style={shellStyle}>
        <SlotsLayout fallbackTarget={initialTarget} />
      </div>
    </ViewSyncProvider>
  );
};
