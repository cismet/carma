import { MutableRefObject, useContext, useEffect, useState } from "react";
import { useDispatch } from "react-redux";

import { Cartesian3, Cartographic, defined, HeadingPitchRange } from "cesium";
import type { Map as LeafletMap } from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  normalizeOptions,
  isZoom,
  waitForAnimationFrames,
} from "@carma-commons/utils";
import { promiseWithTimeout } from "@carma-commons/utils/promise";
import { LeafletMapEventNames } from "@carma-mapping/engines/leaflet";

import { useCesiumContext } from "./useCesiumContext";
import { setIsMode2d } from "../slices/cesium";

import { animateInterpolateHeadingPitchRange } from "../utils/cesiumAnimations";
import {
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
} from "../utils/cesiumHelpers";
import { getTiledMapCenterZoomEquivalent } from "../utils/getTiledMapCenterZoomEquivalent";
import { tiledMapToCesium } from "../utils/tiledMapToCesium";
import { pickSceneCenter } from "../utils/pickers";
import { cesiumCenterPixelSizeToLeafletZoom } from "../utils/pixels";
import { isValidScene } from "../utils/instanceGates";

const To2d = {
  preTransitionTo2d: "preTransitionTo2d",
  transitionTo2d: "transitionTo2d",
  postTransitionTo2d: "postTransitionTo2d",
} as const;

const To3d = {
  preTransitionTo3d: "preTransitionTo3d",
  transitionTo3d: "transitionTo3d",
  postTransitionTo3d: "postTransitionTo3d",
} as const;

export const MapTransitionState = {
  ...To2d,
  ...To3d,
} as const;

export type MapTransitionStateType = typeof MapTransitionState;

export const MapMode = {
  mode2d: "mode2d",
  mode3d: "mode3d",
} as const;

export const MapState = {
  uninitialized: "uninitialized",
  ...MapMode,
  ...MapTransitionState,
} as const;

export type MapStateType = typeof MapState;

export const isTransitionTo2dState = (
  state: unknown
): state is keyof typeof To2d => {
  return Object.values(To2d).includes(state as keyof typeof To2d);
};

export const isTransitionTo3dState = (
  state: unknown
): state is keyof typeof To3d => {
  return Object.values(To3d).includes(state as keyof typeof To3d);
};

export const isTransitionState = (
  state: unknown
): state is keyof MapTransitionStateType => {
  return isTransitionTo2dState(state) || isTransitionTo3dState(state);
};

export const shouldBlockUserInput = (state: unknown): boolean => {
  // Post-transition states should NOT block user input
  if (
    state === MapTransitionState.postTransitionTo3d ||
    state === MapTransitionState.postTransitionTo2d
  ) {
    return false;
  }
  // All other transition states should block
  return isTransitionState(state);
};

type TransitionLifecycleHandler = () => Promise<void>;

export type MapTransitionLifecycle = {
  [K in keyof MapTransitionStateType]: Set<TransitionLifecycleHandler>;
};

export const createTransitionLifecycle = (): MapTransitionLifecycle => ({
  [MapTransitionState.preTransitionTo2d]: new Set(),
  [MapTransitionState.transitionTo2d]: new Set(),
  [MapTransitionState.postTransitionTo2d]: new Set(),
  [MapTransitionState.preTransitionTo3d]: new Set(),
  [MapTransitionState.transitionTo3d]: new Set(),
  [MapTransitionState.postTransitionTo3d]: new Set(),
});

export const addMapTransitionLifecycleHandler = (
  lifecycleRef: MutableRefObject<MapTransitionLifecycle>,
  phase: keyof MapTransitionStateType,
  handler: TransitionLifecycleHandler
) => {
  const handlers = lifecycleRef.current[phase];
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const runTransitionLifecycleHandlers = async (
  lifecycleRef: MutableRefObject<MapTransitionLifecycle>,
  phase: keyof MapTransitionStateType
) => {
  const handlers = lifecycleRef.current[phase];
  for (const handler of handlers) {
    await handler();
  }
};

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  duration?: number; // milliseconds
  maxZoom?: number; // max zoom level to transition from 2D to 3D
  zoomOutDuration?: number; // milliseconds
  zoomOutEaseLinearity?: number; // 0 to 1
  zoomOutTimeoutBuffer?: number; // milliseconds
};

const noop = () => {};
const noAnimation = {
  animate: false,
  duration: 0,
};

const defaultTransitionOptions: Required<TransitionOptions> = {
  onComplete: noop,
  onCancel: noop,
  duration: 1000,
  maxZoom: 20,
  zoomOutDuration: 700,
  zoomOutEaseLinearity: 0.75,
  zoomOutTimeoutBuffer: 100,
};

export const useMapTransition = (options: TransitionOptions = {}) => {
  const {
    duration,
    onComplete,
    onCancel,
    maxZoom,
    zoomOutEaseLinearity,
    zoomOutDuration,
    zoomOutTimeoutBuffer,
  } = normalizeOptions(options, defaultTransitionOptions);

  const dispatch = useDispatch();
  const topicMapContext = useContext<typeof TopicMapContext>(TopicMapContext);
  const { realRoutedMapRef: routedMapRef } = topicMapContext;
  const cesiumContext = useCesiumContext();
  // TODO: move transition state int own context below all involved map frameworks,
  // TODO: move transition options to cesium context or own context
  // potentially enable transitions between more map frameworks like maplibre and threejs
  // and have transition as own monorepo project and standalone package possibly
  const {
    withCamera,
    transitionStateRef,
    transitionLifecycleRef,
    sceneRef,
    withElevationProviders,
    viewerRef,
    isViewerReady,
  } = cesiumContext;

  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);
  const [resolutionScale, setResolutionScale] = useState<number | null>(null);

  useEffect(() => {
    if (isViewerReady && viewerRef.current) {
      setResolutionScale(viewerRef.current.resolutionScale);
    }
  }, [isViewerReady, viewerRef]);

  const prepareLeafletForTransition = async (
    leaflet: LeafletMap | null | undefined
  ) => {
    if (!leaflet) {
      return;
    }

    const cleanups: Array<() => void> = [];

    const zoom = leaflet.getZoom();
    const shouldZoomOut = isZoom(zoom) && zoom > maxZoom;

    let moveEndPromise: Promise<void> | undefined;

    if (shouldZoomOut) {
      moveEndPromise = new Promise<void>((resolve) => {
        const handle = () => {
          leaflet.off(LeafletMapEventNames.zoomend, handle);
          resolve();
        };
        cleanups.push(() => leaflet.off(LeafletMapEventNames.zoomend, handle));
        leaflet.once(LeafletMapEventNames.zoomend, handle);
      });
    }

    leaflet.stop();

    try {
      if (shouldZoomOut && Number.isFinite(maxZoom)) {
        const durationMs = Math.max(0, zoomOutDuration);
        const durationSeconds = durationMs / 1000;
        leaflet.flyTo(leaflet.getCenter(), maxZoom, {
          duration: durationSeconds,
          animate: durationSeconds > 0,
          easeLinearity: zoomOutEaseLinearity,
        });
      }

      if (moveEndPromise) {
        const timeoutMs =
          Math.max(0, zoomOutDuration) + Math.max(0, zoomOutTimeoutBuffer);
        await promiseWithTimeout(moveEndPromise, timeoutMs);
      }
    } finally {
      cleanups.forEach((cleanup) => cleanup());
    }
  };

  const transitionToMode3d = async () => {
    console.debug("[CESIUM|2D3D|TO3D] transitionToMode3d called", {
      sceneValid: isValidScene(sceneRef.current),
      routedMapRef: !!routedMapRef.current,
      leafletMap: !!routedMapRef.current?.leafletMap,
      leafletElement: !!routedMapRef.current?.leafletMap?.leafletElement,
      resolutionScale,
    });

    const scene = sceneRef.current;
    if (
      !isValidScene(scene) ||
      !routedMapRef.current?.leafletMap?.leafletElement
    ) {
      console.warn("[CESIUM|2D3D|TO3D] cesium or leaflet not available", {
        sceneValid: isValidScene(scene),
        routedMapRef: !!routedMapRef.current,
        leafletMap: !!routedMapRef.current?.leafletMap,
        leafletElement: !!routedMapRef.current?.leafletMap?.leafletElement,
      });
      onCancel?.(false);
      return;
    }

    if (!Number.isFinite(resolutionScale) || resolutionScale === null) {
      console.warn("[CESIUM|2D3D|TO3D] resolution scale not available", {
        resolutionScale,
      });
      onCancel?.(false);
      return;
    }
    transitionStateRef.current = MapTransitionState.preTransitionTo3d;

    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    await prepareLeafletForTransition(leaflet);
    // cancel any ongoing flight
    withCamera((camera) => camera.cancelFlight());

    const onComplete3d = () => {
      console.debug("[CESIUM|2D3D|TO3D] onComplete3d - setting mode to mode3d");
      transitionStateRef.current = MapState.mode3d;
      onComplete?.(false);
    };

    const onCancelAnimation3d = () => {
      console.debug(
        "[CESIUM|2D3D|TO3D] animation cancelled by user - setting mode to mode3d"
      );
      transitionStateRef.current = MapState.mode3d;
      // this is only about the animation not a cancelled transition
      onComplete?.(false);
    };

    const animateCesiumView = () => {
      const scene = sceneRef.current;
      if (!scene) {
        console.warn(
          "[CESIUM|2D3D|TO3D] scene not available for animation, completing transition anyway"
        );
        onComplete3d();
        return;
      }

      const pos = pickSceneCenter(scene).scenePosition;

      if (pos && prevHPR) {
        console.debug(
          "[CESIUM|2D3D|TO3D] restore 3d camera position zoom",
          pos,
          prevHPR
        );
        animateInterpolateHeadingPitchRange(scene, pos, prevHPR, {
          delay: duration, // allow the css transition to finish
          duration: prevDuration * 1000,
          useCurrentDistance: true,
          cancelable: true, // Allow user to cancel post-transition animation
          onComplete: onComplete3d,
          onCancel: onCancelAnimation3d, // Just clear transition state, don't jump
        });
      } else {
        console.debug(
          "[CESIUM|2D3D|TO3D] to change to 3d camera position applied zoom",
          pos,
          prevHPR
        );
        onComplete3d();
        return;
      }
    };

    const { lat: latitude, lng: longitude } = leaflet.getCenter();
    const zoom = leaflet.getZoom();

    if (!Number.isFinite(resolutionScale) || resolutionScale === null) {
      console.warn("resolution scale not available");
      onCancel(false);
      return;
    }

    transitionStateRef.current = MapTransitionState.transitionTo3d;

    let transitionCompleted = false;

    await tiledMapToCesium(
      withElevationProviders,
      { latitude, longitude },
      zoom,
      resolutionScale,
      {
        cause: "SwitchMapMode to 3d",
        onComplete: () => {
          transitionCompleted = true;
        },
      }
    );

    if (transitionCompleted) {
      await waitForAnimationFrames(1);
      console.debug(
        "[CESIUM|2D3D|TO3D] tiledMapToCesium complete - dispatching setIsMode2d(false)"
      );
      dispatch(setIsMode2d(false));
      transitionStateRef.current = MapTransitionState.postTransitionTo3d;
      await waitForAnimationFrames(1);
      animateCesiumView();
    } else {
      onCancel(false);
      return;
    }
  };

  const transitionToMode2d = async () => {
    if (!routedMapRef.current?.leafletMap?.leafletElement) {
      console.warn("leaflet not available no transition possible [zoom]");
      onCancel?.(true);
      return;
    }
    const scene = sceneRef.current;
    if (!isValidScene(scene)) {
      console.warn("cesium not available no transition possible [zoom]");
      onCancel?.(true);
      return;
    }
    transitionStateRef.current = MapTransitionState.preTransitionTo2d;
    try {
      await runTransitionLifecycleHandlers(
        transitionLifecycleRef,
        MapTransitionState.preTransitionTo2d
      );
    } catch (error) {
      console.warn("preTransitionTo2d failed", error);
      // continue with actual transition
    }

    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    // Do not transition if we cannot pick ground from depth (ellipsoid-only is not allowed)
    const { scenePosition: groundPos, coordinates: cartographic } =
      pickSceneCenter(scene, { getCoordinates: true });

    cesiumContext.withCamera((camera) => {
      let height = camera.positionCartographic.height;
      let distance = height;

      const hasGroundPos = defined(groundPos) && defined(cartographic);
      if (!hasGroundPos) {
        console.info(
          "[CESIUM|2D3D|TO2D] No valid ground height (depth) found – cancel transition"
        );
        transitionStateRef.current = MapState.mode3d;
        onCancel?.(true);
        return;
      }

      // Start transition visuals only after we know we can complete it
      const pos = groundPos as Cartesian3;
      const carto = cartographic as Cartographic;
      distance = Cartesian3.distance(pos, camera.position);
      height = carto.height + distance;

      // evaluate angles for animation duration
      let zoomDiff = 0;

      const { zoomSnap } = leaflet.options;
      if (zoomSnap) {
        // Move the cesium camera to the next zoom snap level of leaflet before transitioning
        const currentZoom = cesiumCenterPixelSizeToLeafletZoom(scene).value;
        const heightBefore = height;
        const distanceBefore = distance;

        if (currentZoom === null) {
          console.warn("could not determine current zoom level");
          transitionStateRef.current = MapState.mode3d;
          onCancel?.(true);
          return;
        } else {
          // go to the next integer zoom snap level
          // smaller values is further away
          const intMultiple = currentZoom * (1 / zoomSnap);
          const targetZoom =
            intMultiple % 1 < 0.75 // prefer zooming out
              ? Math.floor(intMultiple) * zoomSnap
              : Math.ceil(intMultiple) * zoomSnap;
          zoomDiff = currentZoom - targetZoom;
          const heightFactor = Math.pow(2, zoomDiff);
          const { groundHeight } = getCameraHeightAboveGround(scene);

          distance = distance * heightFactor;
          height = groundHeight + distance;

          console.debug(
            "TRANSITION TO 2D [2D|3D] zoomSnap",
            zoomSnap,
            currentZoom,
            targetZoom,
            heightFactor,
            distance,
            distanceBefore,
            height,
            heightBefore,
            zoomDiff
          );
        }
      } else {
        console.info("no zoomSnap applied", leaflet);
      }

      const duration =
        (getTopDownCameraDeviationAngle(scene) ?? 0) * 2 + (zoomDiff ?? 0) * 1;
      setPrevDuration(duration);

      const onComplete2d = async () => {
        try {
          const { latitude, longitude, zoom } =
            await getTiledMapCenterZoomEquivalent(scene);
          if (!leaflet) {
            console.warn("leaflet not available no transition possible [zoom]");
            onCancel(false);
            return;
          }
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            console.warn("latitude or longitude is undefined, skipping");
            onCancel(false);
            return;
          }
          if (!Number.isFinite(zoom)) {
            console.warn("zoom is undefined, skipping");
            onCancel(false);
            return;
          }

          leaflet.setView([latitude, longitude], zoom, noAnimation);
        } catch (error) {
          console.error("could not determine center zoom equivalent", error);
          onCancel(false);
          return;
        }

        // trigger the visual transition
        dispatch(setIsMode2d(true));
        transitionStateRef.current = MapState.mode2d;
        onComplete?.(true);
      };

      console.debug("[Animation|2D3D] duration zoom", distance);

      transitionStateRef.current = MapState.transitionTo2d;
      if (hasGroundPos) {
        // rotate around the groundposition at center
        console.debug(
          "[CESIUM|2D3D|TO2D] setting prev HPR zoom",
          groundPos,
          height
        );

        animateInterpolateHeadingPitchRange(
          scene,
          pos,
          new HeadingPitchRange(0, -Math.PI / 2, distance),
          {
            setPrevious: setPrevHPR,
            duration: duration * 1000,
            onComplete: onComplete2d,
            cancelable: false,
          }
        );
      } else {
        onCancel(false);
        // no transition possible
        transitionStateRef.current = MapState.mode3d;
      }
    });
  };
  return { transitionToMode2d, transitionToMode3d };
};
export default useMapTransition;
