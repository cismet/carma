import { useContext, useState } from "react";
import { useDispatch } from "react-redux";

import { Cartesian3, Cartographic, defined, HeadingPitchRange } from "cesium";
import type { Map as LeafletMap } from "leaflet";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { normalizeOptions, isZoom } from "@carma-commons/utils";
import { promiseWithTimeout } from "@carma-commons/utils/promise";
import { LeafletMapStateChangeEvents } from "@carma-mapping/engines/leaflet";

import { useCesiumContext } from "./useCesiumContext";
import {
  setIsMode2d,
  setTransitionTo2d,
  setTransitionTo3d,
  clearTransition,
} from "../slices/cesium";

import { animateInterpolateHeadingPitchRange } from "../utils/cesiumAnimations";
import {
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
} from "../utils/cesiumHelpers";
import { getTiledMapCenterZoomEquivalent } from "../utils/getTiledMapCenterZoomEquivalent";
import { tiledMapToCesium } from "../utils/transitions";
import { pickViewerCanvasCenter } from "../utils/pickers";
import { cesiumCenterPixelSizeToLeafletZoom } from "../utils/pixels";

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
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
    maxZoom,
    zoomOutEaseLinearity,
    zoomOutDuration,
    zoomOutTimeoutBuffer,
  } = normalizeOptions(options, defaultTransitionOptions);

  const dispatch = useDispatch();
  const topicMapContext = useContext<typeof TopicMapContext>(TopicMapContext);
  const { realRoutedMapRef: routedMapRef } = topicMapContext;
  const cesiumContext = useCesiumContext();
  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

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
          leaflet.off(LeafletMapStateChangeEvents.zoomend, handle);
          resolve();
        };
        cleanups.push(() =>
          leaflet.off(LeafletMapStateChangeEvents.zoomend, handle)
        );
        leaflet.once(LeafletMapStateChangeEvents.zoomend, handle);
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
    if (
      !cesiumContext.isValidViewer() ||
      !routedMapRef.current?.leafletMap?.leafletElement
    ) {
      console.warn("cesium or leaflet not available");
      return;
    }

    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    await prepareLeafletForTransition(leaflet);
    // cancel any ongoing flight
    cesiumContext.withCamera((camera) => camera.cancelFlight());

    dispatch(setTransitionTo3d());
    const onComplete3d = () => {
      dispatch(clearTransition());
      onComplete?.(false);
    };

    const animateCesiumView = () => {
      // Only attempt to pick position if we need to restore a previous view
      if (!prevHPR) {
        console.debug(
          "[CESIUM|2D3D|TO3D] no previous HPR to restore, completing transition"
        );
        onComplete3d();
        return;
      }

      // Guard against scene not being ready
      if (!cesiumContext.isValidViewer()) {
        console.warn(
          "[CESIUM|2D3D|TO3D] viewer not valid, completing transition without animation"
        );
        onComplete3d();
        return;
      }

      // Try to pick center position, but don't fail if it doesn't work
      let pos: Cartesian3 | null = null;
      try {
        pos = pickViewerCanvasCenter(cesiumContext).scenePosition;
      } catch (error) {
        console.warn(
          "[CESIUM|2D3D|TO3D] failed to pick center position, completing transition without animation",
          error
        );
        onComplete3d();
        return;
      }

      if (pos && prevHPR) {
        console.debug(
          "[CESIUM|2D3D|TO3D] restore 3d camera position zoom",
          pos,
          prevHPR
        );
        animateInterpolateHeadingPitchRange(cesiumContext, pos, prevHPR, {
          delay: duration, // allow the css transition to finish
          duration: prevDuration * 1000,
          useCurrentDistance: true,
          onComplete: onComplete3d,
          onCancel: onComplete3d,
        });
      } else {
        console.debug(
          "[CESIUM|2D3D|TO3D] no valid position or HPR, completing transition",
          pos,
          prevHPR
        );
        onComplete3d();
        return;
      }
    };

    const { lat: latitude, lng: longitude } = leaflet.getCenter();
    const zoom = leaflet.getZoom();

    await tiledMapToCesium(cesiumContext, { latitude, longitude }, zoom, {
      cause: "SwitchMapMode to 3d",
      onComplete: () => {
        // handles fadeout of topicmap/2d component externally
        dispatch(setIsMode2d(false));
        setTimeout(animateCesiumView, 100);
      },
    });
  };

  const transitionToMode2d = async () => {
    if (!routedMapRef.current?.leafletMap?.leafletElement) {
      console.warn("leaflet not available no transition possible [zoom]");
      return;
    }
    if (!cesiumContext.isValidViewer()) {
      console.warn("cesium not available no transition possible [zoom]");
      return;
    }

    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    // Use pickPosition to get terrain-aware ground position at screen center
    const centerPickResult = pickViewerCanvasCenter(cesiumContext, {
      depthTestAgainstTerrain: true,
      getCoordinates: true,
    });

    const groundPos = centerPickResult.scenePosition;
    const cartographic = centerPickResult.coordinates;

    cesiumContext.withCamera((camera) => {
      let height = camera.positionCartographic.height;
      let distance = height;

      const hasGroundPos = defined(groundPos) && defined(cartographic);
      if (!hasGroundPos) {
        console.info(
          "[CESIUM|2D3D|TO2D] No valid ground height (depth) found – cancel transition"
        );
        dispatch(clearTransition());
        return;
      }

      // Start transition visuals only after we know we can complete it
      dispatch(setTransitionTo2d());
      const pos = groundPos as Cartesian3;
      const carto = cartographic as Cartographic;
      distance = Cartesian3.distance(pos, camera.position);
      height = carto.height + distance;

      // evaluate angles for animation duration
      let zoomDiff = 0;

      const { zoomSnap } = leaflet.options;

      if (zoomSnap) {
        // Move the cesium camera to the next zoom snap level of leaflet before transitioning
        const currentZoom =
          cesiumCenterPixelSizeToLeafletZoom(cesiumContext).value;
        const heightBefore = height;
        const distanceBefore = distance;

        if (currentZoom === null) {
          console.error("could not determine current zoom level");
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
          const { groundHeight } = getCameraHeightAboveGround(cesiumContext);

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
        getTopDownCameraDeviationAngle(cesiumContext) * 2 + zoomDiff * 1;
      setPrevDuration(duration);

      const onComplete2d = async () => {
        try {
          const { latitude, longitude, zoom } =
            await getTiledMapCenterZoomEquivalent(cesiumContext);
          if (!leaflet) {
            console.warn("leaflet not available no transition possible [zoom]");
            return;
          }
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            console.warn("latitude or longitude is undefined, skipping");
            return;
          }
          if (!Number.isFinite(zoom)) {
            console.warn("zoom is undefined, skipping");
            return;
          }

          leaflet.setView([latitude, longitude], zoom, noAnimation);
        } catch (error) {
          console.error("could not determine center zoom equivalent", error);
          return;
        }

        // trigger the visual transition
        dispatch(setIsMode2d(true));
        dispatch(clearTransition());
        onComplete?.(true);
      };

      console.debug("[Animation|2D3D] duration zoom", distance);

      if (hasGroundPos) {
        // rotate around the groundposition at center
        console.debug(
          "[CESIUM|2D3D|TO2D] setting prev HPR zoom",
          groundPos,
          height
        );

        animateInterpolateHeadingPitchRange(
          cesiumContext,
          pos,
          new HeadingPitchRange(0, -Math.PI / 2, distance),
          {
            setPrevious: setPrevHPR,
            duration: duration * 1000,
            onComplete: onComplete2d,
            cancelable: false,
            useCurrentDistance: false, // Interpolate range to match zoom snap target
          }
        );
      }
    });
  };
  return { transitionToMode2d, transitionToMode3d };
};
export default useMapTransition;
