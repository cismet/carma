import { useEffect, useRef, useState } from "react";
import {
  mountNavigationControlsOverlay,
  NAVIGATION_ZOOM_MODES,
  type NavigationControlsOverlayMessages,
  type NavigationOrbitOptions,
  type NavigationZoomOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import {
  CARMA_STORY_MAPPING_ENGINES,
  type StoryMappingEngine,
} from "../mappingEngines";
import type { SlotRuntimeHandle } from "../viewSyncStoryShared";
import { createRuntimeNavigationReference } from "./runtime-navigation-reference";
import { readCurrentCesiumFovDeg } from "./cesium-dolly-presets";
import {
  bindStoryCesiumCameraChangedListener,
  bindStoryCesiumFrameListener,
  readStoryCesiumScene,
} from "../../../shared/cesiumRuntimeGuards";

const DEFAULT_CONTROL_STYLE = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const CONTROL_HOST_Z_INDEX = 1200;
const MIN_CESIUM_ZOOM_FOV_DEG = 5;
const MAX_CESIUM_ZOOM_FOV_DEG = 120;
const CESIUM_ZOOM_FOV_LIMIT_EPSILON_DEG = 0.5;

const readStoryMessages = (
  engine: StoryMappingEngine
): Partial<NavigationControlsOverlayMessages> => ({
  homeTooltip: "Zur Startansicht wechseln",
  homeTitle: "Startansicht",
  orbitTooltip:
    "Orbit um den aktuellen Fokuspunkt starten oder stoppen (laufende Drehung)",
  orbitTitle: "Orbit",
  zoomInTooltip: "Maßstab vergrößern (Zoom in)",
  zoomInTitle: "Vergrößern",
  zoomOutTooltip: "Maßstab verkleinern (Zoom out)",
  zoomOutTitle: "Verkleinern",
  compassTooltip:
    "Einfachklick: Norden ausrichten. Doppelklick: Norden + Nadir.",
  compassDisabledTooltip:
    engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
      ? "2D / nordorientiert"
      : "Kompass nicht verfügbar",
  compassTitle: "Kompass",
});

export const ViewSyncRuntimeNavigationControls = ({
  controlId,
  engine,
  runtimeHandle,
  homeTarget,
  disabled = false,
  showOrbitControl = false,
  showFovZoomControl = false,
  showDollyZoomControl = false,
  showCompass,
  orbitOptions,
  zoomOptions,
}: {
  controlId: string;
  engine: StoryMappingEngine;
  runtimeHandle: SlotRuntimeHandle | null;
  homeTarget: ViewState;
  disabled?: boolean;
  showOrbitControl?: boolean;
  showFovZoomControl?: boolean;
  showDollyZoomControl?: boolean;
  showCompass?: boolean;
  orbitOptions?: NavigationOrbitOptions;
  zoomOptions?: NavigationZoomOptions;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [currentCesiumFovDeg, setCurrentCesiumFovDeg] = useState<number | null>(
    null
  );

  useEffect(() => {
    if (
      (!showFovZoomControl && !showDollyZoomControl) ||
      engine !== CARMA_STORY_MAPPING_ENGINES.CESIUM ||
      !runtimeHandle
    ) {
      setCurrentCesiumFovDeg(null);
      return;
    }

    const scene = readStoryCesiumScene(runtimeHandle.widget);
    if (!scene) {
      setCurrentCesiumFovDeg(null);
      return;
    }

    const sync = () => {
      const nextFovDeg = readCurrentCesiumFovDeg(runtimeHandle);
      setCurrentCesiumFovDeg((currentFovDeg) => {
        if (nextFovDeg === null) {
          return currentFovDeg === null ? currentFovDeg : null;
        }

        return currentFovDeg !== null &&
          Math.abs(currentFovDeg - nextFovDeg) < 0.01
          ? currentFovDeg
          : nextFovDeg;
      });
    };

    sync();
    const unbindCameraChanged =
      bindStoryCesiumCameraChangedListener(runtimeHandle.widget, sync) ??
      (() => {});
    const unbindFrame =
      bindStoryCesiumFrameListener(runtimeHandle.widget, sync) ?? (() => {});
    const intervalId = window.setInterval(sync, 100);

    return () => {
      unbindCameraChanged();
      unbindFrame();
      window.clearInterval(intervalId);
    };
  }, [engine, runtimeHandle, showDollyZoomControl, showFovZoomControl]);

  const cesiumFovZoomInDisabled =
    currentCesiumFovDeg !== null &&
    currentCesiumFovDeg <=
      MIN_CESIUM_ZOOM_FOV_DEG + CESIUM_ZOOM_FOV_LIMIT_EPSILON_DEG;
  const cesiumFovZoomOutDisabled =
    currentCesiumFovDeg !== null &&
    currentCesiumFovDeg >=
      MAX_CESIUM_ZOOM_FOV_DEG - CESIUM_ZOOM_FOV_LIMIT_EPSILON_DEG;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const navigationReference = createRuntimeNavigationReference({
      engine,
      runtimeHandle,
      homeTarget,
      disabled,
    });
    const effectiveMethods =
      typeof showCompass === "boolean"
        ? {
            ...navigationReference,
            showCompass,
          }
        : navigationReference;

    return mountNavigationControlsOverlay(host, {
      controlId,
      methods: effectiveMethods,
      disabled: disabled || !runtimeHandle,
      showOrbitControl,
      orbitOptions,
      zoomInOptions: zoomOptions,
      zoomOutOptions: zoomOptions,
      style: DEFAULT_CONTROL_STYLE,
      messages: readStoryMessages(engine),
      secondaryZoomGroup:
        showFovZoomControl &&
        engine === CARMA_STORY_MAPPING_ENGINES.CESIUM &&
        runtimeHandle
          ? {
              zoomInOptions: {
                ...zoomOptions,
                mode: NAVIGATION_ZOOM_MODES.FOV,
              },
              zoomOutOptions: {
                ...zoomOptions,
                mode: NAVIGATION_ZOOM_MODES.FOV,
              },
              zoomInDisabled: cesiumFovZoomInDisabled,
              zoomOutDisabled: cesiumFovZoomOutDisabled,
              zoomInTooltip: "Sichtfeld verkleinern (Kamera-Zoom in)",
              zoomOutTooltip: "Sichtfeld vergrößern (Kamera-Zoom out)",
            }
          : null,
      tertiaryZoomGroup:
        showDollyZoomControl &&
        engine === CARMA_STORY_MAPPING_ENGINES.CESIUM &&
        runtimeHandle
          ? {
              zoomInOptions: {
                ...zoomOptions,
                durationMs: 2000,
                mode: NAVIGATION_ZOOM_MODES.DOLLY,
              },
              zoomOutOptions: {
                ...zoomOptions,
                durationMs: 2000,
                mode: NAVIGATION_ZOOM_MODES.DOLLY,
              },
              zoomInDisabled: cesiumFovZoomInDisabled,
              zoomOutDisabled: cesiumFovZoomOutDisabled,
              zoomInTooltip: "Dolly-Zoom in (Fahrt + FOV synchron)",
              zoomOutTooltip: "Dolly-Zoom out (Fahrt + FOV synchron)",
            }
          : null,
    });
  }, [
    controlId,
    disabled,
    engine,
    homeTarget,
    runtimeHandle,
    showDollyZoomControl,
    showFovZoomControl,
    showOrbitControl,
    showCompass,
    orbitOptions,
    zoomOptions,
    cesiumFovZoomInDisabled,
    cesiumFovZoomOutDisabled,
  ]);

  return (
    <div
      ref={hostRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: CONTROL_HOST_Z_INDEX,
        pointerEvents: "none",
      }}
    />
  );
};
