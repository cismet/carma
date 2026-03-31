import { useEffect, useRef } from "react";

import { PerspectiveFrustum, type Scene } from "@carma/cesium";
import {
  ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS,
  isManagedAnnotationKeyboardEvent,
  resolveAnnotationNavigationShortcutAction,
  type AnnotationNavigationShortcutAction,
} from "@carma-mapping/annotations/core";
import {
  createCesiumNavigationMethods,
  NAVIGATION_ZOOM_MODES,
  mountNavigationControlsOverlay,
  type NavigationControlsOverlayMessages,
  type NavigationOrbitOptions,
  type NavigationMethods,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  createCesiumSceneOrbitController,
  type CesiumSceneOrbitController,
  writePerspectiveFrustumVerticalFov,
} from "@carma-mapping/engines/cesium/api";
import type { Milliseconds, Seconds } from "@carma/units/types";

import type { AnnotationsDemoCameraState } from "../playground.types";

const DEFAULT_CONTROL_STYLE = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const CONTROL_HOST_Z_INDEX = 1200;

const DEFAULT_ORBIT_REVOLUTION_DURATION_SEC = 30 as Seconds;
const DEFAULT_ORBIT_MIN_PITCH_DEG = 30;
const DEFAULT_KEYBOARD_ZOOM_DURATION_MS = 250 as Milliseconds;
const DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND = 1;
const DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS = 180 as Milliseconds;

const resetSceneFovToDefault = (
  scene: Scene,
  initialHomeCameraState: AnnotationsDemoCameraState | null
) => {
  if (
    typeof initialHomeCameraState?.fov !== "number" ||
    !Number.isFinite(initialHomeCameraState.fov)
  ) {
    return;
  }

  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return;
  }

  writePerspectiveFrustumVerticalFov(
    scene.camera.frustum,
    initialHomeCameraState.fov
  );
  scene.requestRender();
};

const bindNavigationKeyboardShortcuts = ({
  disabledNavigationShortcutActions = [],
  scene,
  methods,
  initialHomeCameraState,
}: {
  disabledNavigationShortcutActions?: readonly AnnotationNavigationShortcutAction[];
  scene: Scene;
  methods: NavigationMethods;
  initialHomeCameraState: AnnotationsDemoCameraState | null;
}) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isManagedAnnotationKeyboardEvent(event)) return;

    switch (
      resolveAnnotationNavigationShortcutAction(event, {
        disabledActions: disabledNavigationShortcutActions,
      })
    ) {
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.ZOOM_IN:
        event.preventDefault();
        methods.zoomIn({
          duration: DEFAULT_KEYBOARD_ZOOM_DURATION_MS,
          mode: NAVIGATION_ZOOM_MODES.AUTO,
        });
        return;
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.ZOOM_OUT:
        event.preventDefault();
        methods.zoomOut({
          duration: DEFAULT_KEYBOARD_ZOOM_DURATION_MS,
          mode: NAVIGATION_ZOOM_MODES.AUTO,
        });
        return;
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.GO_HOME:
        event.preventDefault();
        methods.goHome();
        return;
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.TOGGLE_ORBIT:
        event.preventDefault();
        methods.orbit();
        return;
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN:
        event.preventDefault();
        methods.startContinuousZoom?.({
          direction: "in",
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          zoomDeltaPerSecond: DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND,
          easeInDurationMs: DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS,
        });
        return;
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT:
        event.preventDefault();
        methods.startContinuousZoom?.({
          direction: "out",
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          zoomDeltaPerSecond: DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND,
          easeInDurationMs: DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS,
        });
        return;
      case ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.RESET_FOV:
        event.preventDefault();
        resetSceneFovToDefault(scene, initialHomeCameraState);
        return;
      default:
        return;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    const action = resolveAnnotationNavigationShortcutAction(event, {
      disabledActions: disabledNavigationShortcutActions,
    });
    if (
      action ===
        ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN ||
      action ===
        ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT
    ) {
      methods.stopContinuousZoom?.();
    }
  };

  const handleWindowBlur = () => {
    methods.stopContinuousZoom?.();
  };

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("blur", handleWindowBlur, true);

  return () => {
    methods.stopContinuousZoom?.();
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("keyup", handleKeyUp, true);
    window.removeEventListener("blur", handleWindowBlur, true);
  };
};

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
  disabledNavigationShortcutActions = [],
  scene,
  initialHomeCameraState = null,
}: {
  disabledNavigationShortcutActions?: readonly AnnotationNavigationShortcutAction[];
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
        hidden: true,
        zoomInOptions: {
          mode: NAVIGATION_ZOOM_MODES.FOV,
          duration: 250 as Milliseconds,
        },
        zoomOutOptions: {
          mode: NAVIGATION_ZOOM_MODES.FOV,
          duration: 250 as Milliseconds,
        },
        zoomInTooltip: "Sichtfeld verkleinern (Kamera-Zoom in)",
        zoomOutTooltip: "Sichtfeld vergrößern (Kamera-Zoom out)",
      },
      tertiaryZoomGroup: {
        hidden: true,
        zoomInOptions: {
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          duration: 500 as Milliseconds,
        },
        zoomOutOptions: {
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          duration: 500 as Milliseconds,
        },
        zoomInTooltip: "Dolly-Zoom in (Fahrt + FOV synchron)",
        zoomOutTooltip: "Dolly-Zoom out (Fahrt + FOV synchron)",
      },
    });
  }, [initialHomeCameraState, scene]);

  useEffect(() => {
    if (!scene) {
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

    return bindNavigationKeyboardShortcuts({
      disabledNavigationShortcutActions,
      scene,
      methods,
      initialHomeCameraState,
    });
  }, [disabledNavigationShortcutActions, initialHomeCameraState, scene]);

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
