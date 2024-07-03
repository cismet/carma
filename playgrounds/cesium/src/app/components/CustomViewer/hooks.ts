import { useEffect, useState } from 'react';
import {
  Viewer,
  BoundingSphere,
  Cartesian3,
  PerspectiveFrustum,
  Math as CeMath,
} from 'cesium';
import { useDispatch } from 'react-redux';
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
} from '../../store/slices/viewer';
import { decodeSceneFromLocation } from './utils';
import { setupSecondaryStyle } from './components/baseTileset.hook';
import { useLocation } from 'react-router-dom';

const useInitializeViewer = (
  viewer: Viewer | null,
  home: Cartesian3,
  homeOffset: Cartesian3
) => {
  const [hash, setHash] = useState<string | null>(null); // effectively hook should run only once
  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    if (viewer && hash === null) {
      const locationHash = window.location.hash ?? '';
      setHash(locationHash);
      console.log('HOOK: set initialHash', locationHash);

      const hashParams = locationHash.split('?')[1];
      const sceneFromHashParams = decodeSceneFromLocation(hashParams);
      const { camera, isSecondaryStyle } = sceneFromHashParams;
      const { latitude, longitude, height, heading, pitch } = camera;

      if (viewer.camera.frustum instanceof PerspectiveFrustum) {
        viewer.camera.frustum.fov = Math.PI/4;
      }

      // TODO enable 2D Mode if zoom value is present in hash on startup

      if (isSecondaryStyle) {
        console.log('HOOK: set secondary style from hash');
        setupSecondaryStyle(viewer);
        dispatch(setShowPrimaryTileset(false));
        dispatch(setShowSecondaryTileset(true));
      }

      if (sceneFromHashParams && longitude && latitude) {
        console.log('HOOK: init Viewer set camera from hash');
        viewer.camera.setView({
          destination: Cartesian3.fromRadians(
            longitude,
            latitude,
            height ?? 1000 // restore height if missing
          ),
          orientation: {
            heading: heading ?? 0,
            pitch: pitch ?? -CeMath.PI_OVER_TWO,
          },
        });

        /*
        (async () => {
          replaceHashRoutedHistory(
            await encodeScene({ viewer, isSecondaryStyle }),
            location.pathname
          );
        })();
        */
      } else {
        console.log('HOOK: initViewer no hash, using home');
        viewer.camera.lookAt(home, homeOffset);
        viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
        });
        // triggers url hash update on moveend
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, home, homeOffset, location.pathname, hash]);
};

export default useInitializeViewer;
