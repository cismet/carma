import {
  applyCesiumCompassBearingPitch,
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
import {
  bindCesiumCameraChangedListener,
  bindCesiumFrameListener,
  cancelCesiumSceneFovZoom,
  computeNextCesiumFov,
  flyCesiumSceneFovZoom,
  readCachedCesiumCompassOrientationDeg,
  readCachedCesiumSceneCenter,
  readCesiumScene,
  requestCesiumRender,
  type CameraStateRecord,
  type CesiumSceneTarget,
} from "@carma-mapping/engines/cesium/api";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import {
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  DEFAULT_NAVIGATION_HOME_DURATION_MS,
  NAVIGATION_COMPASS_CURSORS,
  NAVIGATION_ORBIT_DIRECTIONS,
  NAVIGATION_ORBIT_TARGETS,
  NAVIGATION_ZOOM_MODES,
  type NavigationMethods,
  type NavigationNeedleOrientationDeg,
  type NavigationOrbitActiveSink,
  type NavigationOrbitOptions,
  type NavigationOrbitTarget,
  type NavigationTransitionOptions,
  type NavigationZoomOptions,
} from "../../contracts";

const ZERO_RADIANS = degToRadNumeric(0)! as Radians;
const MIN_CESIUM_FOV_RAD = degToRadNumeric(5)! as Radians;
const MAX_CESIUM_FOV_RAD = degToRadNumeric(120)! as Radians;
const DEFAULT_ORBIT_PREP_DURATION_MS = 300;
const DEFAULT_ORBIT_SPEED_DEG_PER_SECOND =
  360 / DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC;
const DEFAULT_MIN_ORBIT_PITCH_DEG = 30;

const readDurationSeconds = (durationMs?: number): number | undefined => {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return undefined;
  }

  return durationMs / 1000;
};

const readHomeDurationMs = (options: NavigationTransitionOptions): number =>
  typeof options.durationMs === "number" &&
  Number.isFinite(options.durationMs) &&
  options.durationMs >= 0
    ? options.durationMs
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
  typeof options.durationMs === "number" &&
  Number.isFinite(options.durationMs) &&
  options.durationMs > 0
    ? options.durationMs
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

const readResolvedCesiumTargetFov = (
  activeScene: Scene,
  options: NavigationZoomOptions,
  direction: "in" | "out"
) => {
  if (!(activeScene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  if (
    typeof options.targetFovRad === "number" &&
    Number.isFinite(options.targetFovRad)
  ) {
    return clamp(options.targetFovRad, MIN_CESIUM_FOV_RAD, MAX_CESIUM_FOV_RAD);
  }

  return computeNextCesiumFov({
    scene: activeScene,
    direction,
    zoomDelta: options.zoomDelta,
    minimumFovRad: MIN_CESIUM_FOV_RAD,
    maximumFovRad: MAX_CESIUM_FOV_RAD,
  });
};

type CreateCesiumNavigationMethodsOptions = {
  scene: CesiumSceneTarget;
  homeCameraState?: CameraStateRecord | null;
  disabled?: boolean;
  onInteractionStart?: () => boolean | void;
};

export const createCesiumNavigationMethods = ({
  scene,
  homeCameraState = null,
  disabled = false,
  onInteractionStart,
}: CreateCesiumNavigationMethodsOptions): NavigationMethods<CameraStateRecord> => {
  let cancelOrbitPreparationAnimation: (() => void) | null = null;
  let cancelContinuousOrbit: (() => void) | null = null;
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

  const flyTo = (
    state: CameraStateRecord,
    options: NavigationTransitionOptions = {}
  ) => {
    runWithScene((activeScene) => {
      if (
        typeof options.durationMs !== "number" ||
        !Number.isFinite(options.durationMs) ||
        options.durationMs <= 0
      ) {
        setViewFromCameraState(activeScene.camera, state);
        requestCesiumRender(activeScene);
        return;
      }

      flyToCameraState(activeScene, state, {
        duration: readDurationSeconds(options.durationMs),
        applyFov: true,
      });
    });
  };

  const zoomIn = (options: NavigationZoomOptions = {}) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;
    runWithScene(
      (activeScene) => {
        if (isFovMode || isDollyMode) {
          if (!(activeScene.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }

          if (isDollyMode) {
            const nextFov = readResolvedCesiumTargetFov(
              activeScene,
              options,
              "in"
            );
            if (nextFov === null) {
              return;
            }
            animateCesiumSceneTravelZoom(activeScene, {
              direction: "in",
              durationSeconds: readDurationSeconds(options.durationMs) ?? 0.5,
              zoomDelta: options.zoomDelta,
              synchronizedFovTargetRad: nextFov,
            });
            return;
          }

          flyCesiumSceneFovZoom(activeScene, {
            direction: "in",
            durationSeconds: readDurationSeconds(options.durationMs) ?? 0.25,
            zoomDelta: options.zoomDelta,
            targetFovRad: options.targetFovRad,
            minimumFovRad: MIN_CESIUM_FOV_RAD,
            maximumFovRad: MAX_CESIUM_FOV_RAD,
          });
          return;
        }

        animateCesiumSceneTravelZoom(activeScene, {
          direction: "in",
          durationSeconds: readDurationSeconds(options.durationMs) ?? 0.5,
          zoomDelta: options.zoomDelta,
        });
      },
      { keepSceneZoom: !(isFovMode || isDollyMode) }
    );
  };

  const zoomOut = (options: NavigationZoomOptions = {}) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;
    runWithScene(
      (activeScene) => {
        if (isFovMode || isDollyMode) {
          if (!(activeScene.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }

          if (isDollyMode) {
            const nextFov = readResolvedCesiumTargetFov(
              activeScene,
              options,
              "out"
            );
            if (nextFov === null) {
              return;
            }
            animateCesiumSceneTravelZoom(activeScene, {
              direction: "out",
              durationSeconds: readDurationSeconds(options.durationMs) ?? 0.5,
              zoomDelta: options.zoomDelta,
              synchronizedFovTargetRad: nextFov,
            });
            return;
          }

          flyCesiumSceneFovZoom(activeScene, {
            direction: "out",
            durationSeconds: readDurationSeconds(options.durationMs) ?? 0.25,
            zoomDelta: options.zoomDelta,
            targetFovRad: options.targetFovRad,
            minimumFovRad: MIN_CESIUM_FOV_RAD,
            maximumFovRad: MAX_CESIUM_FOV_RAD,
          });
          return;
        }

        animateCesiumSceneTravelZoom(activeScene, {
          direction: "out",
          durationSeconds: readDurationSeconds(options.durationMs) ?? 0.5,
          zoomDelta: options.zoomDelta,
        });
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
        durationMs,
      });
      return;
    }

    setView(homeCameraState);
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
        };

        if (currentPitchDeg < minimumPitchDeg) {
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
              },
            }
          );
          return;
        }

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
          typeof options.durationMs === "number" &&
          Number.isFinite(options.durationMs) &&
          options.durationMs > 0
        ) {
          cancelOrbitPreparationAnimation = animateOrbitHeadingPitchRange(
            activeScene,
            orbitCenter,
            {
              heading: ZERO_RADIANS,
              pitch: activeScene.camera.pitch as Radians,
              range,
            },
            {
              durationMs: options.durationMs,
              onComplete: () => {
                cancelOrbitPreparationAnimation = null;
              },
              onCancel: () => {
                cancelOrbitPreparationAnimation = null;
              },
            }
          );
          return;
        }

        activeScene.camera.lookAt(
          orbitCenter,
          new HeadingPitchRange(0, activeScene.camera.pitch, range)
        );
        activeScene.camera.lookAtTransform(Matrix4.IDENTITY);
        requestCesiumRender(activeScene);
        return;
      }

      activeScene.camera.setView({
        destination: activeScene.camera.position,
        orientation: {
          heading: 0,
          pitch: activeScene.camera.pitch,
          roll: activeScene.camera.roll,
        },
      });
      requestCesiumRender(activeScene);
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
          typeof options.durationMs === "number" &&
          Number.isFinite(options.durationMs) &&
          options.durationMs > 0
        ) {
          cancelOrbitPreparationAnimation = animateOrbitHeadingPitchRange(
            activeScene,
            orbitCenter,
            {
              heading: ZERO_RADIANS,
              pitch: MIN_CESIUM_COMPASS_PITCH_RAD,
              range,
            },
            {
              durationMs: options.durationMs,
              onComplete: () => {
                cancelOrbitPreparationAnimation = null;
              },
              onCancel: () => {
                cancelOrbitPreparationAnimation = null;
              },
            }
          );
          return;
        }

        activeScene.camera.lookAt(
          orbitCenter,
          new HeadingPitchRange(0, MIN_CESIUM_COMPASS_PITCH_RAD, range)
        );
        activeScene.camera.lookAtTransform(Matrix4.IDENTITY);
        requestCesiumRender(activeScene);
        return;
      }

      activeScene.camera.setView({
        destination: activeScene.camera.position,
        orientation: {
          heading: 0,
          pitch: MIN_CESIUM_COMPASS_PITCH_RAD,
          roll: activeScene.camera.roll,
        },
      });
      requestCesiumRender(activeScene);
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
      endCompassDrag();
      const activeScene = readCesiumScene(scene);
      if (activeScene) {
        stopMotion(activeScene);
      }
    },
  };
};
