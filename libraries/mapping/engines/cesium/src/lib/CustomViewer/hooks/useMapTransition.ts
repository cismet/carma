import { useContext, useState } from "react";
import { Cartesian3, defined, HeadingPitchRange } from "cesium";
import { useDispatch } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import type { CameraPositionAndOrientation } from "../../../index";

import {
  setIsMode2d,
  setTransitionTo2d,
  setTransitionTo3d,
  clearTransition,
  useViewerIsTransitioning,
} from "../../CesiumContextProvider/slices/cesium";
import {
  cesiumCenterPixelSizeToLeafletZoom,
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
  leafletToCesium,
  pickViewerCanvasCenter,
} from "../../utils";

import { useCesiumContext } from "../../CesiumContextProvider";
import { animateInterpolateHeadingPitchRange } from "../../utils/cesiumAnimations";
import { setLeafletView } from "../utils";

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

  const { viewer } = useCesiumContext();
  const leaflet = topicMapContext.routedMapRef?.leafletMap?.leafletElement;

  if (duration === undefined) {
    duration = DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION;
  }

  const [prevCamera3d, setPrevCamera3d] =
    useState<CameraPositionAndOrientation | null>(null);
  const [prevCamera2dPosition, setPrevCamera2dPosition] =
    useState<Cartesian3 | null>(null);
  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

  const isTransitioning = useViewerIsTransitioning();

  const transitionToMode3d = () => {
    if (!viewer || !leaflet) {
      console.warn("cesium or leaflet not available");
      return null;
    }
    dispatch(setTransitionTo3d());
    dispatch(setIsMode2d(false));
    const onComplete3d = () => {
      dispatch(clearTransition());
      onComplete && onComplete(false);
    };
    if (
      prevCamera2dPosition &&
      Cartesian3.equals(viewer.camera.position, prevCamera2dPosition) !== true
    ) {
      console.info(
        "[CESIUM|LEAFLET|TO3D] camera position unchanged, skipping 2d to 3d transition animation zoom",
      );
      onComplete3d();
      return;
    }

    const onCompleteAnimatedTo3d = () => {
      // TODO make this not nessary to wait for rendered scene to get current distance
      viewer.scene.render();
      setTimeout(() => {}, 100); // small delay after render
      const pos = pickViewerCanvasCenter(viewer).scenePosition;

      if (pos && prevHPR) {
        console.info(
          "[CESIUM|2D3D|TO3D] restore 3d camera position zoom with current distance",
          pos,
          prevHPR,
        );

        animateInterpolateHeadingPitchRange(viewer, pos, prevHPR, {
          delay: duration, // allow the css transition to finish
          // TODO: specify fodeout duration in config
          duration: prevDuration,
          useCurrentDistance: true,
          onComplete: onComplete3d,
        });
      } else {
        console.info(
          "[CESIUM|2D3D|TO3D] to change to 3d camera position applied zoom",
          pos,
          prevHPR,
        );
        onComplete3d();
        return;
      }
    };

    leafletToCesium(viewer, leaflet, {
      cause: "SwitchMapMode to 3d",
      onComplete: () => setTimeout(onCompleteAnimatedTo3d, 100),
    });
  };

  const transitionToMode2d = () => {
    if (!leaflet) {
      console.warn("leaflet not available no transition possible [zoom]");
      return null;
    }
    if (!viewer) {
      console.warn("cesium not available no transition possible [zoom]");
      return null;
    }
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
      console.info("scene above horizon, using camera position as reference");
    }

    // evaluate angles for animation duration

    // don't store camera position if pitch is near nadir
    if (Math.abs(viewer.camera.pitch + Math.PI / 2) > 0.05) {
      console.log(
        "last camera pitch",
        viewer.camera.pitch,
        viewer.camera.pitch + Math.PI / 2,
      );
      setPrevCamera3d({
        position: viewer.camera.position.clone(),
        direction: viewer.camera.direction.clone(),
        up: viewer.camera.up.clone(),
      });
    } else {
      setPrevCamera3d(null);
    }

    let zoomDiff = 0;

    const { zoomSnap } = leaflet.options;
 
    if (zoomSnap) {
      // Move the cesium camera to the next zoom snap level of leaflet before transitioning
      const currentZoom = cesiumCenterPixelSizeToLeafletZoom(viewer).value;
      const heightBefore = height;
      const distanceBefore = distance;

      if (currentZoom === null) {
        console.warn("could not determine current zoom level for zoomSnap");
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
        //height = groundHeight + distance;
        console.info(
          `[CESIUM}2D3D|TRANSITION] zoomSnap ${zoomSnap}, target ${targetZoom}, current ${currentZoom}, heightFactor ${heightFactor}, distance ${distance}`,
        );
      }
    } else {
      console.info(
        `[CESIUM}2D3D|TRANSITION] no zoomSnap applied`,
        zoomSnap,
        leaflet,
      );
    }

    const angleDuration = getTopDownCameraDeviationAngle(viewer) * 2000;
    const zoomDiffDuration = Math.abs(zoomDiff) * 10000;
    const dynamicDuration = Math.min(
      Math.max(angleDuration, zoomDiffDuration, duration),
      10000,
    );
    console.info(
      `[CESIUM}2D3D|TRANSITION] calculated transition duration max of angle ${Math.round(
        angleDuration,
      )}ms, ${Math.round(zoomDiffDuration)}, min${duration}`,
      dynamicDuration,
    );

    setPrevDuration(dynamicDuration);

    const onComplete2d = () => {
      setLeafletView(viewer, leaflet, { animate: false, duration: 0 });
      setPrevCamera2dPosition(viewer.camera.position.clone());
      // trigger the visual transition
      dispatch(setIsMode2d(true));
      dispatch(clearTransition());
      onComplete && onComplete(true);
    };

    console.log("duration zoom", distance);

    if (hasGroundPos) {
      // rotate around the groundposition at center
      console.info(
        "[CESIUM|2D3D|TO2D] setting prev HPR zoom",
        groundPos,
        height,
      );
      setPrevHPR(
        animateInterpolateHeadingPitchRange(
          viewer,
          groundPos,
          new HeadingPitchRange(0, -Math.PI / 2, distance),
          {
            duration: dynamicDuration,
            onComplete: onComplete2d,
          },
        ),
      );
    } else {
      console.info("rotate around camera position not implemented yet zoom");
      dispatch(clearTransition());
      /*
   // TODO implement this
   // rotate around the camera position
   animateInterpolateHeadingPitchRange(
     viewer,
     viewer.camera.position,
     new HeadingPitchRange(
       0,
       -Math.PI / 2,
       height - viewer.camera.positionCartographic.height
     ),
     {
       duration: duration * 1000,
       onComplete,
     }
   );
   */
    }
  };

  return { transitionToMode2d, transitionToMode3d };
};

export default useMapTransition;
