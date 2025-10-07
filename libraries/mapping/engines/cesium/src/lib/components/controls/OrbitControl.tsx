import {
  type ReactNode,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import { Cartesian3, Color, Matrix4, Transforms, Viewer } from "cesium";
import { faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import OnMapButton from "./OnMapButton";
import {
  toggleIsAnimating,
  selectViewerIsAnimating,
} from "../../slices/cesium";
import { useCesiumContext } from "../../hooks/useCesiumContext";
import { pickSceneCenter } from "../../utils/pickers";

// TODO use config/context
const DEFAULT_ROTATION_SPEED = 0.0001;

type SpinningControlProps = {
  showCenterPoint?: boolean;
  children?: ReactNode;
};

const orbitCenterPointId = "orbitCenterPoint";

const OrbitControl = ({ showCenterPoint = true }: SpinningControlProps) => {
  const dispatch = useDispatch();

  const { withScene } = useCesiumContext();
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const lastRenderTimeRef = useRef<number | null>(null);
  const isAnimating = useSelector(selectViewerIsAnimating);

  const orbitListener = useCallback(() => {
    console.debug("CALLBACK: orbiting");
    const point = orbitPointRef.current;
    if (!point) return;

    const transform = Transforms.eastNorthUpToFixedFrame(point);
    // use render time to calculate delta time not clock time which is simulated and can change
    const currentTime = performance.now();
    const deltaTime = currentTime - (lastRenderTimeRef.current ?? currentTime);
    lastRenderTimeRef.current = currentTime;

    const rotationDelta = DEFAULT_ROTATION_SPEED * deltaTime;

    withScene((scene) => {
      scene.camera.lookAtTransform(transform);
      scene.camera.constrainedAxis = Cartesian3.UNIT_Z;
      scene.camera.rotateRight(rotationDelta);
      scene.camera.constrainedAxis = undefined;
      scene.camera.lookAtTransform(Matrix4.IDENTITY); // keep the camera unlocked while rotating
    });
  }, [withScene]);

  const toggleOrbit = useCallback(() => {
    if (!isAnimating) {
      withScene((scene, viewer) => {
        const position = pickSceneCenter(scene).scenePosition;
        orbitPointRef.current = position;
        lastRenderTimeRef.current = null;
        scene.clock.onTick.addEventListener(orbitListener);

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
      });
    }
    dispatch(toggleIsAnimating());
  }, [dispatch, isAnimating, orbitListener, showCenterPoint, withScene]);

  const handleOrbit = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      toggleOrbit();
    },
    [toggleOrbit]
  );

  useEffect(() => {
    if (!isAnimating) {
      withScene((scene, viewer) => {
        console.debug("stop orbiting by state", orbitPointRef.current);
        viewer.clock.onTick.removeEventListener(orbitListener);
        scene.camera.constrainedAxis = undefined;
        showCenterPoint && viewer.entities.removeById(orbitCenterPointId);
      });
    }
  }, [isAnimating, orbitListener, showCenterPoint, withScene]);

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
