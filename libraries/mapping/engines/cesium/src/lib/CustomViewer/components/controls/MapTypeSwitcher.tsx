import { MouseEvent, ReactNode, useContext, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  Math as CeMath,
  defined,
  HeadingPitchRange,
  Viewer,
} from "cesium";
import { useDispatch } from "react-redux";
import {
  useViewerIsMode2d,
  setIsMode2d,
  setTransitionTo2d,
  setTransitionTo3d,
  clearTransition,
  useViewerIsTransitioning,
} from "../../../CustomViewerContextProvider/slices/cesium";
import { setLeafletView } from "../../utils";
import {
  cesiumCenterPixelSizeToLeafletZoom,
  getTopDownCameraDeviationAngle,
  leafletToCesium,
  pickViewerCanvasCenter,
} from "../../../utils";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { animateInterpolateHeadingPitchRange } from "../../../utils/cesiumAnimations";

import { CameraPositionAndOrientation } from "../../../..";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useCesiumCustomViewer } from '../../../CustomViewerContextProvider/components/CustomViewerContextProvider';

import type { ZoomIncrements } from "types/leaflet-config";

// TODO sync
const DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION = 1000;

type Props = {
  zoomSnap?: ZoomIncrements;
  onComplete?: (isTo2D: boolean) => void;
  forceEnabled?: boolean;
  children?: ReactNode;
};

export const MapTypeSwitcher = ({ zoomSnap = 0.5, onComplete, forceEnabled }: Props) => {
  //const { viewer } = useCesium();
  const dispatch = useDispatch();
  const isMode2d = useViewerIsMode2d();
  const { viewer } = useCesiumCustomViewer();
  const [prevCamera3d, setPrevCamera3d] =
    useState<CameraPositionAndOrientation | null>(null);
  const [prevCamera2dPosition, setPrevCamera2dPosition] =
    useState<Cartesian3 | null>(null);
  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

  const isTransitioning = useViewerIsTransitioning();

  // TODO provide mapFramework context via props for UI?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicMapContext: any =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const leaflet = topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  if (!viewer) {
    console.warn("cesium not available")
    return null;
  }

  const transitionToMode3d = () => {
    dispatch(setTransitionTo3d());
    dispatch(setIsMode2d(false));
    const onComplete3d = () => {
      dispatch(clearTransition());
      onComplete && onComplete(false);
    }
    if (
      prevCamera2dPosition &&
      Cartesian3.equals(viewer.camera.position, prevCamera2dPosition) !==
      true
    ) {
      console.info("[CESIUM|LEAFLET|TO3D] camera position unchanged, skipping 2d to 3d transition animation zoom");
      onComplete3d();
      return;
    }

    const onCompleteAnimatedTo3d = () => {
      const pos = pickViewerCanvasCenter(viewer).scenePosition;

      if (pos && prevHPR) {
        console.info('[CESIUM|2D3D|TO3D] restore 3d camera position zoom', pos, prevHPR);
        animateInterpolateHeadingPitchRange(viewer, pos, prevHPR, {
          delay: DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION, // allow the css transition to finish
          duration: prevDuration * 1000,
          useCurrentDistance: true,
          onComplete: onComplete3d
        });
      } else {
        console.info('[CESIUM|2D3D|TO3D] to change to 3d camera position applied zoom', pos, prevHPR);
        onComplete3d();
        return;
      }
    }

    leafletToCesium(viewer, leaflet, { cause: "SwitchMapMode to 3d", onComplete: () => setTimeout(onCompleteAnimatedTo3d, 100) })

  }

  const transitionToMode2d = () => {
    // TODO consolidate this logic into a shared helper function
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

    // move the leaflet view to start position of animation to already allow fetching tiles if close
    //setLeafletView(viewer, leaflet);

    let zoomDiff = 0;

    if (zoomSnap) {
      // Move the cesium camera to the next zoom snap level of leaflet before transitioning
      const currentZoom = cesiumCenterPixelSizeToLeafletZoom(viewer).value;

      if (currentZoom === null) {
        console.error("could not determine current zoom level");
      } else {
        // go to the next integer zoom snap level
        // smaller values is further away
        const intMultiple = currentZoom * (1 / zoomSnap)
        const targetZoom =
          (intMultiple % 1) < (0.75) // prefer zooming out
            ? Math.floor(intMultiple) * zoomSnap
            : Math.ceil(intMultiple) * zoomSnap;
        zoomDiff = currentZoom - targetZoom;
        const heightFactor = Math.pow(2, zoomDiff);
        //const { groundHeight } = getCameraHeightAboveGround(viewer);

        distance = distance * heightFactor;
        //height = groundHeight + distance;
      }
    }

    const duration = getTopDownCameraDeviationAngle(viewer) * 2 + zoomDiff * 1;
    setPrevDuration(duration);

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
      console.info("[CESIUM|2D3D|TO2D] setting prev HPR zoom", groundPos, height)
      setPrevHPR(
        animateInterpolateHeadingPitchRange(
          viewer,
          groundPos,
          new HeadingPitchRange(0, -Math.PI / 2, distance),
          {
            duration: duration * 1000,
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

  const handleSwitchMapMode = async (e: MouseEvent) => {
    e.preventDefault();

    console.info(
      "CLICKHANDLER: [CESIUM|LEAFLET|2D3D] clicked handleSwitchMapMode zoom",
      isMode2d,
      viewer,
      leaflet,
    );
    if (viewer) {
      if (isMode2d) {
        transitionToMode3d();
      } else {
        transitionToMode2d();
      }
    }
  };



  return (
    <ControlButtonStyler
      title={isMode2d ? "zur 3D Ansicht wechseln" : "zur 2D Ansicht wechseln"}
      className="font-semibold"
      onClick={handleSwitchMapMode}
      disabled={isTransitioning && !forceEnabled}
    >
      {isMode2d ? "3D" : "2D"}
    </ControlButtonStyler>
  );
};

export default MapTypeSwitcher;
