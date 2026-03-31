import {
  bindCesiumCameraChangedListener,
  bindCesiumFrameListener,
  cancelCesiumSceneFovZoom,
  computeNextCesiumFov,
  flyCesiumSceneFovZoom,
  readCachedCesiumCompassOrientationDeg,
  readCachedCesiumSceneCenter,
  readCesiumScene,
  readPerspectiveFrustumVerticalFov,
  requestCesiumRender,
  type CameraStateRecord,
  type CesiumSceneTarget,
} from "@carma-mapping/engines/cesium/api";
import {
  applyCesiumCompassBearingPitch,
  applyCesiumSceneTravelZoomStep,
  animateOrbitHeadingPitchRange,
  beginCesiumCompassDrag,
  cancelCesiumSceneTravelZoom,
  Cartesian3,
  endCesiumCompassDrag,
  animateCesiumSceneTravelZoom,
  flyToCameraState,
  HeadingPitchRange,
  MAX_CESIUM_COMPASS_PITCH_DEG,
  Matrix4,
  MIN_CESIUM_COMPASS_PITCH_RAD,
  PerspectiveFrustum,
  setViewFromCameraState,
  fromCompassPitchDegToCesiumPitchRad,
  type Scene,
  type CesiumCompassDragSession,
} from "@carma/cesium";
import { clamp } from "@carma/math";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Milliseconds, Radians } from "@carma/units/types";

import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  DEFAULT_NAVIGATION_HOME_DURATION_MS,
  NAVIGATION_COMPASS_CURSORS,
  NAVIGATION_ORBIT_DIRECTIONS,
  NAVIGATION_ORBIT_TARGETS,
  NAVIGATION_ZOOM_MODES,
  type NavigationContinuousZoomOptions,
  type NavigationMethods,
  type NavigationNeedleOrientationDeg,
  type NavigationOrbitActiveSink,
  type NavigationOrbitOptions,
  type NavigationOrbitTarget,
  type NavigationTransitionOptions,
  type NavigationZoomOptions,
} from "../../contracts";
const ZERO_RADIANS = degToRadNumeric(0)! as Radians;
const ABSOLUTE_MIN_CESIUM_FOV_RAD = degToRadNumeric(0.1)! as Radians;
const DEFAULT_MIN_CESIUM_FOV_RAD = degToRadNumeric(2)! as Radians;
const DEFAULT_MAX_CESIUM_FOV_RAD = degToRadNumeric(120)! as Radians;
const ABSOLUTE_MAX_CESIUM_FOV_RAD = degToRadNumeric(179)! as Radians;
const DEFAULT_ORBIT_PREP_DURATION_MS = 300;
const DEFAULT_ORBIT_SPEED_DEG_PER_SECOND =
  360 / DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC;
const DEFAULT_MIN_ORBIT_PITCH_DEG = 30;
const DEFAULT_CONTINUOUS_ZOOM_DELTA_PER_SECOND = 1;
const DEFAULT_CONTINUOUS_ZOOM_EASE_IN_MS = 180;
const CONTINUOUS_ZOOM_STOP_EPSILON = 1e-6;

const readTransitionDurationSeconds = (
  duration?: NavigationTransitionOptions["duration"]
): number | undefined => {
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return undefined;
  }

  return duration / 1000;
};

const readZoomDurationMs = (
  options: Pick<NavigationZoomOptions, "animate" | "duration">
): number | undefined => {
  if (options.animate === false) {
    return 0;
  }

  const { duration } = options;
  if (duration === 0) {
    return 0;
  }

  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return undefined;
  }

  return duration;
};

const readHomeDurationMs = (options: NavigationTransitionOptions): number =>
  typeof options.duration === "number" &&
  Number.isFinite(options.duration) &&
  options.duration >= 0
    ? options.duration
    : DEFAULT_NAVIGATION_HOME_DURATION_MS;

const readOrbitDirectionSign = (options: NavigationOrbitOptions): number => {
  if (options.direction === NAVIGATION_ORBIT_DIRECTIONS.CCW) {
    return -1;
  }

  if (options.direction === NAVIGATION_ORBIT_DIRECTIONS.CW) {
    return 1;
  }

  if (
    typeof options.bearingDeltaDeg === "number" &&
    Number.isFinite(options.bearingDeltaDeg) &&
    options.bearingDeltaDeg !== 0
  ) {
    return Math.sign(options.bearingDeltaDeg);
  }

  return 1;
};

const readOrbitSpeedDegPerSecond = (
  options: NavigationOrbitOptions
): number => {
  const directionSign = readOrbitDirectionSign(options);

  if (
    typeof options.revolutionDurationSec === "number" &&
    Number.isFinite(options.revolutionDurationSec) &&
    options.revolutionDurationSec > 0
  ) {
    return (directionSign * 360) / options.revolutionDurationSec;
  }

  if (
    typeof options.speedDegPerSecond === "number" &&
    Number.isFinite(options.speedDegPerSecond) &&
    options.speedDegPerSecond !== 0
  ) {
    return options.speedDegPerSecond;
  }

  if (
    typeof options.bearingDeltaDeg === "number" &&
    Number.isFinite(options.bearingDeltaDeg) &&
    options.bearingDeltaDeg !== 0
  ) {
    return directionSign * DEFAULT_ORBIT_SPEED_DEG_PER_SECOND;
  }

  return directionSign * DEFAULT_ORBIT_SPEED_DEG_PER_SECOND;
};

const readOrbitPrepDurationMs = (options: NavigationOrbitOptions): number =>
  typeof options.duration === "number" &&
  Number.isFinite(options.duration) &&
  options.duration > 0
    ? options.duration
    : DEFAULT_ORBIT_PREP_DURATION_MS;

const readMinimumOrbitPitchDeg = (options: NavigationOrbitOptions): number =>
  clamp(
    typeof options.minPitchDeg === "number" &&
      Number.isFinite(options.minPitchDeg)
      ? options.minPitchDeg
      : DEFAULT_MIN_ORBIT_PITCH_DEG,
    0,
    MAX_CESIUM_COMPASS_PITCH_DEG
  );

const readResolvedCesiumFovBounds = (options: NavigationZoomOptions) => {
  const rawMinimumFovRad =
    typeof options.minimumFovRad === "number" &&
    Number.isFinite(options.minimumFovRad)
      ? options.minimumFovRad
      : DEFAULT_MIN_CESIUM_FOV_RAD;
  const rawMaximumFovRad =
    typeof options.maximumFovRad === "number" &&
    Number.isFinite(options.maximumFovRad)
      ? options.maximumFovRad
      : DEFAULT_MAX_CESIUM_FOV_RAD;

  return {
    minimumFovRad: clamp(
      Math.min(rawMinimumFovRad, rawMaximumFovRad),
      ABSOLUTE_MIN_CESIUM_FOV_RAD,
      ABSOLUTE_MAX_CESIUM_FOV_RAD
    ) as Radians,
    maximumFovRad: clamp(
      Math.max(rawMinimumFovRad, rawMaximumFovRad),
      ABSOLUTE_MIN_CESIUM_FOV_RAD,
      ABSOLUTE_MAX_CESIUM_FOV_RAD
    ) as Radians,
  };
};

const readResolvedCesiumTargetFov = (
  activeScene: Scene,
  options: NavigationZoomOptions,
  direction: "in" | "out"
) => {
  if (!(activeScene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const { minimumFovRad, maximumFovRad } = readResolvedCesiumFovBounds(options);

  return computeNextCesiumFov(activeScene, direction, {
    zoomDelta: options.zoomDelta,
    minimumFovRad,
    maximumFovRad,
  });
};

type CreateCesiumNavigationMethodsOptions = {
  homeCameraState?: CameraStateRecord | null;
  disabled?: boolean;
  onInteractionStart?: () => boolean | void;
};

export const createCesiumNavigationMethods = (
  scene: CesiumSceneTarget,
  {
    homeCameraState = null,
    disabled = false,
    onInteractionStart,
  }: CreateCesiumNavigationMethodsOptions = {}
): NavigationMethods<CameraStateRecord> => {
  let cancelOrbitPreparationAnimation: (() => void) | null = null;
  let cancelContinuousOrbit: (() => void) | null = null;
  let cancelContinuousZoom: (() => void) | null = null;
  let cesiumCompassDragSession: CesiumCompassDragSession | null = null;
  let isOrbitActive = false;
  const orbitActiveSinks = new Set<NavigationOrbitActiveSink>();

  const publishOrbitActive = (active: boolean) => {
    if (isOrbitActive === active) {
      return;
    }

    isOrbitActive = active;
    orbitActiveSinks.forEach((sink) => {
      sink(active);
    });
  };

  const stopMotion = (
    activeScene: Scene,
    { keepSceneZoom = false }: { keepSceneZoom?: boolean } = {}
  ) => {
    cancelOrbitPreparationAnimation?.();
    cancelOrbitPreparationAnimation = null;
    cancelContinuousOrbit?.();
    cancelContinuousOrbit = null;
    cancelContinuousZoom?.();
    cancelContinuousZoom = null;
    cancelCesiumSceneFovZoom(activeScene);
    cesiumCompassDragSession = null;
    publishOrbitActive(false);

    if (!keepSceneZoom) {
      cancelCesiumSceneTravelZoom(activeScene);
    }

    if (typeof activeScene.camera.cancelFlight === "function") {
      activeScene.camera.cancelFlight();
    }

    try {
      activeScene.camera.lookAtTransform(Matrix4.IDENTITY);
    } catch {
      // Ignore transient teardown races.
    }

    requestCesiumRender(activeScene);
  };

  const runWithScene = (
    action: (activeScene: Scene) => void,
    {
      stopCurrentMotion = true,
      keepSceneZoom = false,
    }: {
      stopCurrentMotion?: boolean;
      keepSceneZoom?: boolean;
    } = {}
  ) => {
    if (disabled) {
      return false;
    }

    if (onInteractionStart?.() === false) {
      return false;
    }

    const activeScene = readCesiumScene(scene);
    if (!activeScene) {
      return false;
    }

    if (stopCurrentMotion) {
      stopMotion(activeScene, { keepSceneZoom });
    }

    action(activeScene);
    return true;
  };

  const resolveOrbitCenter = (
    activeScene: Scene,
    target: NavigationOrbitTarget | undefined
  ) => {
    if (target && target !== NAVIGATION_ORBIT_TARGETS.CURRENT_VIEW) {
      return Cartesian3.fromDegrees(
        target.longitudeDeg,
        target.latitudeDeg,
        target.altitudeM ?? 0
      );
    }

    return readCachedCesiumSceneCenter(activeScene);
  };

  const startOrbitLoop = (
    activeScene: Scene,
    orbitCenter: Cartesian3,
    options: NavigationOrbitOptions,
    rangeM: number,
    pitchDeg: number
  ) => {
    const targetPitchRad = fromCompassPitchDegToCesiumPitchRad(pitchDeg);
    const orbitSpeedRadPerSecond = degToRadNumeric(
      readOrbitSpeedDegPerSecond(options)
    );
    let frameId: number | null = null;
    let lastFrameTime: number | null = null;

    const step = (frameTime: number) => {
      if (!isOrbitActive) {
        cancelContinuousOrbit = null;
        return;
      }

      const deltaSeconds =
        lastFrameTime === null ? 0 : (frameTime - lastFrameTime) / 1000;
      lastFrameTime = frameTime;

      activeScene.camera.lookAt(
        orbitCenter,
        new HeadingPitchRange(
          activeScene.camera.heading + orbitSpeedRadPerSecond * deltaSeconds,
          targetPitchRad,
          rangeM
        )
      );
      requestCesiumRender(activeScene);

      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);

    cancelContinuousOrbit = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }

      try {
        activeScene.camera.lookAtTransform(Matrix4.IDENTITY);
      } catch {
        // Ignore transient teardown races.
      }

      requestCesiumRender(activeScene);
      cancelContinuousOrbit = null;
    };
  };

  const setView = (state: CameraStateRecord) => {
    runWithScene((activeScene) => {
      setViewFromCameraState(activeScene.camera, state);
      requestCesiumRender(activeScene);
    });
  };

  const applyZoom = (
    activeScene: Scene,
    direction: "in" | "out",
    options: NavigationZoomOptions = {}
  ) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;

    if (isFovMode || isDollyMode) {
      if (!(activeScene.camera.frustum instanceof PerspectiveFrustum)) {
        return;
      }

      const { minimumFovRad, maximumFovRad } =
        readResolvedCesiumFovBounds(options);

      if (isDollyMode) {
        const nextFov = readResolvedCesiumTargetFov(
          activeScene,
          options,
          direction
        );
        if (nextFov === null) {
          return;
        }

        if (readZoomDurationMs(options) === 0) {
          applyCesiumSceneTravelZoomStep(activeScene, {
            direction,
            zoomDelta: options.zoomDelta,
            synchronizedFovTargetRad: nextFov,
          });
          return;
        }

        animateCesiumSceneTravelZoom(activeScene, {
          direction,
          durationMs: readZoomDurationMs(options) ?? 500,
          zoomDelta: options.zoomDelta,
          synchronizedFovTargetRad: nextFov,
          onStarted: options.onStarted,
          onCompleted: options.onCompleted,
          onCanceled: options.onCanceled,
        });
        return;
      }

      flyCesiumSceneFovZoom(activeScene, {
        direction,
        durationMs: readZoomDurationMs(options) ?? 250,
        zoomDelta: options.zoomDelta,
        minimumFovRad,
        maximumFovRad,
        onStarted: options.onStarted,
        onCompleted: options.onCompleted,
        onCanceled: options.onCanceled,
      });
      return;
    }

    animateCesiumSceneTravelZoom(activeScene, {
      direction,
      durationMs: readZoomDurationMs(options) ?? 500,
      zoomDelta: options.zoomDelta,
      onStarted: options.onStarted,
      onCompleted: options.onCompleted,
      onCanceled: options.onCanceled,
    });
  };

  const stopContinuousZoom = () => {
    cancelContinuousZoom?.();
    cancelContinuousZoom = null;
  };

  const startContinuousZoom = (options: NavigationContinuousZoomOptions) => {
    runWithScene(
      (activeScene) => {
        const mode = options.mode ?? NAVIGATION_ZOOM_MODES.DOLLY;
        const zoomDeltaPerSecond =
          typeof options.zoomDeltaPerSecond === "number" &&
          Number.isFinite(options.zoomDeltaPerSecond) &&
          options.zoomDeltaPerSecond > 0
            ? options.zoomDeltaPerSecond
            : DEFAULT_CONTINUOUS_ZOOM_DELTA_PER_SECOND;
        const easeInDurationMs =
          typeof options.easeInDurationMs === "number" &&
          Number.isFinite(options.easeInDurationMs) &&
          options.easeInDurationMs > 0
            ? options.easeInDurationMs
            : DEFAULT_CONTINUOUS_ZOOM_EASE_IN_MS;

        let frameId: number | null = null;
        let lastFrameTimeMs: number | null = null;
        const startedAtMs = performance.now();

        const step = (frameTimeMs: number) => {
          const deltaSeconds =
            lastFrameTimeMs === null
              ? 0
              : (frameTimeMs - lastFrameTimeMs) / 1000;
          lastFrameTimeMs = frameTimeMs;

          const easeFactor =
            easeInDurationMs <= 0
              ? 1
              : clamp((frameTimeMs - startedAtMs) / easeInDurationMs, 0, 1);
          const zoomDelta = zoomDeltaPerSecond * deltaSeconds * easeFactor;

          if (zoomDelta > 0) {
            if (
              mode === NAVIGATION_ZOOM_MODES.DOLLY &&
              activeScene.camera.frustum instanceof PerspectiveFrustum
            ) {
              const currentFov = readPerspectiveFrustumVerticalFov(
                activeScene.camera.frustum
              );
              const nextFov = readResolvedCesiumTargetFov(
                activeScene,
                {
                  mode,
                  zoomDelta,
                  minimumFovRad: options.minimumFovRad,
                  maximumFovRad: options.maximumFovRad,
                },
                options.direction
              );

              if (
                typeof currentFov !== "number" ||
                !Number.isFinite(currentFov) ||
                typeof nextFov !== "number" ||
                !Number.isFinite(nextFov) ||
                Math.abs(nextFov - currentFov) <= CONTINUOUS_ZOOM_STOP_EPSILON
              ) {
                stopContinuousZoom();
                return;
              }
            }

            const zoomOptions: NavigationZoomOptions = {
              mode,
              zoomDelta,
              duration: 0 as Milliseconds,
              minimumFovRad: options.minimumFovRad,
              maximumFovRad: options.maximumFovRad,
            };

            applyZoom(activeScene, options.direction, zoomOptions);
          }

          frameId = window.requestAnimationFrame(step);
        };

        cancelContinuousZoom?.();
        frameId = window.requestAnimationFrame(step);

        cancelContinuousZoom = () => {
          if (frameId !== null) {
            window.cancelAnimationFrame(frameId);
            frameId = null;
          }

          cancelContinuousZoom = null;
        };
      },
      { keepSceneZoom: false }
    );
  };

  const flyTo = (
    state: CameraStateRecord,
    options: NavigationTransitionOptions = {}
  ) => {
    runWithScene((activeScene) => {
      if (
        typeof options.duration !== "number" ||
        !Number.isFinite(options.duration) ||
        options.duration <= 0
      ) {
        options.onStarted?.();
        setViewFromCameraState(activeScene.camera, state);
        requestCesiumRender(activeScene);
        options.onCompleted?.();
        return;
      }

      options.onStarted?.();
      flyToCameraState(activeScene, state, {
        duration: readTransitionDurationSeconds(options.duration),
        applyFov: true,
        onComplete: options.onCompleted,
        onCancel: options.onCanceled,
      });
    });
  };

  const zoomIn = (options: NavigationZoomOptions = {}) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;
    runWithScene(
      (activeScene) => {
        applyZoom(activeScene, "in", options);
      },
      { keepSceneZoom: !(isFovMode || isDollyMode) }
    );
  };

  const zoomOut = (options: NavigationZoomOptions = {}) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;
    runWithScene(
      (activeScene) => {
        applyZoom(activeScene, "out", options);
      },
      { keepSceneZoom: !(isFovMode || isDollyMode) }
    );
  };

  const goHome = (options: NavigationTransitionOptions = {}) => {
    if (!homeCameraState) {
      return;
    }

    const durationMs = readHomeDurationMs(options);
    if (durationMs > 0) {
      flyTo(homeCameraState, {
        ...options,
        duration: durationMs as NavigationTransitionOptions["duration"],
      });
      return;
    }

    runWithScene((activeScene) => {
      options.onStarted?.();
      setViewFromCameraState(activeScene.camera, homeCameraState);
      requestCesiumRender(activeScene);
      options.onCompleted?.();
    });
  };

  const orbit = (options: NavigationOrbitOptions = {}) => {
    runWithScene(
      (activeScene) => {
        if (isOrbitActive) {
          stopMotion(activeScene);
          return;
        }

        publishOrbitActive(true);

        const orbitCenter = resolveOrbitCenter(activeScene, options.target);
        if (!orbitCenter) {
          publishOrbitActive(false);
          return;
        }

        const targetRange =
          typeof options.rangeM === "number" && Number.isFinite(options.rangeM)
            ? options.rangeM
            : Cartesian3.distance(orbitCenter, activeScene.camera.positionWC);
        const currentPitchDeg =
          readCachedCesiumCompassOrientationDeg(activeScene).pitchDeg;
        const minimumPitchDeg = readMinimumOrbitPitchDeg(options);
        const orbitPitchDeg = Math.max(currentPitchDeg, minimumPitchDeg);
        const startContinuousOrbit = () => {
          if (!isOrbitActive) {
            return;
          }

          startOrbitLoop(
            activeScene,
            orbitCenter,
            options,
            targetRange,
            orbitPitchDeg
          );
          options.onCompleted?.();
        };

        if (currentPitchDeg < minimumPitchDeg) {
          options.onStarted?.();
          cancelOrbitPreparationAnimation = animateOrbitHeadingPitchRange(
            activeScene,
            orbitCenter,
            {
              heading: activeScene.camera.heading as Radians,
              pitch: fromCompassPitchDegToCesiumPitchRad(orbitPitchDeg),
              range: targetRange,
            },
            {
              durationMs: readOrbitPrepDurationMs(options),
              onComplete: () => {
                cancelOrbitPreparationAnimation = null;
                startContinuousOrbit();
              },
              onCancel: () => {
                cancelOrbitPreparationAnimation = null;
                options.onCanceled?.();
              },
            }
          );
          return;
        }

        options.onStarted?.();
        startContinuousOrbit();
      },
      { stopCurrentMotion: false }
    );
  };

  const beginCompassDrag = () => {
    runWithScene((activeScene) => {
      cesiumCompassDragSession = beginCesiumCompassDrag(activeScene);
    });
  };

  const setCompassBearingPitch = (
    orientation: NavigationNeedleOrientationDeg
  ) => {
    runWithScene(
      (activeScene) => {
        const dragSession =
          cesiumCompassDragSession ?? beginCesiumCompassDrag(activeScene);
        cesiumCompassDragSession = dragSession;

        applyCesiumCompassBearingPitch(activeScene, dragSession, orientation, {
          maxPitchDeg: MAX_CESIUM_COMPASS_PITCH_DEG,
        });
      },
      { stopCurrentMotion: false }
    );
  };

  const endCompassDrag = () => {
    const activeScene = readCesiumScene(scene);
    if (!activeScene) {
      cesiumCompassDragSession = null;
      return;
    }

    endCesiumCompassDrag(activeScene);
    cesiumCompassDragSession = null;
  };

  const alignNorth = (options: NavigationTransitionOptions = {}) => {
    runWithScene((activeScene) => {
      const orbitCenter = readCachedCesiumSceneCenter(activeScene);
      if (orbitCenter) {
        const range = Cartesian3.distance(
          orbitCenter,
          activeScene.camera.positionWC
        );

        if (
          typeof options.duration === "number" &&
          Number.isFinite(options.duration) &&
          options.duration > 0
        ) {
          options.onStarted?.();
          cancelOrbitPreparationAnimation = animateOrbitHeadingPitchRange(
            activeScene,
            orbitCenter,
            {
              heading: ZERO_RADIANS,
              pitch: activeScene.camera.pitch as Radians,
              range,
            },
            {
              durationMs: options.duration,
              onComplete: () => {
                cancelOrbitPreparationAnimation = null;
                options.onCompleted?.();
              },
              onCancel: () => {
                cancelOrbitPreparationAnimation = null;
                options.onCanceled?.();
              },
            }
          );
          return;
        }

        options.onStarted?.();
        activeScene.camera.lookAt(
          orbitCenter,
          new HeadingPitchRange(0, activeScene.camera.pitch, range)
        );
        activeScene.camera.lookAtTransform(Matrix4.IDENTITY);
        requestCesiumRender(activeScene);
        options.onCompleted?.();
        return;
      }

      options.onStarted?.();
      activeScene.camera.setView({
        destination: activeScene.camera.position,
        orientation: {
          heading: 0,
          pitch: activeScene.camera.pitch,
          roll: activeScene.camera.roll,
        },
      });
      requestCesiumRender(activeScene);
      options.onCompleted?.();
    });
  };

  const alignNorthNadir = (options: NavigationTransitionOptions = {}) => {
    runWithScene((activeScene) => {
      const orbitCenter = readCachedCesiumSceneCenter(activeScene);
      if (orbitCenter) {
        const range = Cartesian3.distance(
          orbitCenter,
          activeScene.camera.positionWC
        );

        if (
          typeof options.duration === "number" &&
          Number.isFinite(options.duration) &&
          options.duration > 0
        ) {
          options.onStarted?.();
          cancelOrbitPreparationAnimation = animateOrbitHeadingPitchRange(
            activeScene,
            orbitCenter,
            {
              heading: ZERO_RADIANS,
              pitch: MIN_CESIUM_COMPASS_PITCH_RAD,
              range,
            },
            {
              durationMs: options.duration,
              onComplete: () => {
                cancelOrbitPreparationAnimation = null;
                options.onCompleted?.();
              },
              onCancel: () => {
                cancelOrbitPreparationAnimation = null;
                options.onCanceled?.();
              },
            }
          );
          return;
        }

        options.onStarted?.();
        activeScene.camera.lookAt(
          orbitCenter,
          new HeadingPitchRange(0, MIN_CESIUM_COMPASS_PITCH_RAD, range)
        );
        activeScene.camera.lookAtTransform(Matrix4.IDENTITY);
        requestCesiumRender(activeScene);
        options.onCompleted?.();
        return;
      }

      options.onStarted?.();
      activeScene.camera.setView({
        destination: activeScene.camera.position,
        orientation: {
          heading: 0,
          pitch: MIN_CESIUM_COMPASS_PITCH_RAD,
          roll: activeScene.camera.roll,
        },
      });
      requestCesiumRender(activeScene);
      options.onCompleted?.();
    });
  };

  const subscribeCompassOrientation = (
    sink: (orientation: NavigationNeedleOrientationDeg) => void
  ) => {
    const activeScene = readCesiumScene(scene);
    if (!activeScene) {
      sink({ headingDeg: 0, pitchDeg: 0 });
      return () => {};
    }

    const sync = () => {
      sink(readCachedCesiumCompassOrientationDeg(activeScene));
    };

    sync();
    return (
      bindCesiumFrameListener(activeScene, sync) ??
      bindCesiumCameraChangedListener(activeScene, sync) ??
      (() => {})
    );
  };

  const subscribeOrbitActive = (sink: NavigationOrbitActiveSink) => {
    sink(isOrbitActive);
    orbitActiveSinks.add(sink);

    return () => {
      orbitActiveSinks.delete(sink);
    };
  };

  return {
    showCompass: true,
    canOrbit: !disabled,
    compassDisabled: disabled,
    compassCursor: disabled
      ? NAVIGATION_COMPASS_CURSORS.DEFAULT
      : NAVIGATION_COMPASS_CURSORS.GRAB,
    maxCompassPitchDeg: MAX_CESIUM_COMPASS_PITCH_DEG,
    setView,
    flyTo,
    zoomIn,
    zoomOut,
    startContinuousZoom,
    stopContinuousZoom,
    goHome,
    orbit,
    beginCompassDrag,
    setCompassBearingPitch,
    endCompassDrag,
    alignNorth,
    alignNorthNadir,
    subscribeCompassOrientation,
    subscribeOrbitActive,
    destroy: () => {
      stopContinuousZoom();
      endCompassDrag();
      const activeScene = readCesiumScene(scene);
      if (activeScene) {
        stopMotion(activeScene);
      }
    },
  };
};
