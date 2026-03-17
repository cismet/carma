import { useCallback, useEffect, useRef } from "react";

import type { Radians } from "@carma/units/types";
import { Cartesian3, Cartographic, type Scene } from "@carma/cesium";
import { SceneNavigationControls } from "@carma-mapping/components";
import { animateOrbitHeadingPitchRange } from "@carma-mapping/engines/cesium/api";
import { useCesiumSceneStateOptional } from "@carma-mapping/engines/cesium/react/scene-state";
import {
  readSceneDescriptorHashSnapshotFromSceneState,
  type SceneDescriptorHashSnapshot,
} from "@carma-providers/hash-state";

import {
  applyObjectCentricCameraSnapshotToScene,
  buildObjectCentricCameraOrientation,
  DEFAULT_HASH_RANGE_M,
} from "./objectCentricCesiumCamera";

const MIN_COMPASS_PITCH_DEG = 0;
const MAX_COMPASS_PITCH_DEG = 85;
const COMPASS_DRAG_FACTOR_DEG_PER_PX = 0.3;
const COMPASS_DRAG_THRESHOLD_PX = 3;
const COMPASS_CLICK_DELAY_MS = 180;
const COMPASS_ALIGN_NORTH_DURATION_MS = 700;
const COMPASS_ALIGN_NORTH_NADIR_DURATION_MS = 900;

const ZOOM_ANIMATION_DURATION_MS = 280;
const HOME_ANIMATION_DURATION_MS = 900;

const clampCompassPitchDeg = (pitchDeg: number) =>
  Math.max(MIN_COMPASS_PITCH_DEG, Math.min(MAX_COMPASS_PITCH_DEG, pitchDeg));

const readSceneSnapshot = (
  sceneState: ReturnType<typeof useCesiumSceneStateOptional>
): SceneDescriptorHashSnapshot | null => {
  const pose = sceneState?.camera.cameraModel?.pose;
  const fovVertical = sceneState?.camera.fovVertical;

  if (pose?.anchor) {
    return {
      anchor: {
        lngDeg: (pose.anchor.longitude * 180) / Math.PI,
        latDeg: (pose.anchor.latitude * 180) / Math.PI,
        heightM: pose.anchor.altitude,
        source: "screen-center",
      },
      orientation: {
        bearingDeg:
          typeof pose.bearing === "number"
            ? (pose.bearing * 180) / Math.PI
            : undefined,
        pitchDeg:
          typeof pose.pitch === "number"
            ? (pose.pitch * 180) / Math.PI
            : undefined,
        rollDeg:
          typeof pose.roll === "number"
            ? (pose.roll * 180) / Math.PI
            : undefined,
        fovDeg:
          typeof fovVertical === "number" ? (fovVertical * 180) / Math.PI : undefined,
        rangeM: pose.range,
      },
    };
  }

  return readSceneDescriptorHashSnapshotFromSceneState({
    sceneState,
    anchorMode: "screen-center",
    fallbackHeightM: 200,
  });
};

const animateSceneToSnapshot = ({
  scene,
  snapshot,
  durationMs,
  onDone,
}: {
  scene: Scene;
  snapshot: SceneDescriptorHashSnapshot;
  durationMs: number;
  onDone?: () => void;
}) => {
  const center = Cartographic.toCartesian(
    Cartographic.fromDegrees(
      snapshot.anchor.lngDeg,
      snapshot.anchor.latDeg,
      snapshot.anchor.heightM
    )
  );
  if (!center || !Cartesian3.magnitudeSquared(center)) {
    return null;
  }

  return animateOrbitHeadingPitchRange(
    scene,
    center,
    {
      heading:
        (((snapshot.orientation.bearingDeg ?? 0) * Math.PI) / 180) as Radians,
      pitch:
        ((((snapshot.orientation.pitchDeg ?? 0) * Math.PI) / 180) -
          Math.PI * 0.5) as Radians,
      range: snapshot.orientation.rangeM ?? DEFAULT_HASH_RANGE_M,
    },
    {
      durationMs,
      onComplete: onDone,
      onCancel: onDone,
    }
  );
};

const flySceneToSnapshot = ({
  scene,
  snapshot,
  durationMs,
  onDone,
}: {
  scene: Scene;
  snapshot: SceneDescriptorHashSnapshot;
  durationMs: number;
  onDone?: () => void;
}) => {
  const orientation = buildObjectCentricCameraOrientation(snapshot);
  if (!orientation) {
    return null;
  }

  let settled = false;
  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    onDone?.();
  };

  if (
    typeof orientation.fovRad === "number" &&
    scene.camera.frustum &&
    "fov" in scene.camera.frustum
  ) {
    (scene.camera.frustum as { fov?: number }).fov = orientation.fovRad;
  }

  scene.camera.flyTo({
    destination: orientation.destination,
    orientation: {
      direction: orientation.direction,
      up: orientation.up,
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
  initialHomeSnapshot = null,
}: {
  scene: Scene | null;
  initialHomeSnapshot?: SceneDescriptorHashSnapshot | null;
}) => {
  const sceneState = useCesiumSceneStateOptional();
  const snapshot = readSceneSnapshot(sceneState);
  const homeSnapshotRef = useRef<SceneDescriptorHashSnapshot | null>(
    initialHomeSnapshot
  );
  const initialDragStateRef = useRef<{
    mouseX: number;
    mouseY: number;
    bearingDeg: number;
    pitchDeg: number;
    rangeM: number;
  } | null>(null);
  const didCompassDragRef = useRef(false);
  const pendingCompassClickTimeoutRef = useRef<number | null>(null);
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (initialHomeSnapshot) {
      homeSnapshotRef.current = initialHomeSnapshot;
      return;
    }

    if (!homeSnapshotRef.current && snapshot) {
      homeSnapshotRef.current = snapshot;
    }
  }, [initialHomeSnapshot, snapshot]);

  const applySnapshotUpdate = useCallback(
    (
      update: (
        current: SceneDescriptorHashSnapshot
      ) => SceneDescriptorHashSnapshot
    ) => {
      if (!scene || !snapshot) {
        return;
      }

      cancelAnimationRef.current?.();
      const nextSnapshot = update(snapshot);
      const cancelAnimation = animateSceneToSnapshot({
        scene,
        snapshot: nextSnapshot,
        durationMs: 0,
        onDone: () => {
          cancelAnimationRef.current = null;
        },
      });

      if (cancelAnimation) {
        cancelAnimationRef.current = cancelAnimation;
        return;
      }

      cancelAnimationRef.current = null;
      applyObjectCentricCameraSnapshotToScene({
        scene,
        snapshot: nextSnapshot,
      });
    },
    [scene, snapshot]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = initialDragStateRef.current;
      if (!dragState) {
        return;
      }

      if (
        Math.abs(event.clientX - dragState.mouseX) > COMPASS_DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - dragState.mouseY) > COMPASS_DRAG_THRESHOLD_PX
      ) {
        didCompassDragRef.current = true;
      }

      const nextBearingDeg =
        dragState.bearingDeg +
        (event.clientX - dragState.mouseX) * COMPASS_DRAG_FACTOR_DEG_PER_PX;
      const nextPitchDeg = clampCompassPitchDeg(
        dragState.pitchDeg -
          (event.clientY - dragState.mouseY) * COMPASS_DRAG_FACTOR_DEG_PER_PX
      );

      applySnapshotUpdate((current) => ({
        ...current,
        orientation: {
          ...current.orientation,
          bearingDeg: nextBearingDeg,
          pitchDeg: nextPitchDeg,
          rangeM: dragState.rangeM,
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
  }, [applySnapshotUpdate]);

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

      if (!snapshot) {
        return;
      }

      didCompassDragRef.current = false;
      initialDragStateRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        bearingDeg: snapshot.orientation.bearingDeg ?? 0,
        pitchDeg: clampCompassPitchDeg(snapshot.orientation.pitchDeg ?? 0),
        rangeM: snapshot.orientation.rangeM ?? DEFAULT_HASH_RANGE_M,
      };
    },
    [snapshot]
  );

  const animateToSnapshot = useCallback(
    (nextSnapshot: SceneDescriptorHashSnapshot, durationMs: number) => {
      if (!scene) {
        return false;
      }

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateSceneToSnapshot({
        scene,
        snapshot: nextSnapshot,
        durationMs,
        onDone: () => {
          cancelAnimationRef.current = null;
        },
      });

      return Boolean(cancelAnimationRef.current);
    },
    [scene]
  );

  const animateRangeMultiplier = useCallback(
    (multiplier: number) => {
      if (!snapshot) {
        return;
      }

      const nextSnapshot = {
        ...snapshot,
        orientation: {
          ...snapshot.orientation,
          rangeM: Math.max(
            5,
            (snapshot.orientation.rangeM ?? DEFAULT_HASH_RANGE_M) * multiplier
          ),
        },
      };

      if (!animateToSnapshot(nextSnapshot, ZOOM_ANIMATION_DURATION_MS)) {
        applySnapshotUpdate(() => nextSnapshot);
      }
    },
    [animateToSnapshot, applySnapshotUpdate, snapshot]
  );

  const handleCompassClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!snapshot) {
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
        const nextSnapshot = {
          ...snapshot,
          orientation: {
            ...snapshot.orientation,
            bearingDeg: 0,
          },
        };

        if (!animateToSnapshot(nextSnapshot, COMPASS_ALIGN_NORTH_DURATION_MS)) {
          applySnapshotUpdate(() => nextSnapshot);
        }

        pendingCompassClickTimeoutRef.current = null;
      }, COMPASS_CLICK_DELAY_MS);
    },
    [animateToSnapshot, applySnapshotUpdate, snapshot]
  );

  const handleCompassDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!snapshot) {
        return;
      }

      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
        pendingCompassClickTimeoutRef.current = null;
      }

      didCompassDragRef.current = false;

      const nextSnapshot = {
        ...snapshot,
        orientation: {
          ...snapshot.orientation,
          bearingDeg: 0,
          pitchDeg: 0,
        },
      };

      if (!animateToSnapshot(nextSnapshot, COMPASS_ALIGN_NORTH_NADIR_DURATION_MS)) {
        applySnapshotUpdate(() => nextSnapshot);
      }
    },
    [animateToSnapshot, applySnapshotUpdate, snapshot]
  );

  const handleHomeClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const homeSnapshot = homeSnapshotRef.current;
      if (!homeSnapshot) {
        return;
      }

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = flySceneToSnapshot({
        scene: scene as Scene,
        snapshot: homeSnapshot,
        durationMs: HOME_ANIMATION_DURATION_MS,
        onDone: () => {
          cancelAnimationRef.current = null;
        },
      });

      if (!cancelAnimationRef.current && !animateToSnapshot(homeSnapshot, HOME_ANIMATION_DURATION_MS)) {
        applyObjectCentricCameraSnapshotToScene({
          scene: scene as Scene,
          snapshot: homeSnapshot,
        });
      }
    },
    [animateToSnapshot, scene]
  );

  const disabled = !scene || !snapshot;
  const homeDisabled = !scene || !homeSnapshotRef.current;
  const headingDeg = snapshot?.orientation.bearingDeg ?? 0;
  const pitchDeg = clampCompassPitchDeg(snapshot?.orientation.pitchDeg ?? 0);

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
          animateRangeMultiplier(0.5);
        },
      }}
      zoomOut={{
        tooltip: "Maßstab verkleinern (Zoom out)",
        title: "Verkleinern",
        dataTestId: "annotations-zoom-out-control",
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          animateRangeMultiplier(2);
        },
      }}
      compass={{
        bearingDeg: headingDeg,
        pitchDeg,
        tooltip: "Einfachklick: Norden ausrichten. Doppelklick: Norden + Nadir.",
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
