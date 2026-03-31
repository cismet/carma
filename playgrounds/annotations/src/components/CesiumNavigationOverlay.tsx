import { useEffect, useRef } from "react";

import { type Scene } from "@carma/cesium";
import {
  createCesiumNavigationMethods,
  NAVIGATION_ZOOM_MODES,
  mountNavigationControlsOverlay,
  type NavigationControlsOverlayMessages,
} from "@carma-mapping/engines-interop/navigation-controls";

import type { AnnotationsDemoCameraState } from "../playground.types";

const DEFAULT_CONTROL_STYLE = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const CONTROL_HOST_Z_INDEX = 1200;

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

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !scene) {
      return;
    }

    const methods = createCesiumNavigationMethods({
      scene,
      homeCameraState: initialHomeCameraState,
    });

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
