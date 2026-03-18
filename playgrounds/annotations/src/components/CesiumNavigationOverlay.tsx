import { useCallback, useEffect, useRef } from "react";

import { PI_OVER_TWO } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import { Cartesian3, Cartographic, type Scene } from "@carma/cesium";
import { SceneNavigationControls } from "@carma-mapping/components";
import { animateOrbitHeadingPitchRange } from "@carma-mapping/engines/cesium/api";
import {
  DEFAULT_OBJECT_CENTRIC_RANGE_M,
  applyObjectCentricCameraViewToScene,
  buildObjectCentricCameraOrientation,
  type ObjectCentricCameraViewInput,
  useCesiumSceneStateOptional,
} from "@carma-mapping/engines/cesium/react/scene-state";
import {
  readSceneViewStateFromSceneState,
  type SceneViewState,
} from "@carma-mapping/engines-interop";

const toObjectCentricCameraViewInput = (
  viewState: SceneViewState
): ObjectCentricCameraViewInput => ({
  anchorLngRad: degToRadNumeric(viewState.anchor.lngDeg),
  anchorLatRad: degToRadNumeric(viewState.anchor.latDeg),
  anchorHeightM: viewState.anchor.heightM,
  bearingRad: viewState.orientation.bearingRad,
  pitchRad: viewState.orientation.pitchRad,
  rangeM: viewState.orientation.rangeM,
  fovVerticalRad: viewState.orientation.fovVerticalRad,
});

const MIN_COMPASS_PITCH_RAD = 0;
const MAX_COMPASS_PITCH_RAD = degToRadNumeric(85)!;
const COMPASS_DRAG_FACTOR_RAD_PER_PX = degToRadNumeric(0.3)!;
const COMPASS_DRAG_THRESHOLD_PX = 3;
const COMPASS_CLICK_DELAY_MS = 180;
const COMPASS_ALIGN_NORTH_DURATION_MS = 700;
const COMPASS_ALIGN_NORTH_NADIR_DURATION_MS = 900;

const ZOOM_ANIMATION_DURATION_MS = 280;
const HOME_ANIMATION_DURATION_MS = 900;

const clampCompassPitchRad = (pitchRad: number) =>
  Math.max(MIN_COMPASS_PITCH_RAD, Math.min(MAX_COMPASS_PITCH_RAD, pitchRad));

const animateSceneToViewState = (
  scene: Scene,
  viewState: SceneViewState,
  options: {
    durationMs: number;
    onDone?: () => void;
  }
) => {
  const { durationMs, onDone } = options;
  const center = Cartographic.toCartesian(
    Cartographic.fromDegrees(
      viewState.anchor.lngDeg,
      viewState.anchor.latDeg,
      viewState.anchor.heightM
    )
  );
  if (!center || !Cartesian3.magnitudeSquared(center)) {
    return null;
  }

  return animateOrbitHeadingPitchRange(
    scene,
    center,
    {
      heading: (viewState.orientation.bearingRad ?? 0) as Radians,
      pitch: ((viewState.orientation.pitchRad ?? 0) - PI_OVER_TWO) as Radians,
      range: viewState.orientation.rangeM ?? DEFAULT_OBJECT_CENTRIC_RANGE_M,
    },
    {
      durationMs,
      onComplete: onDone,
      onCancel: onDone,
    }
  );
};

const flySceneToViewState = (
  scene: Scene,
  viewState: SceneViewState,
  options: {
    durationMs: number;
    onDone?: () => void;
  }
) => {
  const { durationMs, onDone } = options;
  const objectCentricView = toObjectCentricCameraViewInput(viewState);
  const orientation = buildObjectCentricCameraOrientation(objectCentricView);
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
  initialHomeViewState = null,
}: {
  scene: Scene | null;
  initialHomeViewState?: SceneViewState | null;
}) => {
  const sceneState = useCesiumSceneStateOptional();
  const viewState = readSceneViewStateFromSceneState(sceneState, {
    fallbackHeightM: 200,
  });
  const homeViewStateRef = useRef<SceneViewState | null>(initialHomeViewState);
  const initialDragStateRef = useRef<{
    mouseX: number;
    mouseY: number;
    bearingRad: number;
    pitchRad: number;
    rangeM: number;
  } | null>(null);
  const didCompassDragRef = useRef(false);
  const pendingCompassClickTimeoutRef = useRef<number | null>(null);
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (initialHomeViewState) {
      homeViewStateRef.current = initialHomeViewState;
      return;
    }

    if (!homeViewStateRef.current && viewState) {
      homeViewStateRef.current = viewState;
    }
  }, [initialHomeViewState, viewState]);

  const applyViewStateUpdate = useCallback(
    (update: (current: SceneViewState) => SceneViewState) => {
      if (!scene || !viewState) {
        return;
      }

      cancelAnimationRef.current?.();
      const nextViewState = update(viewState);
      const cancelAnimation = animateSceneToViewState(scene, nextViewState, {
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
      applyObjectCentricCameraViewToScene({
        scene,
        view: toObjectCentricCameraViewInput(nextViewState),
      });
    },
    [scene, viewState]
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

      const nextBearingRad =
        dragState.bearingRad +
        (event.clientX - dragState.mouseX) * COMPASS_DRAG_FACTOR_RAD_PER_PX;
      const nextPitchRad = clampCompassPitchRad(
        dragState.pitchRad -
          (event.clientY - dragState.mouseY) * COMPASS_DRAG_FACTOR_RAD_PER_PX
      );

      applyViewStateUpdate((current) => ({
        ...current,
        orientation: {
          ...current.orientation,
          bearingRad: nextBearingRad,
          pitchRad: nextPitchRad,
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
  }, [applyViewStateUpdate]);

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

      if (!viewState) {
        return;
      }

      didCompassDragRef.current = false;
      initialDragStateRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        bearingRad: viewState.orientation.bearingRad ?? 0,
        pitchRad: clampCompassPitchRad(viewState.orientation.pitchRad ?? 0),
        rangeM: viewState.orientation.rangeM ?? DEFAULT_OBJECT_CENTRIC_RANGE_M,
      };
    },
    [viewState]
  );

  const animateToViewState = useCallback(
    (nextViewState: SceneViewState, durationMs: number) => {
      if (!scene) {
        return false;
      }

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateSceneToViewState(
        scene,
        nextViewState,
        {
          durationMs,
          onDone: () => {
            cancelAnimationRef.current = null;
          },
        }
      );

      return Boolean(cancelAnimationRef.current);
    },
    [scene]
  );

  const animateRangeMultiplier = useCallback(
    (multiplier: number) => {
      if (!viewState) {
        return;
      }

      const nextViewState = {
        ...viewState,
        orientation: {
          ...viewState.orientation,
          rangeM: Math.max(
            5,
            (viewState.orientation.rangeM ?? DEFAULT_OBJECT_CENTRIC_RANGE_M) *
              multiplier
          ),
        },
      };

      if (!animateToViewState(nextViewState, ZOOM_ANIMATION_DURATION_MS)) {
        applyViewStateUpdate(() => nextViewState);
      }
    },
    [animateToViewState, applyViewStateUpdate, viewState]
  );

  const handleCompassClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!viewState) {
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
        const nextViewState = {
          ...viewState,
          orientation: {
            ...viewState.orientation,
            bearingRad: 0,
          },
        };

        if (
          !animateToViewState(nextViewState, COMPASS_ALIGN_NORTH_DURATION_MS)
        ) {
          applyViewStateUpdate(() => nextViewState);
        }

        pendingCompassClickTimeoutRef.current = null;
      }, COMPASS_CLICK_DELAY_MS);
    },
    [animateToViewState, applyViewStateUpdate, viewState]
  );

  const handleCompassDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!viewState) {
        return;
      }

      if (pendingCompassClickTimeoutRef.current !== null) {
        window.clearTimeout(pendingCompassClickTimeoutRef.current);
        pendingCompassClickTimeoutRef.current = null;
      }

      didCompassDragRef.current = false;

      const nextViewState = {
        ...viewState,
        orientation: {
          ...viewState.orientation,
          bearingRad: 0,
          pitchRad: 0,
        },
      };

      if (
        !animateToViewState(
          nextViewState,
          COMPASS_ALIGN_NORTH_NADIR_DURATION_MS
        )
      ) {
        applyViewStateUpdate(() => nextViewState);
      }
    },
    [animateToViewState, applyViewStateUpdate, viewState]
  );

  const handleHomeClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const homeViewState = homeViewStateRef.current;
      if (!homeViewState) {
        return;
      }

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = flySceneToViewState(
        scene as Scene,
        homeViewState,
        {
          durationMs: HOME_ANIMATION_DURATION_MS,
          onDone: () => {
            cancelAnimationRef.current = null;
          },
        }
      );

      if (
        !cancelAnimationRef.current &&
        !animateToViewState(homeViewState, HOME_ANIMATION_DURATION_MS)
      ) {
        applyObjectCentricCameraViewToScene({
          scene: scene as Scene,
          view: toObjectCentricCameraViewInput(homeViewState),
        });
      }
    },
    [animateToViewState, scene]
  );

  const disabled = !scene || !viewState;
  const homeDisabled = !scene || !homeViewStateRef.current;
  const headingDeg = radToDegNumeric(viewState?.orientation.bearingRad ?? 0)!;
  const pitchDeg = radToDegNumeric(
    clampCompassPitchRad(viewState?.orientation.pitchRad ?? 0)
  )!;

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
