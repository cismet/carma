import { useCallback, useEffect, useRef } from "react";

import {
  Cartesian3,
  CesiumMath,
  PerspectiveFrustum,
  type Scene,
} from "@carma-cesium";
import {
  createCesiumNavigationMethods,
  isManagedNavigationKeyboardEvent,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS,
  NAVIGATION_ZOOM_DIRECTIONS,
  NAVIGATION_ZOOM_MODES,
  resolveNavigationKeyboardShortcutAction,
  type NavigationKeyboardShortcutAction,
  type NavigationZoomMode,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  animateOrbitHeadingPitchRange,
  pickSceneCenter,
  writePerspectiveFrustumVerticalFov,
} from "@carma-mapping/engines/cesium/core";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
import type { Milliseconds, Radians } from "@carma-units";

import { DEFAULT_CAMERA_FOV_DEG } from "../config/app.config";

const DEFAULT_KEYBOARD_ZOOM_DURATION_MS = 250 as Milliseconds;
const DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND = 1;
const DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS = 180 as Milliseconds;
const DEFAULT_ROTATE_DURATION_MS = 250;
const DEFAULT_ROTATE_STEP_RAD = CesiumMath.PI_OVER_TWO;
const EMPTY_NAVIGATION_ACTIONS: readonly NavigationKeyboardShortcutAction[] =
  [];

type CesiumNavigationMethodsRef = {
  scene: Scene;
  methods: ReturnType<typeof createCesiumNavigationMethods>;
};

type UseGeoportalCesiumNavigationShortcutsOptions = {
  allowedActions?: readonly NavigationKeyboardShortcutAction[];
  disabledActions?: readonly NavigationKeyboardShortcutAction[];
  enabled: boolean;
  isObliqueMode: boolean;
  minFov?: number;
  maxFov?: number;
  resetFov?: number;
  onGoHome?: () => void;
  onRotateCamera?: (clockwise: boolean) => void;
};

const resetSceneFov = (scene: Scene, resetFov: number) => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return;
  }

  writePerspectiveFrustumVerticalFov(scene.camera.frustum, resetFov);
  scene.requestRender();
};

const rotateSceneCamera = (scene: Scene, clockwise: boolean) => {
  const camera = scene.camera;
  const centerPoint = pickSceneCenter(scene);
  if (!centerPoint) {
    return;
  }

  const range = Cartesian3.distance(centerPoint, camera.position);
  const headingDelta = clockwise
    ? -DEFAULT_ROTATE_STEP_RAD
    : DEFAULT_ROTATE_STEP_RAD;
  const targetHeading = CesiumMath.zeroToTwoPi(camera.heading + headingDelta);

  animateOrbitHeadingPitchRange(
    scene,
    centerPoint,
    {
      heading: targetHeading as Radians,
      pitch: camera.pitch as Radians,
      range,
    },
    {
      durationMs: DEFAULT_ROTATE_DURATION_MS,
    }
  );
};

export const useGeoportalCesiumNavigationShortcuts = ({
  allowedActions,
  disabledActions = EMPTY_NAVIGATION_ACTIONS,
  enabled,
  isObliqueMode,
  minFov,
  maxFov,
  resetFov = CesiumMath.toRadians(DEFAULT_CAMERA_FOV_DEG),
  onGoHome,
  onRotateCamera,
}: UseGeoportalCesiumNavigationShortcutsOptions) => {
  const { getScene } = useCesiumContext();
  const methodsRef = useRef<CesiumNavigationMethodsRef | null>(null);

  const getNavigationMethods = useCallback(() => {
    const scene = getScene();
    if (!scene || scene.isDestroyed()) {
      return null;
    }

    if (methodsRef.current?.scene !== scene) {
      methodsRef.current?.methods.destroy?.();
      methodsRef.current = {
        scene,
        methods: createCesiumNavigationMethods(scene),
      };
    }

    return methodsRef.current;
  }, [getScene]);

  useEffect(() => {
    if (!enabled) {
      methodsRef.current?.methods.destroy?.();
      methodsRef.current = null;
      return;
    }

    const stopContinuousZoom = () => {
      methodsRef.current?.methods.stopContinuousZoom?.();
    };

    const buildZoomOptions = (mode: NavigationZoomMode) => ({
      duration: DEFAULT_KEYBOARD_ZOOM_DURATION_MS,
      maximumFovRad: maxFov,
      minimumFovRad: minFov,
      mode,
    });

    const resolveAction = (event: KeyboardEvent) => {
      const action = resolveNavigationKeyboardShortcutAction(event, {
        disabledActions,
      });
      if (!action) {
        return null;
      }

      if (allowedActions && !allowedActions.includes(action)) {
        return null;
      }

      return action;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isManagedNavigationKeyboardEvent(event)) {
        return;
      }

      const action = resolveAction(event);
      if (!action) {
        return;
      }

      if (
        action === NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_CLOCKWISE &&
        onRotateCamera
      ) {
        event.preventDefault();
        event.stopPropagation();
        onRotateCamera(true);
        return;
      }

      if (
        action ===
          NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE &&
        onRotateCamera
      ) {
        event.preventDefault();
        event.stopPropagation();
        onRotateCamera(false);
        return;
      }

      const navigation = getNavigationMethods();
      if (!navigation) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const { methods, scene } = navigation;
      const zoomMode = isObliqueMode
        ? NAVIGATION_ZOOM_MODES.FOV
        : NAVIGATION_ZOOM_MODES.AUTO;

      switch (action) {
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_IN:
          methods.zoomIn(buildZoomOptions(zoomMode));
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_OUT:
          methods.zoomOut(buildZoomOptions(zoomMode));
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.GO_HOME:
          onGoHome?.();
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_CLOCKWISE:
          onRotateCamera
            ? onRotateCamera(true)
            : rotateSceneCamera(scene, true);
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE:
          onRotateCamera
            ? onRotateCamera(false)
            : rotateSceneCamera(scene, false);
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.TOGGLE_ORBIT:
          methods.orbit();
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN:
          methods.startContinuousZoom?.({
            direction: NAVIGATION_ZOOM_DIRECTIONS.IN,
            easeInDurationMs: DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS,
            maximumFovRad: maxFov,
            minimumFovRad: minFov,
            mode: NAVIGATION_ZOOM_MODES.DOLLY,
            zoomDeltaPerSecond: DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND,
          });
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT:
          methods.startContinuousZoom?.({
            direction: NAVIGATION_ZOOM_DIRECTIONS.OUT,
            easeInDurationMs: DEFAULT_CONTINUOUS_DOLLY_EASE_IN_MS,
            maximumFovRad: maxFov,
            minimumFovRad: minFov,
            mode: NAVIGATION_ZOOM_MODES.DOLLY,
            zoomDeltaPerSecond: DEFAULT_CONTINUOUS_DOLLY_ZOOM_DELTA_PER_SECOND,
          });
          return;
        case NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.RESET_FOV:
          resetSceneFov(scene, resetFov);
          return;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const action = resolveAction(event);
      if (
        action ===
          NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN ||
        action ===
          NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT
      ) {
        stopContinuousZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", stopContinuousZoom, true);

    return () => {
      methodsRef.current?.methods.destroy?.();
      methodsRef.current = null;
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", stopContinuousZoom, true);
    };
  }, [
    allowedActions,
    disabledActions,
    enabled,
    getNavigationMethods,
    isObliqueMode,
    maxFov,
    minFov,
    onGoHome,
    onRotateCamera,
    resetFov,
  ]);
};
