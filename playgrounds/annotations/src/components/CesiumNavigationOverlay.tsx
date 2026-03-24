import { useCallback, useEffect, useRef, useState } from "react";

import { PI_OVER_TWO } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import { Cartesian3, type Scene } from "@carma/cesium";
import { SceneNavigationControls } from "@carma-mapping/components";

import type { AnnotationsDemoCameraState } from "../config";

const MIN_CESIUM_PITCH_RAD = -PI_OVER_TWO;
const MAX_CESIUM_PITCH_RAD = 0;
const COMPASS_DRAG_FACTOR_RAD_PER_PX = degToRadNumeric(0.3)!;
const COMPASS_DRAG_THRESHOLD_PX = 3;
const COMPASS_CLICK_DELAY_MS = 180;

const HOME_ANIMATION_DURATION_MS = 900;

const clampCesiumPitchRad = (pitchRad: number) =>
  Math.max(MIN_CESIUM_PITCH_RAD, Math.min(MAX_CESIUM_PITCH_RAD, pitchRad));

const toCompassPitchDeg = (pitchRad: number) =>
  radToDegNumeric(clampCesiumPitchRad(pitchRad) + PI_OVER_TWO)!;

const readCameraAngles = (scene: Scene) => ({
  heading: scene.camera.heading,
  pitch: scene.camera.pitch,
});

const applyCameraOrientation = (
  scene: Scene,
  angles: { heading: number; pitch: number }
) => {
  scene.camera.setView({
    destination: scene.camera.position,
    orientation: {
      heading: angles.heading,
      pitch: angles.pitch,
      roll: scene.camera.roll,
    },
  });
  scene.requestRender();
};

const flyToCameraState = (
  scene: Scene,
  cameraState: AnnotationsDemoCameraState,
  options: {
    durationMs: number;
    onDone?: () => void;
  }
) => {
  const { durationMs, onDone } = options;
  let settled = false;
  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    onDone?.();
  };

  scene.camera.flyTo({
    destination: Cartesian3.fromRadians(
      cameraState.longitude,
      cameraState.latitude,
      cameraState.altitude
    ),
    orientation: {
      heading: cameraState.heading,
      pitch: cameraState.pitch,
      roll: cameraState.roll,
    },
    duration: Math.max(0, durationMs) / 1000,
    complete: settle,
    cancel: settle,
  });
  scene.requestRender();

  return () => {
    if (typeof scene.camera.cancelFlight === "function") {
      scene.camera.cancelFlight();
    }
    settle();
  };
};

export const CesiumNavigationOverlay = ({
  scene,
  initialHomeCameraState = null,
}: {
  scene: Scene | null;
  initialHomeCameraState?: AnnotationsDemoCameraState | null;
}) => {
  const homeCameraStateRef = useRef<AnnotationsDemoCameraState | null>(
    initialHomeCameraState
  );
  const [cameraAngles, setCameraAngles] = useState(() =>
    scene
      ? readCameraAngles(scene)
      : { heading: 0, pitch: degToRadNumeric(-45)! }
  );
  const initialDragStateRef = useRef<{
    mouseX: number;
    mouseY: number;
    headingRad: number;
    pitchRad: number;
  } | null>(null);
  const didCompassDragRef = useRef(false);
  const pendingCompassClickTimeoutRef = useRef<number | null>(null);
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (initialHomeCameraState) {
      homeCameraStateRef.current = initialHomeCameraState;
    }
  }, [initialHomeCameraState]);

  useEffect(() => {
    if (!scene) {
      return;
    }

    const syncAngles = () => {
      setCameraAngles(readCameraAngles(scene));
    };

    syncAngles();
    const removeMoveEndListener =
      scene.camera.moveEnd.addEventListener(syncAngles);

    return () => {
      removeMoveEndListener?.();
    };
  }, [scene]);

  const applyCameraAnglesUpdate = useCallback(
    (
      update: (current: { heading: number; pitch: number }) => {
        heading: number;
        pitch: number;
      }
    ) => {
      if (!scene) {
        return;
      }

      cancelAnimationRef.current?.();
      const nextAngles = update(cameraAngles);
      cancelAnimationRef.current = null;
      applyCameraOrientation(scene, {
        heading: nextAngles.heading,
        pitch: clampCesiumPitchRad(nextAngles.pitch),
      });
      setCameraAngles({
        heading: nextAngles.heading,
        pitch: clampCesiumPitchRad(nextAngles.pitch),
      });
    },
    [cameraAngles, scene]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = initialDragStateRef.current;
      if (!dragState) {
        return;
      }

      if (
        Math.abs(event.clientX - dragState.mouseX) >
          COMPASS_DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - dragState.mouseY) > COMPASS_DRAG_THRESHOLD_PX
      ) {
        didCompassDragRef.current = true;
      }

      const nextHeadingRad =
        dragState.headingRad +
        (event.clientX - dragState.mouseX) * COMPASS_DRAG_FACTOR_RAD_PER_PX;
      const nextPitchRad = clampCesiumPitchRad(
        dragState.pitchRad -
          (event.clientY - dragState.mouseY) * COMPASS_DRAG_FACTOR_RAD_PER_PX
      );

      applyCameraAnglesUpdate(() => ({
        heading: nextHeadingRad,
        pitch: nextPitchRad,
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
  }, [applyCameraAnglesUpdate]);

  useEffect(
    () => () => {
      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
      }
      cancelAnimationRef.current?.();
      cancelAnimationRef.current = null;
    },
    []
  );

  const handleCompassMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!scene) {
        return;
      }

      didCompassDragRef.current = false;
      initialDragStateRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        headingRad: scene.camera.heading,
        pitchRad: clampCesiumPitchRad(scene.camera.pitch),
      };
    },
    [scene]
  );

  const zoomCamera = useCallback(
    (multiplier: number) => {
      if (!scene) {
        return;
      }

      const height = scene.camera.positionCartographic?.height;
      const amount = Math.max(
        10,
        (Number.isFinite(height) ? height : 1000) * multiplier
      );
      if (multiplier < 1) {
        scene.camera.zoomIn(amount);
      } else {
        scene.camera.zoomOut(amount);
      }
      scene.requestRender();
      setCameraAngles(readCameraAngles(scene));
    },
    [scene]
  );

  const handleCompassClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!scene) {
        return;
      }

      if (didCompassDragRef.current) {
        didCompassDragRef.current = false;
        return;
      }

      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
      }

      pendingCompassClickTimeoutRef.current = window.setTimeout(() => {
        applyCameraAnglesUpdate((current) => ({
          heading: 0,
          pitch: current.pitch,
        }));
        pendingCompassClickTimeoutRef.current = null;
      }, COMPASS_CLICK_DELAY_MS);
    },
    [applyCameraAnglesUpdate, scene]
  );

  const handleCompassDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!scene) {
        return;
      }

      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
        pendingCompassClickTimeoutRef.current = null;
      }

      didCompassDragRef.current = false;

      applyCameraAnglesUpdate(() => ({
        heading: 0,
        pitch: -PI_OVER_TWO,
      }));
    },
    [applyCameraAnglesUpdate, scene]
  );

  const handleHomeClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const homeCameraState = homeCameraStateRef.current;
      if (!scene || !homeCameraState) {
        return;
      }

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = flyToCameraState(scene, homeCameraState, {
        durationMs: HOME_ANIMATION_DURATION_MS,
        onDone: () => {
          cancelAnimationRef.current = null;
          setCameraAngles(readCameraAngles(scene));
        },
      });
    },
    [scene]
  );

  const disabled = !scene;
  const homeDisabled = !scene || !homeCameraStateRef.current;
  const headingDeg = radToDegNumeric(cameraAngles.heading ?? 0)!;
  const pitchDeg = toCompassPitchDeg(cameraAngles.pitch ?? -PI_OVER_TWO);

  return (
    <SceneNavigationControls
      disabled={disabled}
      home={{
        disabled: homeDisabled,
        tooltip: "Zur Startansicht wechseln",
        title: "Startansicht",
        dataTestId: "annotations-home-control",
        onClick: handleHomeClick,
      }}
      zoomIn={{
        tooltip: "Maßstab vergrößern (Zoom in)",
        title: "Vergrößern",
        dataTestId: "annotations-zoom-in-control",
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          zoomCamera(0.5);
        },
      }}
      zoomOut={{
        tooltip: "Maßstab verkleinern (Zoom out)",
        title: "Verkleinern",
        dataTestId: "annotations-zoom-out-control",
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          zoomCamera(2);
        },
      }}
      compass={{
        bearingDeg: headingDeg,
        pitchDeg,
        tooltip:
          "Einfachklick: Norden ausrichten. Doppelklick: Norden + Nadir.",
        title: "Kompass",
        dataTestId: "annotations-compass-control",
        cursor: "grab",
        onMouseDown: handleCompassMouseDown,
        onClick: handleCompassClick,
        onDoubleClick: handleCompassDoubleClick,
      }}
    />
  );
};
