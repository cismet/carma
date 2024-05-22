import { ReactNode, MouseEvent, useEffect } from 'react';
import { faSync } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useRef } from 'react';
import { useCesium } from 'resium';
import OnMapButton from './OnMapButton';
import { getCanvasCenter } from '../../lib/cesiumHelpers';
import { DEFAULT_ROTATION_SPEED } from '../../config';
import { Cartesian3, Color, Matrix4, Transforms, Viewer } from 'cesium';
import { RootState, setIsAnimating, toggleIsAnimating } from '../../store';
import { useDispatch, useSelector } from 'react-redux';
type SpinningControlProps = {
  showCenterPoint?: boolean;
  children?: ReactNode;
};

const orbitCenterPointId = 'orbitCenterPoint';

const OrbitControl = ({ showCenterPoint = true }: SpinningControlProps) => {
  const { viewer } = useCesium();
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const lastRenderTimeRef = useRef<number | null>(null);
  const { isAnimating } = useSelector((state: RootState) => state.viewer);
  const dispatch = useDispatch();

  const orbitListener = useCallback(() => {
    console.log('orbiting');
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
      orbitPointRef.current = getCanvasCenter(viewer);
      lastRenderTimeRef.current = null;
      // console.log('orbitPoint', orbitPointRef.current);
      viewer.clock.onTick.addEventListener(orbitListener);

      //showCenterPoint && viewer.entities.removeById(orbitCenterPointId);

      showCenterPoint &&
        viewer.entities.add({
          position: orbitPointRef.current,
          point: {
            pixelSize: 30,
            color: Color.RED,
            outlineColor: Color.WHITE,
            outlineWidth: 1,
            //heightReference: HeightReference.RELATIVE_TO_3D_TILE,
          },
          id: orbitCenterPointId,
        });
    } else {
      console.log('remove', orbitPointRef.current);
      viewer.clock.onTick.removeEventListener(orbitListener);
      showCenterPoint && viewer.entities.removeById(orbitCenterPointId);
      setIsAnimating(false);
    }
    dispatch(toggleIsAnimating());
  };

  const handleOrbit = (event: MouseEvent) => {
    event.preventDefault();
    if (!viewer) return;
    toggleOrbit(viewer);
  };

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
