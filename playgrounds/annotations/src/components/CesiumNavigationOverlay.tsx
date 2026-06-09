import { useEffect, useRef } from "react";

import {
  createCesiumNavigationMethods,
  isManagedNavigationKeyboardEvent,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS,
  NAVIGATION_ORBIT_DIRECTIONS,
  NAVIGATION_ZOOM_MODES,
  NAVIGATION_ZOOM_DIRECTIONS,
  mountNavigationControlsOverlay,
  resolveNavigationKeyboardShortcutAction,
  type NavigationKeyboardShortcutAction,
  type NavigationControlsOverlayMessages,
  type NavigationOrbitOptions,
  type NavigationMethods,
} from "@carma-mapping/engines-interop/navigation-controls";
import { PerspectiveFrustum, type Scene } from "@carma-cesium";
import {
  createCesiumSceneOrbitController,
  type CesiumSceneOrbitController,
  writePerspectiveFrustumVerticalFov,
} from "@carma-mapping/engines/cesium/core";
import type { Milliseconds, Seconds } from "@carma-units";

import type { AnnotationsDemoCameraState } from "../playground.types";
import { PLAYGROUND_UI_Z_INDEX } from "../playgroundConfig";
import { clearPlaygroundPointerQueryPreview } from "./playgroundFloatingOverlay.shared";
const DEFAULT_CONTROL_STYLE = {
  top: 10,
  left: 10,
  zIndex: 16,
};

const DEFAULT_ORBIT_REVOLUTION_DURATION_SEC = 30 as Seconds;
const DEFAULT_ORBIT_MIN_PITCH_DEG = 30;
const DEFAULT_KEYBOARD_ZOOM_DURATION_MS = 250 as Milliseconds;
const DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND = 1;
const DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS = 180 as Milliseconds;
const PLAYGROUND_UNSUPPORTED_NAVIGATION_SHORTCUT_ACTIONS = [
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_CLOCKWISE,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE,
] as const;

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
  disabledNavigationShortcutActions?: readonly NavigationKeyboardShortcutAction[];
  scene: Scene;
  methods: NavigationMethods;
  initialHomeCameraState: AnnotationsDemoCameraState | null;
}) => {
  const effectiveDisabledNavigationShortcutActions = [
    ...PLAYGROUND_UNSUPPORTED_NAVIGATION_SHORTCUT_ACTIONS,
    ...disabledNavigationShortcutActions,
  ];

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isManagedNavigationKeyboardEvent(event)) return;

    switch (
      resolveNavigationKeyboardShortcutAction(event, {
        disabledActions: effectiveDisabledNavigationShortcutActions,
      })
    ) {
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_IN:
        event.preventDefault();
        methods.zoomIn({
          duration: DEFAULT_KEYBOARD_ZOOM_DURATION_MS,
          mode: NAVIGATION_ZOOM_MODES.AUTO,
        });
        return;
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_OUT:
        event.preventDefault();
        methods.zoomOut({
          duration: DEFAULT_KEYBOARD_ZOOM_DURATION_MS,
          mode: NAVIGATION_ZOOM_MODES.AUTO,
        });
        return;
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.GO_HOME:
        event.preventDefault();
        methods.goHome();
        return;
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.TOGGLE_ORBIT:
        event.preventDefault();
        methods.orbit();
        return;
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN:
        event.preventDefault();
        methods.startContinuousZoom?.({
          direction: NAVIGATION_ZOOM_DIRECTIONS.IN,
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          zoomDeltaPerSecond: DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND,
          easeInDurationMs: DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS,
        });
        return;
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT:
        event.preventDefault();
        methods.startContinuousZoom?.({
          direction: NAVIGATION_ZOOM_DIRECTIONS.OUT,
          mode: NAVIGATION_ZOOM_MODES.DOLLY,
          zoomDeltaPerSecond: DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND,
          easeInDurationMs: DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS,
        });
        return;
      case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.RESET_FOV:
        event.preventDefault();
        resetSceneFovToDefault(scene, initialHomeCameraState);
        return;
      default:
        return;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    const action = resolveNavigationKeyboardShortcutAction(event, {
      disabledActions: effectiveDisabledNavigationShortcutActions,
    });
    if (
      action ===
        NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN ||
      action === NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT
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

const resolveCesiumNavigationMethods = ({
  scene,
  orbitController,
  initialHomeCameraState,
}: {
  scene: Scene;
  orbitController: CesiumSceneOrbitController | null;
  initialHomeCameraState: AnnotationsDemoCameraState | null;
}) => {
  const baseMethods = createCesiumNavigationMethods(scene, {
    homeCameraState: initialHomeCameraState,
  });

  if (orbitController === null) {
    return baseMethods;
  }

  return {
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
  };
};

export const CesiumNavigationOverlay = ({
  disabledNavigationShortcutActions = [],
  scene,
  initialHomeCameraState = null,
}: {
  disabledNavigationShortcutActions?: readonly NavigationKeyboardShortcutAction[];
  scene: Scene | null;
  initialHomeCameraState?: AnnotationsDemoCameraState | null;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const orbitControllerRef = useRef<CesiumSceneOrbitController | null>(null);

  useEffect(() => {
    orbitControllerRef.current?.destroy();
    orbitControllerRef.current = null;

    if (scene) {
      orbitControllerRef.current = createCesiumSceneOrbitController(scene, {
        revolutionDurationSec: DEFAULT_ORBIT_REVOLUTION_DURATION_SEC,
        direction: NAVIGATION_ORBIT_DIRECTIONS.CW,
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

    const clearPointerQueryPreview = () =>
      clearPlaygroundPointerQueryPreview(scene);

    host.addEventListener("pointerenter", clearPointerQueryPreview, true);
    host.addEventListener("pointermove", clearPointerQueryPreview, true);
    host.addEventListener("pointerdown", clearPointerQueryPreview, true);

    const methods = resolveCesiumNavigationMethods({
      scene,
      orbitController: orbitControllerRef.current,
      initialHomeCameraState,
    });

    const removeOverlay = mountNavigationControlsOverlay(host, {
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
    return () => {
      host.removeEventListener("pointerenter", clearPointerQueryPreview, true);
      host.removeEventListener("pointermove", clearPointerQueryPreview, true);
      host.removeEventListener("pointerdown", clearPointerQueryPreview, true);
      removeOverlay?.();
    };
  }, [initialHomeCameraState, scene]);

  useEffect(() => {
    if (!scene) {
      return;
    }

    const methods = resolveCesiumNavigationMethods({
      scene,
      orbitController: orbitControllerRef.current,
      initialHomeCameraState,
    });

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
        zIndex: PLAYGROUND_UI_Z_INDEX,
        pointerEvents: "none",
      }}
    />
  );
};
