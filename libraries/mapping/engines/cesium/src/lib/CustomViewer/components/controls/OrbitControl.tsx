import { ReactNode, MouseEvent, useEffect } from "react";
import { faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useRef } from "react";
import { useCesium } from "resium";
import OnMapButton from "./OnMapButton";
import { Cartesian3, Color, Matrix4, Transforms, Viewer } from "cesium";
import {
  toggleIsAnimating,
  useViewerIsAnimating,
} from "../../../CustomViewerContextProvider/slices/cesium";
import { useDispatch } from "react-redux";
import { pickViewerCanvasCenter } from "../../../utils";

// TODO use config/context
const DEFAULT_ROTATION_SPEED = 0.0001;

type SpinningControlProps = {
  showCenterPoint?: boolean;
  children?: ReactNode;
};

const orbitCenterPointId = "orbitCenterPoint";

const OrbitControl = ({ showCenterPoint = true }: SpinningControlProps) => {
  const { viewer } = useCesium();
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const lastRenderTimeRef = useRef<number | null>(null);
  const isAnimating = useViewerIsAnimating();
  const dispatch = useDispatch();

  const orbitListener = useCallback(() => {
    console.log("CALLBACK: orbiting");
    const point = orbitPointRef.current;
    if (!viewer || !point) return;

    const transform = Transforms.eastNorthUpToFixedFrame(point);
    // use render time to calculate delta time not clock time which is simulated and can change
    const currentTime = performance.now();
    const deltaTime = currentTime - (lastRenderTimeRef.current ?? currentTime);
    lastRenderTimeRef.current = currentTime;

    const rotationDelta = DEFAULT_ROTATION_SPEED * deltaTime;
    //console.log('rotationDelta', rotationDelta);

    viewer.camera.lookAtTransform(transform);
    viewer.camera.constrainedAxis = Cartesian3.UNIT_Z;
    viewer.camera.rotateRight(rotationDelta);
    viewer.camera.constrainedAxis = undefined;
    viewer.camera.lookAtTransform(Matrix4.IDENTITY); // keep the camera unlocked while rotating
  }, [viewer]);

  const toggleOrbit = (viewer: Viewer) => {
    if (!isAnimating) {
      const position = pickViewerCanvasCenter(viewer).scenePosition;
      orbitPointRef.current = position;
      lastRenderTimeRef.current = null;
      // console.log('orbitPoint', orbitPointRef.current);
      viewer.clock.onTick.addEventListener(orbitListener);

      //showCenterPoint && viewer.entities.removeById(orbitCenterPointId);

      position &&
        showCenterPoint &&
        viewer.entities.add({
          position,
          point: {
            pixelSize: 30,
            color: Color.RED,
            outlineColor: Color.WHITE,
            outlineWidth: 1,
            //heightReference: HeightReference.RELATIVE_TO_3D_TILE,
          },
          id: orbitCenterPointId,
        });
    }
    dispatch(toggleIsAnimating());
  };

  const handleOrbit = (event: MouseEvent) => {
    event.preventDefault();
    if (!viewer) return;
    toggleOrbit(viewer);
  };

  useEffect(() => {
    if (!isAnimating && viewer) {
      console.log("stop orbiting by state", orbitPointRef.current);
      viewer.clock.onTick.removeEventListener(orbitListener);
      viewer.camera.constrainedAxis = undefined;
      showCenterPoint && viewer.entities.removeById(orbitCenterPointId);
      //setIsAnimating(false);
    }
  }, [isAnimating, viewer, orbitListener, showCenterPoint]);

  return (
    <OnMapButton
      onClick={handleOrbit}
      title="Round and round and round and round"
    >
      <FontAwesomeIcon spin={isAnimating} icon={faSync}></FontAwesomeIcon>
    </OnMapButton>
  );
};

export default OrbitControl;
