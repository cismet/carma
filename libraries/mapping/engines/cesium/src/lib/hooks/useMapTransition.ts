import { useContext, useState } from "react";
import { useDispatch } from "react-redux";

import { Cartesian3, defined, HeadingPitchRange } from "cesium";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useCesiumContext } from "./useCesiumContext";
import {
  setIsMode2d,
  setTransitionTo2d,
  setTransitionTo3d,
  clearTransition,
} from "../slices/cesium";

import { animateInterpolateHeadingPitchRange } from "../utils/cesiumAnimations";
import {
  cesiumCenterPixelSizeToLeafletZoom,
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
  pickViewerCanvasCenter,
} from "../utils/cesiumHelpers";
import { setLeafletView } from "../utils/leafletHelpers";
import { leafletToCesium } from "../utils/leafletToCesium";

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  duration?: number;
};

const DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION = 1000;

export const useMapTransition = ({
  onComplete,
  duration,
}: TransitionOptions = {}) => {
  const dispatch = useDispatch();
  const topicMapContext = useContext<typeof TopicMapContext>(TopicMapContext);
  const { realRoutedMapRef: routedMapRef } = topicMapContext;

  const { viewerRef, surfaceProviderRef, terrainProviderRef } =
    useCesiumContext();

  if (duration === undefined) {
    duration = DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION;
  }

  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

  const transitionToMode3d = async () => {
    if (
      !viewerRef.current ||
      !routedMapRef.current?.leafletMap?.leafletElement
    ) {
      console.warn("cesium or leaflet not available");
      return null;
    }

    const viewer = viewerRef.current;
    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    // cancel any ongoing flight
    viewer.camera.cancelFlight();

    dispatch(setTransitionTo3d());
    dispatch(setIsMode2d(false));
    const onComplete3d = () => {
      dispatch(clearTransition());
      onComplete && onComplete(false);
    };
    // introduces side effects with gazetteer and home button, always show animation

    const onCompleteAnimatedTo3d = () => {
      const pos = pickViewerCanvasCenter(viewer).scenePosition;

      if (pos && prevHPR) {
        console.debug(
          "[CESIUM|2D3D|TO3D] restore 3d camera position zoom",
          pos,
          prevHPR
        );
        animateInterpolateHeadingPitchRange(viewer, pos, prevHPR, {
          delay: duration, // allow the css transition to finish
          duration: prevDuration * 1000,
          useCurrentDistance: true,
          onComplete: onComplete3d,
          onCancel: onComplete3d,
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

    await leafletToCesium(leaflet, viewer, {
      cause: "SwitchMapMode to 3d",
      onComplete: () => setTimeout(onCompleteAnimatedTo3d, 100),
      terrainProviderRef,
      surfaceProviderRef,
    });
  };

  const transitionToMode2d = () => {
    if (!routedMapRef.current?.leafletMap?.leafletElement) {
      console.warn("leaflet not available no transition possible [zoom]");
      return null;
    }
    if (!viewerRef.current) {
      console.warn("cesium not available no transition possible [zoom]");
      return null;
    }

    const viewer = viewerRef.current;
    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    dispatch(setTransitionTo2d());
    const groundPos = pickViewerCanvasCenter(viewer).scenePosition;
    let height = viewer.camera.positionCartographic.height;
    let distance = height;
    const hasGroundPos = defined(groundPos);
    if (hasGroundPos) {
      const { scenePosition: pos, coordinates: cartographic } =
        pickViewerCanvasCenter(viewer, { getCoordinates: true });
      if (pos && cartographic) {
        distance = Cartesian3.distance(pos, viewer.camera.position);
        height = cartographic.height + distance;
      }
    } else {
      console.debug("scene above horizon, using camera position as reference");
    }

    // evaluate angles for animation duration
    let zoomDiff = 0;

    const { zoomSnap } = leaflet.options;

    if (zoomSnap) {
      // Move the cesium camera to the next zoom snap level of leaflet before transitioning
      const currentZoom = cesiumCenterPixelSizeToLeafletZoom(viewer).value;
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
        const { groundHeight } = getCameraHeightAboveGround(viewer);

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

    const duration = getTopDownCameraDeviationAngle(viewer) * 2 + zoomDiff * 1;
    setPrevDuration(duration);

    const onComplete2d = () => {
      setLeafletView(viewer, leaflet, { animate: false, duration: 0 });
      // trigger the visual transition
      dispatch(setIsMode2d(true));
      dispatch(clearTransition());
      onComplete && onComplete(true);
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
        viewer,
        groundPos,
        new HeadingPitchRange(0, -Math.PI / 2, distance),
        {
          setPrevious: setPrevHPR,
          duration: duration * 1000,
          onComplete: onComplete2d,
          cancelable: false,
        }
      );
    } else {
      console.info("rotate around camera position not implemented yet zoom");
      dispatch(clearTransition());
    }
  };
  return { transitionToMode2d, transitionToMode3d };
};

export default useMapTransition;
