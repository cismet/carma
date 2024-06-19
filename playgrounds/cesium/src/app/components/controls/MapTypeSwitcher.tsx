import { MouseEvent, ReactNode, useContext, useState } from 'react';
import { useCesium } from 'resium';
import OnMapButton from './OnMapButton';
import {
  Cartesian3,
  Cartographic,
  Math as CeMath,
  defined,
  Cartesian2,
} from 'cesium';
import {
  getCanvasCenter,
  getTopDownCameraDeviationAngle,
} from '../../utils/cesiumHelpers';
import { useDispatch } from 'react-redux';
import { useViewerIsMode2d, setIsMode2d } from '../../store/slices/viewer';
import { setLeafletView } from '../CustomViewer/utils';

import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
import { CameraPositionAndOrientation } from '../../..';

type Props = {
  children?: ReactNode;
};

const MIN_TOP_DOWN_DISTANCE = 50;

export const MapTypeSwitcher = (props: Props) => {
  const { viewer } = useCesium();
  const dispatch = useDispatch();
  const isMode2d = useViewerIsMode2d();

  const [prevCamera3d, setPrevCamera3d] =
    useState<CameraPositionAndOrientation | null>(null);
  const [prevCamera2dPosition, setPrevCamera2dPosition] =
    useState<Cartesian3 | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);
  // TODO provide mapFramework context via props for UI?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicMapContext: any = useContext(TopicMapContext);
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

        const duration = getTopDownCameraDeviationAngle(viewer) * 2;
        setPrevDuration(duration);
        console.log('animation duration', duration);

        // evaluate angles for animation duration

        setPrevCamera3d({
          position: viewer.camera.position.clone(),
          direction: viewer.camera.direction.clone(),
          up: viewer.camera.up.clone(),
        });

        // move the leaflet view to start position of animation to already allow fetching tiles if close
        setLeafletView(viewer, leaflet);

        viewer.camera.flyTo({
          destination,
          // TOP DOWN by default
          duration,
          complete: () => {
            setLeafletView(viewer, leaflet);
            setPrevCamera2dPosition(viewer.camera.position.clone());
            dispatch(setIsMode2d(true));
          },
        });
      } else {
        dispatch(setIsMode2d(false));
        if (prevCamera2dPosition && prevCamera3d) {
          if (
            Cartesian3.equals(viewer.camera.position, prevCamera2dPosition) !==
            true
          ) {
            console.log(
              'camera position changed, aborting 2d to 3d transition'
            );
            return;
          }

          // wait until the css transition is done
          setTimeout(() => {
            viewer.camera.flyTo({
              destination: prevCamera3d.position,
              orientation: {
                direction: prevCamera3d.direction,
                up: prevCamera3d.up,
              },
              duration: prevDuration,
            });
          }, 500);
        }
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
