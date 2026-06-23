import {
  type ReactNode,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import { faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Cartesian3,
  Color,
  Matrix4,
  PointPrimitiveCollection,
  Transforms,
} from "@carma-cesium";

import type { CesiumRuntime } from "../../CesiumContext";
import { useCesiumContext } from "../../hooks/useCesiumContext";
import { useCesiumRuntime } from "../../hooks/useCesiumRuntime";
import {
  toggleIsAnimating,
  selectCesiumRuntimeIsAnimating,
} from "../../slices/cesium";
import { pickScenePositions } from "../../utils/pick-position/pick-scene-positions";
import OnMapButton from "./OnMapButton";
// TODO use config/context
const DEFAULT_ROTATION_SPEED = 0.0001;

type SpinningControlProps = {
  showCenterPoint?: boolean;
  children?: ReactNode;
};

const ORBIT_CENTER_POSITION: [number, number] = [0.5, 0.6]; // A bit lower than center to adjust for typical pitch

const OrbitControl = ({ showCenterPoint = true }: SpinningControlProps) => {
  const dispatch = useDispatch();

  const runtime = useCesiumRuntime();
  const { withRuntime, getScene } = useCesiumContext();
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const orbitPointCollectionRef = useRef<PointPrimitiveCollection | null>(null);
  const lastRenderTimeRef = useRef<number | null>(null);
  const isAnimating = useSelector(selectCesiumRuntimeIsAnimating);

  const removeOrbitPoint = useCallback(() => {
    const scene = getScene();
    const collection = orbitPointCollectionRef.current;
    if (scene && collection && scene.primitives.contains(collection)) {
      scene.primitives.remove(collection);
    }
    orbitPointCollectionRef.current = null;
  }, [getScene]);

  const orbitListener = useCallback(() => {
    console.debug("CALLBACK: orbiting");
    const point = orbitPointRef.current;
    if (!runtime || !point) return;

    const transform = Transforms.eastNorthUpToFixedFrame(point);
    // use render time to calculate delta time not clock time which is simulated and can change
    const currentTime = performance.now();
    const deltaTime = currentTime - (lastRenderTimeRef.current ?? currentTime);
    lastRenderTimeRef.current = currentTime;

    const rotationDelta = DEFAULT_ROTATION_SPEED * deltaTime;

    runtime.camera.lookAtTransform(transform);
    runtime.camera.constrainedAxis = Cartesian3.UNIT_Z;
    runtime.camera.rotateRight(rotationDelta);
    runtime.camera.constrainedAxis = undefined;
    runtime.camera.lookAtTransform(Matrix4.IDENTITY); // keep the camera unlocked while rotating
  }, [runtime]);

  const toggleOrbit = (runtime: CesiumRuntime) => {
    if (!isAnimating) {
      const scene = getScene();

      if (!scene) {
        console.warn("OrbitControl: no cesium scene available for orbiting");
        return;
      }
      const position = pickScenePositions(
        scene,
        [ORBIT_CENTER_POSITION],
        "test for orbit control"
      )[0].scenePosition;
      orbitPointRef.current = position;
      lastRenderTimeRef.current = null;
      runtime.clock.onTick.addEventListener(orbitListener);

      if (position && showCenterPoint) {
        removeOrbitPoint();
        const collection = new PointPrimitiveCollection();
        collection.add({
          position,
          pixelSize: 30,
          color: Color.RED,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
        });
        scene.primitives.add(collection);
        orbitPointCollectionRef.current = collection;
      }
    }
    dispatch(toggleIsAnimating());
  };

  const handleOrbit = (event: MouseEvent) => {
    event.preventDefault();
    withRuntime((runtime) => toggleOrbit(runtime));
  };

  useEffect(() => {
    if (!isAnimating) {
      withRuntime((runtime) => {
        console.debug("stop orbiting by state", orbitPointRef.current);
        runtime.clock.onTick.removeEventListener(orbitListener);
        runtime.camera.constrainedAxis = undefined;
        removeOrbitPoint();
      });
    }
  }, [isAnimating, withRuntime, orbitListener, removeOrbitPoint]);

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
