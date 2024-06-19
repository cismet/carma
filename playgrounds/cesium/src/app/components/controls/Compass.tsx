import { MouseEvent, ReactNode } from 'react';
import { faCompass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCesium } from 'resium';
import OnMapButton from './OnMapButton';
import {
  Cartesian3,
  Cartographic,
  Math as CeMath,
  defined,
  Cartesian2,
} from 'cesium';
import { getCanvasCenter } from '../../utils/cesiumHelpers';

type CompassProps = {
  children?: ReactNode;
};

const MIN_TOP_DOWN_DISTANCE = 50;

export const Compass = (props: CompassProps) => {
  const { viewer } = useCesium();

  const handleFlyToCenter = (e: MouseEvent) => {
    e.preventDefault();

    if (viewer) {
      const windowPosition = new Cartesian2(
        viewer.canvas.clientWidth / 2,
        viewer.canvas.clientHeight / 2
      );
      const horizonTest = viewer.camera.pickEllipsoid(windowPosition);
      let destination = viewer.camera.position;
      if (defined(horizonTest)) {
        console.log('scene center below horizon');
        const pos = getCanvasCenter(viewer);
        const distance = Cartesian3.distance(pos, viewer.camera.position);
        const cartographic = Cartographic.fromCartesian(pos);
        const longitude = CeMath.toDegrees(cartographic.longitude);
        const latitude = CeMath.toDegrees(cartographic.latitude);
        destination = Cartesian3.fromDegrees(
          longitude,
          latitude,
          cartographic.height + Math.max(distance, MIN_TOP_DOWN_DISTANCE)
        );
      } else {
        console.info('scene above horizon, using camera position as reference');
        // use camera position if horizon is not visible
        // bump up the camera a bit if too close too ground
        const cartographic = Cartographic.fromCartesian(viewer.camera.position);
        const longitude = CeMath.toDegrees(cartographic.longitude);
        const latitude = CeMath.toDegrees(cartographic.latitude);
        destination = Cartesian3.fromDegrees(
          longitude,
          latitude,
          cartographic.height + MIN_TOP_DOWN_DISTANCE
        );
      }

      viewer.camera.flyTo({
        destination,
        orientation: {
          heading: CeMath.toRadians(0), // facing north
          pitch: CeMath.toRadians(-90), // looking straight down
          roll: 0.0,
        },
      });
    }
  };

  return (
    <OnMapButton title="Einnorden" onClick={handleFlyToCenter}>
      <FontAwesomeIcon icon={faCompass}></FontAwesomeIcon>
    </OnMapButton>
  );
};

export default Compass;
