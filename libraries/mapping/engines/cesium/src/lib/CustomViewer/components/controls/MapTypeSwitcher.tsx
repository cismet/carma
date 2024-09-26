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
  children?: ReactNode;
};

export const MapTypeSwitcher = ({ zoomSnap = 0.5 }: Props = {}) => {
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

  const transitionToMode2d = (viewer: Viewer) => {
    // TODO consolidate this logic into a shared helper function
    const groundPos = pickViewerCanvasCenter(viewer).scenePosition;
    let latitude: number, longitude: number;
    let height = viewer.camera.positionCartographic.height;
    let distance = height;
    const hasGroundPos = defined(groundPos);
    if (hasGroundPos) {
      /*
           viewer.entities.removeById('groundPoint');
           viewer.entities.add({
             id: 'groundPoint',
             position: groundPos,
             point: {
               pixelSize: 40,
               color: Color.RED,
             },
           });
           */
      const { scenePosition: pos, coordinates: cartographic } =
        pickViewerCanvasCenter(viewer, { getCoordinates: true });
      if (pos && cartographic) {
        longitude = CeMath.toDegrees(cartographic.longitude);
        latitude = CeMath.toDegrees(cartographic.latitude);
        distance = Cartesian3.distance(pos, viewer.camera.position);
        height = cartographic.height + distance;
      }
    } else {
      console.info("scene above horizon, using camera position as reference");
      // use camera position if horizon is not visible
      const cartographic = Cartographic.fromCartesian(viewer.camera.position);
      longitude = CeMath.toDegrees(cartographic.longitude);
      latitude = CeMath.toDegrees(cartographic.latitude);
      // TODO resolve
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
      // Move the cesium camera to the next integer zoom level of leaflet before transitioning
      const currentZoom = cesiumCenterPixelSizeToLeafletZoom(viewer).value;

      if (currentZoom === null) {
        console.error("could not determine current zoom level");
      } else {
        // go to the next integer zoom level
        // smaller values is further away
        const targetZoom =
          currentZoom % 1 < 0.75 // prefer zooming out
            ? Math.floor(currentZoom)
            : Math.ceil(currentZoom);
        zoomDiff = currentZoom - targetZoom;
        const heightFactor = Math.pow(2, zoomDiff);
        //const { groundHeight } = getCameraHeightAboveGround(viewer);

        distance = distance * heightFactor;
        //height = groundHeight + distance;
      }
    }

    const duration = getTopDownCameraDeviationAngle(viewer) * 2 + zoomDiff * 1;
    setPrevDuration(duration);

    const onComplete = () => {
      setLeafletView(viewer, leaflet, { animate: false, zoomSnap, duration: 0 });
      setPrevCamera2dPosition(viewer.camera.position.clone());
      // trigger the visual transition
      dispatch(setIsMode2d(true));
      dispatch(clearTransition());
    };

    console.log("duration zoom", distance);

    if (hasGroundPos) {
      // rotate around the groundposition at center
      console.log("setting prev HPR zoom", groundPos, height)
      setPrevHPR(
        animateInterpolateHeadingPitchRange(
          viewer,
          groundPos,
          new HeadingPitchRange(0, -Math.PI / 2, distance),
          {
            duration: duration * 1000,
            onComplete,
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

    console.log(
      "clicked handleSwitchMapMode zoom",
      isMode2d,
      viewer,
      leaflet,
    );

    if (viewer) {

      if (isMode2d) {
        dispatch(setTransitionTo3d());
        dispatch(setIsMode2d(false));

        if (
          prevCamera2dPosition &&
          Cartesian3.equals(viewer.camera.position, prevCamera2dPosition) !==
          true
        ) {
          console.log(
            "camera position unchanged, skipping 2d to 3d transition animation zoom",
          );
          dispatch(clearTransition());
          return;
        }

        const onComplete = () => {
          const pos = pickViewerCanvasCenter(viewer).scenePosition;

          if (pos && prevHPR) {
            console.log('restore 3d camera position zoom', pos, prevHPR);
            animateInterpolateHeadingPitchRange(viewer, pos, prevHPR, {
              delay: DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION, // allow the css transition to finish
              duration: prevDuration * 1000,
              useCurrentDistance: true,
              onComplete: clearTransition
            });
          } else {
            console.log('no change to 3d camera position applied zoom', pos, prevHPR);
            dispatch(clearTransition());
            return;
          }
        }

        leafletToCesium(viewer, leaflet, { cause: "SwitchMapMode to 3d", onComplete: () => setTimeout(onComplete, 100) })

      } else {
        dispatch(setTransitionTo2d());
        transitionToMode2d(viewer);
      }
    }
  };



  return (
    <ControlButtonStyler
      title={isMode2d ? "zur 3D Ansicht wechseln" : "zur 2D Ansicht wechseln"}
      className="font-semibold"
      onClick={handleSwitchMapMode}
      disabled={isTransitioning}
    >
      {isMode2d ? "3D" : "2D"}
    </ControlButtonStyler>
  );
};

export default MapTypeSwitcher;
