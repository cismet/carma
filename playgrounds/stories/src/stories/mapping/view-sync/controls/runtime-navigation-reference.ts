import {
  applyCesiumCompassBearingPitch,
  beginCesiumCompassDrag,
  cancelCesiumSceneTravelZoom,
  Cartesian3,
  endCesiumCompassDrag,
  animateCesiumSceneTravelZoom,
  HeadingPitchRange,
  MAX_CESIUM_COMPASS_PITCH_DEG,
  Matrix4,
  MIN_CESIUM_COMPASS_PITCH_RAD,
  PerspectiveFrustum,
  type CesiumCompassDragSession,
} from "@carma/cesium";
import {
  cancelCesiumSceneFovZoom,
  computeNextCesiumFov,
  flyCesiumSceneFovZoom,
  readCachedCesiumCompassOrientationDeg,
  readCachedCesiumSceneCenter,
} from "@carma-mapping/engines/cesium/api";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import {
  createCesiumNavigationMethods,
  DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC,
  DEFAULT_NAVIGATION_HOME_DURATION_MS,
  NAVIGATION_COMPASS_CURSORS,
  NAVIGATION_ORBIT_DIRECTIONS,
  NAVIGATION_ORBIT_TARGETS,
  NAVIGATION_ZOOM_MODES,
  type NavigationMethods,
  type NavigationNeedleOrientationDeg,
  type NavigationOrbitOptions,
  type NavigationOrbitTarget,
  type NavigationTransitionOptions,
  type NavigationZoomOptions,
} from "@carma-mapping/engines-interop/navigation-controls";
import {
  flyViewStateInCesium,
  readFromCesium,
  readCesiumCameraStateFromViewState,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import {
  bindStoryCesiumFrameListener,
  bindStoryCesiumCameraChangedListener,
  readStoryCesiumScene,
  requestStoryCesiumRender,
} from "../../../shared/cesiumRuntimeGuards";
import {
  CARMA_STORY_MAPPING_ENGINES,
  type StoryMappingEngine,
} from "../mappingEngines";
import {
  applyViewStateToCesiumWidget,
  buildLeafletViewFromState,
  buildMapLibreCameraOptionsFromState,
  clamp,
  type SlotRuntimeHandle,
} from "../viewSyncStoryShared";

const MAX_MAPLIBRE_PITCH_DEG = 85;
const CESIUM_FALLBACK_ORBIT_SOURCE_ID = "story-navigation/orbit-fallback";
const ABSOLUTE_MIN_CESIUM_FOV_RAD = degToRadNumeric(0.1)!;
const DEFAULT_MIN_CESIUM_FOV_RAD = degToRadNumeric(2)!;
const DEFAULT_MAX_CESIUM_FOV_RAD = degToRadNumeric(120)!;
const ABSOLUTE_MAX_CESIUM_FOV_RAD = degToRadNumeric(179)!;

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

type NeedleOrientationSink = (
  orientation: NavigationNeedleOrientationDeg
) => void;
type OrbitActiveSink = (active: boolean) => void;
type LeafletMap = Extract<
  SlotRuntimeHandle,
  { engine: typeof CARMA_STORY_MAPPING_ENGINES.LEAFLET }
>["map"];
type MapLibreMap = Extract<
  SlotRuntimeHandle,
  { engine: typeof CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL }
>["map"];
type MapLibreOrbitFrameState = {
  lastBearingDeg: number | null;
  lastFrameTimeMs: number | null;
};

const DEFAULT_ORBIT_PREP_DURATION_MS = 300;
const DEFAULT_ORBIT_SPEED_DEG_PER_SECOND =
  360 / DEFAULT_NAVIGATION_ORBIT_REVOLUTION_DURATION_SEC;
const DEFAULT_MIN_ORBIT_PITCH_DEG = 30;
const ORBIT_PITCH_CORRECTION_DEG_PER_SEC = 60;
const MAPLIBRE_ORBIT_FRAME_STATE = new WeakMap<
  MapLibreMap,
  MapLibreOrbitFrameState
>();

const readLeafletZoomStep = (
  map: LeafletMap,
  requestedZoomDelta?: number
): number => {
  const fallbackStep =
    typeof map.options.zoomDelta === "number" &&
    Number.isFinite(map.options.zoomDelta) &&
    map.options.zoomDelta > 0
      ? map.options.zoomDelta
      : 1;

  if (
    typeof requestedZoomDelta !== "number" ||
    !Number.isFinite(requestedZoomDelta) ||
    requestedZoomDelta <= 0
  ) {
    return fallbackStep;
  }

  return requestedZoomDelta;
};

const snapZoomLevel = (
  zoom: number,
  zoomSnap: number,
  direction: "in" | "out"
): number => {
  const inverseZoomSnap = 1 / zoomSnap;
  return (
    (direction === "in"
      ? Math.ceil(zoom * inverseZoomSnap - 1e-9)
      : Math.floor(zoom * inverseZoomSnap + 1e-10)) / inverseZoomSnap
  );
};

const readLeafletNextZoomLevel = ({
  map,
  direction,
  zoomDelta,
}: {
  map: LeafletMap;
  direction: "in" | "out";
  zoomDelta?: number;
}): number => {
  const currentZoom = map.getZoom();
  const requestedStep = readLeafletZoomStep(map, zoomDelta);
  const unsignedZoomSnap =
    typeof map.options.zoomSnap === "number" &&
    Number.isFinite(map.options.zoomSnap)
      ? Math.abs(map.options.zoomSnap)
      : 0;
  const desiredZoom =
    direction === "in"
      ? currentZoom + requestedStep
      : currentZoom - requestedStep;

  if (unsignedZoomSnap <= 0) {
    return desiredZoom;
  }

  return snapZoomLevel(desiredZoom, unsignedZoomSnap, direction);
};

const readMapLibreZoomStep = (
  map: MapLibreMap,
  requestedZoomDelta?: number
): number => {
  if (
    typeof requestedZoomDelta === "number" &&
    Number.isFinite(requestedZoomDelta) &&
    requestedZoomDelta > 0
  ) {
    return requestedZoomDelta;
  }

  return map.getZoomSnap() > 0 ? map.getZoomSnap() : 1;
};

const readMapLibreNextZoomLevel = ({
  map,
  direction,
  zoomDelta,
}: {
  map: MapLibreMap;
  direction: "in" | "out";
  zoomDelta?: number;
}) => {
  const requestedStep = readMapLibreZoomStep(map, zoomDelta);
  const zoomSnap = map.getZoomSnap();
  const desiredZoom =
    direction === "in"
      ? map.getZoom() + requestedStep
      : map.getZoom() - requestedStep;

  return zoomSnap > 0
    ? snapZoomLevel(desiredZoom, zoomSnap, direction)
    : desiredZoom;
};

const runLeafletZoomLifecycle = (
  map: LeafletMap,
  options: NavigationZoomOptions,
  applyZoom: () => void
) => {
  const animated =
    options.animate !== false &&
    typeof options.duration === "number" &&
    Number.isFinite(options.duration)
      ? options.duration > 0
      : true;

  if (!animated) {
    options.onStarted?.();
    applyZoom();
    options.onCompleted?.();
    return;
  }

  let settled = false;
  const complete = () => {
    if (settled) {
      return;
    }
    settled = true;
    map.off("zoomend", complete);
    options.onCompleted?.();
  };

  map.once("zoomend", complete);
  options.onStarted?.();
  applyZoom();
};

const runMapLibreZoomLifecycle = (
  map: MapLibreMap,
  options: NavigationZoomOptions,
  applyZoom: () => void
) => {
  const animated =
    options.animate !== false &&
    typeof options.duration === "number" &&
    Number.isFinite(options.duration)
      ? options.duration > 0
      : true;

  if (!animated) {
    options.onStarted?.();
    applyZoom();
    options.onCompleted?.();
    return;
  }

  let settled = false;
  const complete = () => {
    if (settled) {
      return;
    }
    settled = true;
    map.off("moveend", complete);
    options.onCompleted?.();
  };

  map.once("moveend", complete);
  options.onStarted?.();
  applyZoom();
};

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
      ABSOLUTE_MIN_CESIUM_FOV_RAD as number,
      ABSOLUTE_MAX_CESIUM_FOV_RAD as number
    ) as Radians,
    maximumFovRad: clamp(
      Math.max(rawMinimumFovRad, rawMaximumFovRad),
      ABSOLUTE_MIN_CESIUM_FOV_RAD as number,
      ABSOLUTE_MAX_CESIUM_FOV_RAD as number
    ) as Radians,
  };
};

const readResolvedCesiumTargetFov = (
  scene: NonNullable<ReturnType<typeof readStoryCesiumScene>>,
  options: NavigationZoomOptions,
  direction: "in" | "out"
) => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const { minimumFovRad, maximumFovRad } = readResolvedCesiumFovBounds(options);

  return computeNextCesiumFov({
    scene,
    direction,
    zoomDelta: options.zoomDelta,
    minimumFovRad,
    maximumFovRad,
  });
};

const createStoryCesiumNavigationMethods = ({
  runtimeHandle,
  homeTarget,
  disabled,
}: {
  runtimeHandle: Extract<
    SlotRuntimeHandle,
    { engine: typeof CARMA_STORY_MAPPING_ENGINES.CESIUM }
  >;
  homeTarget: ViewState;
  disabled: boolean;
}): NavigationMethods<ViewState> => {
  const methods = createCesiumNavigationMethods({
    scene: runtimeHandle.widget,
    homeCameraState: readCesiumCameraStateFromViewState(homeTarget),
    disabled,
    onInteractionStart: () =>
      runtimeHandle.viewSync?.claimControl("user-interaction") ?? true,
  });

  return {
    ...methods,
    setView: (state) => {
      methods.setView(readCesiumCameraStateFromViewState(state));
    },
    flyTo: (state, options) => {
      methods.flyTo(readCesiumCameraStateFromViewState(state), options);
    },
  };
};

export const createRuntimeNavigationReference = ({
  engine,
  runtimeHandle,
  homeTarget,
  disabled = false,
}: {
  engine: StoryMappingEngine;
  runtimeHandle: SlotRuntimeHandle | null;
  homeTarget: ViewState;
  disabled?: boolean;
}): NavigationMethods<ViewState> => {
  if (
    engine === CARMA_STORY_MAPPING_ENGINES.CESIUM &&
    runtimeHandle?.engine === CARMA_STORY_MAPPING_ENGINES.CESIUM
  ) {
    return createStoryCesiumNavigationMethods({
      runtimeHandle,
      homeTarget,
      disabled,
    });
  }

  let cancelContinuousOrbit: (() => void) | null = null;
  let cesiumCompassDragSession: CesiumCompassDragSession | null = null;
  let isOrbitActive = false;
  const orbitActiveSinks = new Set<OrbitActiveSink>();

  const publishOrbitActive = (active: boolean) => {
    if (isOrbitActive === active) {
      return;
    }

    isOrbitActive = active;
    orbitActiveSinks.forEach((sink) => {
      sink(active);
    });
  };

  const stopRuntimeMotion = (
    activeRuntimeHandle: SlotRuntimeHandle,
    { keepSceneZoom = false }: { keepSceneZoom?: boolean } = {}
  ) => {
    cancelContinuousOrbit?.();
    cancelContinuousOrbit = null;
    publishOrbitActive(false);

    if (activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET) {
      if (typeof activeRuntimeHandle.map.stop === "function") {
        activeRuntimeHandle.map.stop();
      }
      return;
    }

    if (
      activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
    ) {
      return;
    }
    cesiumCompassDragSession = null;

    const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
    if (!scene) {
      return;
    }

    cancelCesiumSceneFovZoom(scene);

    if (!keepSceneZoom) {
      cancelCesiumSceneTravelZoom(scene);
    }

    if (typeof scene.camera.cancelFlight === "function") {
      scene.camera.cancelFlight();
    }

    try {
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    } catch {
      // Ignore transient teardown races in Storybook.
    }

    requestStoryCesiumRender(scene);
  };

  const startMapLibreOrbitLoop = (
    activeRuntimeHandle: Extract<
      SlotRuntimeHandle,
      { engine: typeof CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL }
    >,
    options: NavigationOrbitOptions
  ) => {
    const map = activeRuntimeHandle.map;
    if (
      options.target &&
      options.target !== NAVIGATION_ORBIT_TARGETS.CURRENT_VIEW
    ) {
      map.jumpTo({
        center: [options.target.longitudeDeg, options.target.latitudeDeg],
      });
    }

    const speedDegPerSecond = readOrbitSpeedDegPerSecond(options);
    const minPitchDeg =
      typeof options.minPitchDeg === "number" &&
      Number.isFinite(options.minPitchDeg)
        ? clamp(options.minPitchDeg, 0, MAX_MAPLIBRE_PITCH_DEG)
        : 0;

    MAPLIBRE_ORBIT_FRAME_STATE.set(map, {
      lastBearingDeg: map.getBearing(),
      lastFrameTimeMs: null,
    });

    const step = () => {
      if (!isOrbitActive) {
        MAPLIBRE_ORBIT_FRAME_STATE.delete(map);
        cancelContinuousOrbit = null;
        return;
      }

      const orbitState = MAPLIBRE_ORBIT_FRAME_STATE.get(map);
      if (!orbitState) {
        cancelContinuousOrbit = null;
        return;
      }

      const now = performance.now();
      const deltaSeconds =
        orbitState.lastFrameTimeMs === null
          ? 0
          : (now - orbitState.lastFrameTimeMs) / 1000;
      orbitState.lastFrameTimeMs = now;

      const nextBearingDeg = map.getBearing() - speedDegPerSecond * deltaSeconds;
      orbitState.lastBearingDeg = nextBearingDeg;
      // Write directly to the transform to avoid jumpTo→stop() canceling drags.
      map.transform.setBearing(nextBearingDeg);

      // Parallel pitch correction toward minPitchDeg.
      if (minPitchDeg > 0 && deltaSeconds > 0) {
        const currentPitch = map.getPitch();
        if (currentPitch < minPitchDeg) {
          const pitchStep = ORBIT_PITCH_CORRECTION_DEG_PER_SEC * deltaSeconds;
          map.transform.setPitch(Math.min(currentPitch + pitchStep, minPitchDeg));
        }
      }

      // Fire move/rotate so compass and orbit icon subscribers receive bearing updates.
      map.fire('move');
      map.fire('rotate');
      map.triggerRepaint();
    };

    map.on("render", step);
    map.triggerRepaint();

    cancelContinuousOrbit = () => {
      map.off("render", step);
      MAPLIBRE_ORBIT_FRAME_STATE.delete(map);
      cancelContinuousOrbit = null;
    };
  };

  const applySetView = (
    activeRuntimeHandle: SlotRuntimeHandle,
    state: ViewState
  ) => {
    if (activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET) {
      const nextView = buildLeafletViewFromState(
        state,
        activeRuntimeHandle.container.clientWidth,
        activeRuntimeHandle.container.clientHeight
      );
      if (!nextView) {
        return;
      }

      activeRuntimeHandle.map.setView(nextView.center, nextView.zoom);
      return;
    }

    if (
      activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
    ) {
      const nextCamera = buildMapLibreCameraOptionsFromState(
        state,
        activeRuntimeHandle.container.clientWidth,
        activeRuntimeHandle.container.clientHeight
      );
      if (!nextCamera) {
        return;
      }

      activeRuntimeHandle.map.jumpTo(nextCamera);
      return;
    }

    applyViewStateToCesiumWidget({
      widget: activeRuntimeHandle.widget,
      state,
    });
  };

  const applyFlyTo = (
    activeRuntimeHandle: SlotRuntimeHandle,
    state: ViewState,
    options: NavigationTransitionOptions = {}
  ) => {
    const durationMs = options.duration;
    if (
      typeof durationMs !== "number" ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0
    ) {
      applySetView(activeRuntimeHandle, state);
      return;
    }

    if (activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET) {
      const nextView = buildLeafletViewFromState(
        state,
        activeRuntimeHandle.container.clientWidth,
        activeRuntimeHandle.container.clientHeight
      );
      if (!nextView) {
        return;
      }

      activeRuntimeHandle.map.flyTo(nextView.center, nextView.zoom, {
        duration: durationMs / 1000,
      });
      return;
    }

    if (
      activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
    ) {
      const nextCamera = buildMapLibreCameraOptionsFromState(
        state,
        activeRuntimeHandle.container.clientWidth,
        activeRuntimeHandle.container.clientHeight
      );
      if (!nextCamera) {
        return;
      }

      activeRuntimeHandle.map.easeTo({
        ...nextCamera,
        duration: durationMs,
      });
      return;
    }

    const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
    if (!scene) {
      return;
    }

    flyViewStateInCesium(scene, state, {
      duration: readTransitionDurationSeconds(durationMs),
    });
  };

  const runWithInteraction = (
    action: (activeRuntimeHandle: SlotRuntimeHandle) => void,
    {
      stopMotion = true,
      keepSceneZoom = false,
    }: { stopMotion?: boolean; keepSceneZoom?: boolean } = {}
  ) => {
    if (disabled || !runtimeHandle) {
      return false;
    }

    if (
      runtimeHandle.viewSync &&
      !runtimeHandle.viewSync.claimControl("user-interaction")
    ) {
      return false;
    }

    if (stopMotion) {
      stopRuntimeMotion(runtimeHandle, { keepSceneZoom });
    }
    action(runtimeHandle);
    return true;
  };

  const setView = (state: ViewState) => {
    runWithInteraction((activeRuntimeHandle) => {
      applySetView(activeRuntimeHandle, state);
    });
  };

  const flyTo = (
    state: ViewState,
    options: NavigationTransitionOptions = {}
  ) => {
    runWithInteraction((activeRuntimeHandle) => {
      applyFlyTo(activeRuntimeHandle, state, options);
    });
  };

  const zoomIn = (options: NavigationZoomOptions = {}) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;
    runWithInteraction(
      (activeRuntimeHandle) => {
        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
        ) {
          const nextZoom = readLeafletNextZoomLevel({
            map: activeRuntimeHandle.map,
            direction: "in",
            zoomDelta: options.zoomDelta,
          });
          runLeafletZoomLifecycle(activeRuntimeHandle.map, options, () => {
            activeRuntimeHandle.map.setZoom(nextZoom, {
              animate:
                typeof options.duration === "number"
                  ? options.duration > 0
                  : undefined,
            });
          });
          return;
        }

        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
        ) {
          const nextZoom = readMapLibreNextZoomLevel({
            map: activeRuntimeHandle.map,
            direction: "in",
            zoomDelta: options.zoomDelta,
          });
          runMapLibreZoomLifecycle(activeRuntimeHandle.map, options, () => {
            if (
              typeof options.duration === "number" &&
              Number.isFinite(options.duration) &&
              options.duration <= 0
            ) {
              activeRuntimeHandle.map.jumpTo({
                zoom: nextZoom,
              });
              return;
            }

            activeRuntimeHandle.map.easeTo({
              zoom: nextZoom,
              duration: options.duration ?? 250,
            });
          });
          return;
        }

        const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
        if (!scene) {
          return;
        }

        if (isFovMode || isDollyMode) {
          if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }

          const { minimumFovRad, maximumFovRad } =
            readResolvedCesiumFovBounds(options);

          if (isDollyMode) {
            const nextFov = readResolvedCesiumTargetFov(scene, options, "in");
            if (nextFov === null) {
              return;
            }
            animateCesiumSceneTravelZoom(scene, {
              direction: "in",
              durationMs: readZoomDurationMs(options) ?? 500,
              zoomDelta: options.zoomDelta,
              synchronizedFovTargetRad: nextFov,
              onStarted: options.onStarted,
              onCompleted: options.onCompleted,
              onCanceled: options.onCanceled,
            });
            return;
          }

          flyCesiumSceneFovZoom(scene, {
            direction: "in",
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

        animateCesiumSceneTravelZoom(scene, {
          direction: "in",
          durationMs: readZoomDurationMs(options) ?? 500,
          zoomDelta: options.zoomDelta,
          onStarted: options.onStarted,
          onCompleted: options.onCompleted,
          onCanceled: options.onCanceled,
        });
        requestStoryCesiumRender(scene);
      },
      { keepSceneZoom: !(isFovMode || isDollyMode) }
    );
  };

  const zoomOut = (options: NavigationZoomOptions = {}) => {
    const isFovMode = options.mode === NAVIGATION_ZOOM_MODES.FOV;
    const isDollyMode = options.mode === NAVIGATION_ZOOM_MODES.DOLLY;
    runWithInteraction(
      (activeRuntimeHandle) => {
        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
        ) {
          const nextZoom = readLeafletNextZoomLevel({
            map: activeRuntimeHandle.map,
            direction: "out",
            zoomDelta: options.zoomDelta,
          });
          runLeafletZoomLifecycle(activeRuntimeHandle.map, options, () => {
            activeRuntimeHandle.map.setZoom(nextZoom, {
              animate:
                typeof options.duration === "number"
                  ? options.duration > 0
                  : undefined,
            });
          });
          return;
        }

        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
        ) {
          const nextZoom = readMapLibreNextZoomLevel({
            map: activeRuntimeHandle.map,
            direction: "out",
            zoomDelta: options.zoomDelta,
          });
          runMapLibreZoomLifecycle(activeRuntimeHandle.map, options, () => {
            if (
              typeof options.duration === "number" &&
              Number.isFinite(options.duration) &&
              options.duration <= 0
            ) {
              activeRuntimeHandle.map.jumpTo({
                zoom: nextZoom,
              });
              return;
            }

            activeRuntimeHandle.map.easeTo({
              zoom: nextZoom,
              duration: options.duration ?? 250,
            });
          });
          return;
        }

        const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
        if (!scene) {
          return;
        }

        if (isFovMode || isDollyMode) {
          if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }

          const { minimumFovRad, maximumFovRad } =
            readResolvedCesiumFovBounds(options);

          if (isDollyMode) {
            const nextFov = readResolvedCesiumTargetFov(scene, options, "out");
            if (nextFov === null) {
              return;
            }
            animateCesiumSceneTravelZoom(scene, {
              direction: "out",
              durationMs: readZoomDurationMs(options) ?? 500,
              zoomDelta: options.zoomDelta,
              synchronizedFovTargetRad: nextFov,
              onStarted: options.onStarted,
              onCompleted: options.onCompleted,
              onCanceled: options.onCanceled,
            });
            return;
          }

          flyCesiumSceneFovZoom(scene, {
            direction: "out",
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

        animateCesiumSceneTravelZoom(scene, {
          direction: "out",
          durationMs: readZoomDurationMs(options) ?? 500,
          zoomDelta: options.zoomDelta,
          onStarted: options.onStarted,
          onCompleted: options.onCompleted,
          onCanceled: options.onCanceled,
        });
        requestStoryCesiumRender(scene);
      },
      { keepSceneZoom: !(isFovMode || isDollyMode) }
    );
  };

  const goHome = (options: NavigationTransitionOptions = {}) => {
    const durationMs = readHomeDurationMs(options);
    if (durationMs > 0) {
      flyTo(homeTarget, {
        ...options,
        duration: durationMs as NavigationTransitionOptions["duration"],
      });
      return;
    }

    setView(homeTarget);
  };

  const orbit = (options: NavigationOrbitOptions = {}) => {
    runWithInteraction(
      (activeRuntimeHandle) => {
        if (isOrbitActive) {
          stopRuntimeMotion(activeRuntimeHandle);
          return;
        }

        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
        ) {
          return;
        }

        publishOrbitActive(true);

        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
        ) {
          startMapLibreOrbitLoop(activeRuntimeHandle, options);
          return;
        }

        // Cesium orbit is handled by CesiumSceneOrbitController in the component.
      },
      { stopMotion: false }
    );
  };

  const beginCompassDrag = () => {
    runWithInteraction((activeRuntimeHandle) => {
      if (activeRuntimeHandle.engine !== CARMA_STORY_MAPPING_ENGINES.CESIUM) {
        return;
      }

      const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
      if (!scene) {
        return;
      }

      cesiumCompassDragSession = beginCesiumCompassDrag(scene);
    });
  };

  const setCompassBearingPitch = (
    orientation: NavigationNeedleOrientationDeg
  ) => {
    runWithInteraction(
      (activeRuntimeHandle) => {
        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
        ) {
          return;
        }

        if (
          activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
        ) {
          activeRuntimeHandle.map.jumpTo({
            bearing: orientation.headingDeg,
            pitch: clamp(orientation.pitchDeg, 0, MAX_MAPLIBRE_PITCH_DEG),
          });
          return;
        }

        const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
        if (!scene) {
          return;
        }

        const dragSession =
          cesiumCompassDragSession ?? beginCesiumCompassDrag(scene);
        cesiumCompassDragSession = dragSession;

        applyCesiumCompassBearingPitch(scene, dragSession, orientation, {
          maxPitchDeg: MAX_CESIUM_COMPASS_PITCH_DEG,
        });
      },
      { stopMotion: false }
    );
  };

  const endCompassDrag = () => {
    if (runtimeHandle?.engine !== CARMA_STORY_MAPPING_ENGINES.CESIUM) {
      cesiumCompassDragSession = null;
      return;
    }

    const scene = readStoryCesiumScene(runtimeHandle.widget);
    if (!scene) {
      cesiumCompassDragSession = null;
      return;
    }

    endCesiumCompassDrag(scene);
    cesiumCompassDragSession = null;
  };

  const alignNorth = (options: NavigationTransitionOptions = {}) => {
    runWithInteraction((activeRuntimeHandle) => {
      if (
        activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
      ) {
        activeRuntimeHandle.map.easeTo({
          bearing: 0,
          duration: options.duration ?? 250,
        });
        return;
      }

      if (activeRuntimeHandle.engine !== CARMA_STORY_MAPPING_ENGINES.CESIUM) {
        return;
      }

      const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
      if (!scene) {
        return;
      }

      const orbitCenter = readCachedCesiumSceneCenter(scene);
      if (orbitCenter) {
        const range = Cartesian3.distance(orbitCenter, scene.camera.positionWC);
        scene.camera.lookAt(
          orbitCenter,
          new HeadingPitchRange(0, scene.camera.pitch, range)
        );
        scene.camera.lookAtTransform(Matrix4.IDENTITY);
        requestStoryCesiumRender(scene);
        return;
      }

      scene.camera.setView({
        destination: scene.camera.position,
        orientation: {
          heading: 0,
          pitch: scene.camera.pitch,
          roll: scene.camera.roll,
        },
      });
      requestStoryCesiumRender(scene);
    });
  };

  const alignNorthNadir = (options: NavigationTransitionOptions = {}) => {
    runWithInteraction((activeRuntimeHandle) => {
      if (
        activeRuntimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL
      ) {
        activeRuntimeHandle.map.easeTo({
          bearing: 0,
          pitch: 0,
          duration: options.duration ?? 300,
        });
        return;
      }

      if (activeRuntimeHandle.engine !== CARMA_STORY_MAPPING_ENGINES.CESIUM) {
        return;
      }

      const scene = readStoryCesiumScene(activeRuntimeHandle.widget);
      if (!scene) {
        return;
      }

      const orbitCenter = readCachedCesiumSceneCenter(scene);
      if (orbitCenter) {
        const range = Cartesian3.distance(orbitCenter, scene.camera.positionWC);
        scene.camera.lookAt(
          orbitCenter,
          new HeadingPitchRange(0, MIN_CESIUM_COMPASS_PITCH_RAD, range)
        );
        scene.camera.lookAtTransform(Matrix4.IDENTITY);
        requestStoryCesiumRender(scene);
        return;
      }

      scene.camera.setView({
        destination: scene.camera.position,
        orientation: {
          heading: 0,
          pitch: MIN_CESIUM_COMPASS_PITCH_RAD,
          roll: scene.camera.roll,
        },
      });
      requestStoryCesiumRender(scene);
    });
  };

  const subscribeCompassOrientation = (sink: NeedleOrientationSink) => {
    if (
      !runtimeHandle ||
      runtimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
    ) {
      sink({ headingDeg: 0, pitchDeg: 0 });
      return () => {};
    }

    if (runtimeHandle.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL) {
      const sync = () => {
        sink({
          headingDeg: runtimeHandle.map.getBearing(),
          pitchDeg: runtimeHandle.map.getPitch(),
        });
      };

      sync();
      runtimeHandle.map.on("move", sync);
      runtimeHandle.map.on("rotate", sync);
      runtimeHandle.map.on("pitch", sync);

      return () => {
        runtimeHandle.map.off("move", sync);
        runtimeHandle.map.off("rotate", sync);
        runtimeHandle.map.off("pitch", sync);
      };
    }

    const scene = readStoryCesiumScene(runtimeHandle.widget);
    if (!scene) {
      sink({ headingDeg: 0, pitchDeg: 0 });
      return () => {};
    }

    const sync = () => {
      sink(readCachedCesiumCompassOrientationDeg(scene));
    };

    sync();
    return (
      bindStoryCesiumFrameListener(scene, sync) ??
      bindStoryCesiumCameraChangedListener(scene, sync) ??
      bindStoryCesiumCameraChangedListener(runtimeHandle.widget, sync) ??
      (() => {})
    );
  };

  const subscribeOrbitActive = (sink: OrbitActiveSink) => {
    sink(isOrbitActive);
    orbitActiveSinks.add(sink);

    return () => {
      orbitActiveSinks.delete(sink);
    };
  };

  return {
    showCompass: true,
    canOrbit:
      !disabled &&
      !!runtimeHandle &&
      engine !== CARMA_STORY_MAPPING_ENGINES.LEAFLET,
    compassDisabled:
      disabled ||
      !runtimeHandle ||
      engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET,
    compassCursor:
      disabled ||
      !runtimeHandle ||
      engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
        ? NAVIGATION_COMPASS_CURSORS.DEFAULT
        : NAVIGATION_COMPASS_CURSORS.GRAB,
    setView,
    flyTo,
    zoomIn,
    zoomOut,
    goHome,
    orbit,
    maxCompassPitchDeg: MAX_CESIUM_COMPASS_PITCH_DEG,
    beginCompassDrag,
    setCompassBearingPitch,
    endCompassDrag,
    alignNorth,
    alignNorthNadir,
    subscribeCompassOrientation,
    subscribeOrbitActive,
    destroy: () => {
      endCompassDrag();
      if (runtimeHandle) {
        stopRuntimeMotion(runtimeHandle);
      }
    },
  };
};
