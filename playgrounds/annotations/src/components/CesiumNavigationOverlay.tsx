import { useEffect, useRef } from "react";

import { type Scene } from "@carma/cesium";
import {
  createCesiumNavigationMethods,
  NAVIGATION_ZOOM_MODES,
  mountNavigationControlsOverlay,
  type NavigationControlsOverlayMessages,
  type NavigationOrbitOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  createCesiumSceneOrbitController,
  type CesiumSceneOrbitController,
} from "@carma-mapping/engines/cesium/api";

import type { AnnotationsDemoCameraState } from "../playground.types";

const DEFAULT_CONTROL_STYLE = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const CONTROL_HOST_Z_INDEX = 1200;

const DEFAULT_ORBIT_REVOLUTION_DURATION_SEC = 30;
const DEFAULT_ORBIT_MIN_PITCH_DEG = 30;

const readOverlayMessages = (): Partial<NavigationControlsOverlayMessages> => ({
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
  compassTitle: "Kompass",
});

export const CesiumNavigationOverlay = ({
  scene,
  initialHomeCameraState = null,
}: {
  scene: Scene | null;
  initialHomeCameraState?: AnnotationsDemoCameraState | null;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const orbitControllerRef = useRef<CesiumSceneOrbitController | null>(null);

  useEffect(() => {
    orbitControllerRef.current?.destroy();
    orbitControllerRef.current = null;

    if (scene) {
      orbitControllerRef.current = createCesiumSceneOrbitController({
        scene,
        revolutionDurationSec: DEFAULT_ORBIT_REVOLUTION_DURATION_SEC,
        direction: "cw",
        minPitchDeg: DEFAULT_ORBIT_MIN_PITCH_DEG,
      });
    }

    return () => {
      orbitControllerRef.current?.destroy();
      orbitControllerRef.current = null;
    };
  }, [scene]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !scene) {
      return;
    }

    const orbitController = orbitControllerRef.current;

    const baseMethods = createCesiumNavigationMethods({
      scene,
      homeCameraState: initialHomeCameraState,
    });

    const methods =
      orbitController !== null
        ? {
            ...baseMethods,
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
        : baseMethods;

    return mountNavigationControlsOverlay(host, {
      controlId: "annotations",
      methods,
      style: DEFAULT_CONTROL_STYLE,
      showOrbitControl: true,
      messages: readOverlayMessages(),
      secondaryZoomGroup: {
        zoomInOptions: {
          mode: NAVIGATION_ZOOM_MODES.FOV,
          durationMs: 250,
        },
        zoomOutOptions: {
          mode: NAVIGATION_ZOOM_MODES.FOV,
          durationMs: 250,
        },
        zoomInTooltip: "Sichtfeld verkleinern (Kamera-Zoom in)",
        zoomOutTooltip: "Sichtfeld vergrößern (Kamera-Zoom out)",
      },
      tertiaryZoomGroup: {
        zoomInOptions: {
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          durationMs: 500,
        },
        zoomOutOptions: {
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          durationMs: 500,
        },
        zoomInTooltip: "Dolly-Zoom in (Fahrt + FOV synchron)",
        zoomOutTooltip: "Dolly-Zoom out (Fahrt + FOV synchron)",
      },
    });
  }, [initialHomeCameraState, scene]);

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
