import { useEffect, useRef } from "react";
import {
  mountNavigationControlsOverlay,
  NAVIGATION_ZOOM_MODES,
  type NavigationControlsOverlayMessages,
  type NavigationOrbitOptions,
  type NavigationTransitionOptions,
  type NavigationZoomOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import {
  createCesiumSceneOrbitController,
  type CesiumSceneOrbitController,
} from "@carma-mapping/engines/cesium/api";
import {
  CARMA_STORY_MAPPING_ENGINES,
  type StoryMappingEngine,
} from "../mappingEngines";
import type { CesiumRuntimeHandle, SlotRuntimeHandle } from "../viewSyncStoryShared";
import { createRuntimeNavigationReference } from "./runtime-navigation-reference";

const DEFAULT_CONTROL_STYLE = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const CONTROL_HOST_Z_INDEX = 1200;

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
  homeOptions,
  orbitOptions,
  zoomOptions,
  fovZoomOptions,
  dollyZoomOptions,
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
  homeOptions?: NavigationTransitionOptions;
  orbitOptions?: NavigationOrbitOptions;
  zoomOptions?: NavigationZoomOptions;
  fovZoomOptions?: NavigationZoomOptions;
  dollyZoomOptions?: NavigationZoomOptions;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const orbitControllerRef = useRef<CesiumSceneOrbitController | null>(null);

  useEffect(() => {
    orbitControllerRef.current?.destroy();
    orbitControllerRef.current = null;

    if (
      !disabled &&
      runtimeHandle &&
      engine === CARMA_STORY_MAPPING_ENGINES.CESIUM
    ) {
      orbitControllerRef.current = createCesiumSceneOrbitController({
        scene: (runtimeHandle as CesiumRuntimeHandle).widget.scene,
        revolutionDurationSec: orbitOptions?.revolutionDurationSec,
        direction: orbitOptions?.direction as "cw" | "ccw" | undefined,
        minPitchDeg: orbitOptions?.minPitchDeg,
      });
    }

    return () => {
      orbitControllerRef.current?.destroy();
      orbitControllerRef.current = null;
    };
  }, [disabled, engine, runtimeHandle, orbitOptions]);

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

    const orbitController = orbitControllerRef.current;
    const baseNavigationReference =
      typeof showCompass === "boolean"
        ? { ...navigationReference, showCompass }
        : navigationReference;
    const effectiveMethods =
      orbitController !== null
        ? {
            ...baseNavigationReference,
            orbit: (options: NavigationOrbitOptions = {}) => {
              if (orbitController.isOrbiting) {
                orbitController.stopOrbit();
                options.onCanceled?.();
              } else {
                options.onStarted?.();
                orbitController.startOrbit();
              }
            },
            subscribeOrbitActive: (sink: (active: boolean) => void) =>
              orbitController.subscribeIsOrbiting(sink),
          }
        : baseNavigationReference;

    return mountNavigationControlsOverlay(host, {
      controlId,
      methods: effectiveMethods,
      disabled: disabled || !runtimeHandle,
      showOrbitControl,
      homeOptions,
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
                ...(fovZoomOptions ?? zoomOptions),
                mode: NAVIGATION_ZOOM_MODES.FOV,
              },
              zoomOutOptions: {
                ...(fovZoomOptions ?? zoomOptions),
                mode: NAVIGATION_ZOOM_MODES.FOV,
              },
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
                ...(dollyZoomOptions ?? zoomOptions),
                mode: NAVIGATION_ZOOM_MODES.DOLLY,
              },
              zoomOutOptions: {
                ...(dollyZoomOptions ?? zoomOptions),
                mode: NAVIGATION_ZOOM_MODES.DOLLY,
              },
              zoomInTooltip: "Dolly-Zoom in (Fahrt + FOV synchron)",
              zoomOutTooltip: "Dolly-Zoom out (Fahrt + FOV synchron)",
            }
          : null,
    });
  }, [ // eslint-disable-line react-hooks/exhaustive-deps -- orbitControllerRef is a ref, not a dep
    controlId,
    disabled,
    engine,
    homeTarget,
    runtimeHandle,
    showDollyZoomControl,
    showFovZoomControl,
    showOrbitControl,
    showCompass,
    homeOptions,
    orbitOptions,
    zoomOptions,
    fovZoomOptions,
    dollyZoomOptions,
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
