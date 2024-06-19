import { MouseEvent, ReactNode, useContext } from 'react';
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
import { useDispatch } from 'react-redux';
import { useViewerIsMode2d, setIsMode2d } from '../../store/slices/viewer';
import { setLeafletView } from '../CustomViewer/utils';

import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';

type Props = {
  children?: ReactNode;
};

const MIN_TOP_DOWN_DISTANCE = 50;

export const MapTypeSwitcher = (props: Props) => {
  const { viewer } = useCesium();
  const dispatch = useDispatch();
  const isMode2d = useViewerIsMode2d();

  // TODO provide mapFramework context via props for UI?
  const topicMapContext = useContext(TopicMapContext);
  const leaflet = topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  const handleSwitchMapMode = async (e: MouseEvent) => {
    e.preventDefault();

    if (viewer) {
      if (!isMode2d) {
        // Like Compass control
        // TODO consolidate this logic into a shared helper function
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
          console.info(
            'scene above horizon, using camera position as reference'
          );
          // use camera position if horizon is not visible
          // bump up the camera a bit if too close too ground
          const cartographic = Cartographic.fromCartesian(
            viewer.camera.position
          );
          const longitude = CeMath.toDegrees(cartographic.longitude);
          const latitude = CeMath.toDegrees(cartographic.latitude);
          destination = Cartesian3.fromDegrees(
            longitude,
            latitude,
            cartographic.height + MIN_TOP_DOWN_DISTANCE
          );
        }
        setLeafletView(viewer, leaflet);

        viewer.camera.flyTo({
          destination,
          orientation: {
            heading: CeMath.toRadians(0), // facing north
            pitch: CeMath.toRadians(-90), // looking straight down
            roll: 0.0,
          },
          duration: 3,
          complete: () => {
            dispatch(setIsMode2d(true));
          },
        });
      } else {
        dispatch(setIsMode2d(false));
      }
    }
  };

  return (
    <OnMapButton title="Einnorden" onClick={handleSwitchMapMode}>
      {isMode2d ? '3D' : '2D'}
    </OnMapButton>
  );
};

export default MapTypeSwitcher;
