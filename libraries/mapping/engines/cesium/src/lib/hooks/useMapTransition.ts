import { useContext, useState } from "react";
import { useDispatch } from "react-redux";

import { Cartesian3, Cartographic, defined, HeadingPitchRange } from "cesium";

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
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
} from "../utils/cesiumHelpers";
import { setLeafletView } from "../utils/leafletHelpers";
import { leafletToCesium } from "../utils/leafletToCesium";
import { pickCanvasCenter } from "../utils/pickers";
import { cesiumCenterPixelSizeToLeafletZoom } from "../utils/pixels";
// import removed: rely on cesiumContext.isValidWidget

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
  const cesiumContext = useCesiumContext();
  const { widgetRef } = cesiumContext;

  if (duration === undefined) {
    duration = DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION;
  }

  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

  const transitionToMode3d = async () => {
    if (
      !widgetRef.current ||
      !routedMapRef.current?.leafletMap?.leafletElement
    ) {
      console.warn("cesium or leaflet not available");
      return;
    }

    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    // cancel any ongoing flight
    cesiumContext.withCamera((camera) => camera.cancelFlight());

    dispatch(setTransitionTo3d());
    // Dev behavior: switch out of 2D immediately; animation will restore HPR
    dispatch(setIsMode2d(false));
    const onComplete3d = () => {
      dispatch(clearTransition());
      onComplete?.(false);
    };
    // introduces side effects with gazetteer and home button, always show animation

    const onCompleteAnimatedTo3d = () => {
      const pos = pickCanvasCenter(cesiumContext).scenePosition;

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
          "[CESIUM|2D3D|TO3D] to change to 3d camera position applied zoom",
          pos,
          prevHPR
        );
        onComplete3d();
        return;
      }
    };

    await leafletToCesium(leaflet, cesiumContext, {
      cause: "SwitchMapMode to 3d",
      onComplete: () => setTimeout(onCompleteAnimatedTo3d, 100),
    });
  };

  const transitionToMode2d = async () => {
    if (!routedMapRef.current?.leafletMap?.leafletElement) {
      console.warn("leaflet not available no transition possible [zoom]");
      return;
    }
    if (!widgetRef.current) {
      console.warn("cesium not available no transition possible [zoom]");
      return;
    }

    const leaflet = routedMapRef.current?.leafletMap?.leafletElement;

    // Do not transition if we cannot pick ground from depth (ellipsoid-only is not allowed)
    const { scenePosition: groundPos, coordinates: cartographic } =
      pickCanvasCenter(cesiumContext, { getCoordinates: true });

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

      const onComplete2d = () => {
        setLeafletView(cesiumContext, leaflet, { animate: false, duration: 0 });
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
          }
        );
      }
    });
  };
  return { transitionToMode2d, transitionToMode3d };
};
export default useMapTransition;
