import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { Color, HeadingPitchRange, Viewer, BoundingSphere } from 'cesium';
import { Viewer as ResiumViewer } from 'resium';
import Crosshair from '../UI/Crosshair';
import SearchWrapper from './components/SearchWrapper';

import {
  useGlobeBaseColor,
  useShowTileset,
  useViewerHome,
  useViewerHomeOffset,
} from '../../store/slices/viewer';
import { BaseTileset } from './components/BaseTileset';
import ControlsUI from './components/ControlsUI';

type CustomViewerProps = {
  children?: ReactNode;
  className?: string;
  postInit?: () => void;

  // Init
  homeOrientation?: HeadingPitchRange;
  // UI
  showControls?: boolean;
  showDebug?: boolean;
  showHome?: boolean;
  showLockCenter?: boolean;
  showOrbit?: boolean;
  showCrosshair?: boolean;

  // override resium UI defaults
  infoBox?: boolean;
  selectionIndicator?: boolean;

  //disableZoomRestrictions?: boolean; // todo
  //minZoom?: number; // todo

  globeColor?: Color;
};

function CustomViewer(props: CustomViewerProps) {
  const home = useViewerHome();
  const homeOffset = useViewerHomeOffset();
  const globeBaseColor = useGlobeBaseColor();
  const showTileset = useShowTileset();

  const {
    children,
    className,
    showCrosshair = true,
    showControls = true,
    showHome = true,
    showOrbit = true,
    showDebug = true,

    infoBox = false,
    selectionIndicator = false,

    globeColor = globeBaseColor,
  } = props;

  const [viewer, setViewer] = useState<Viewer | null>(null);

  const viewerRef = useCallback((node) => {
    if (node !== null) {
      setViewer(node.cesiumElement);
    }
  }, []);

  useEffect(() => {
    if (viewer && home && homeOffset) {
      console.log('Setting home position', home, homeOffset);
      // Set the initial position of the camera a bit further away, to not show the globe at start
      viewer.camera.lookAt(home, homeOffset);
      viewer.camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
        duration: 2,
      });
    }
  }, [viewer, home, homeOffset]);

  useEffect(() => {
    if (!viewer) return;
    // remove default imagery
    viewer.imageryLayers.removeAll();
    // set the globe color
    viewer.scene.globe.baseColor = globeColor;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    const moveEndListener = () => {
      console.log('moveEndListener');
    };

    viewer.camera.moveEnd.addEventListener(moveEndListener);
    return () => {
      viewer.camera.moveEnd.removeEventListener(moveEndListener);
    };
  }, [viewer]);

  let style;

  return (
    <ResiumViewer
      ref={viewerRef}
      className={className}
      // Resium ViewerOtherProps
      full // equals style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}`
      // Cesium Props
      // see https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html#.ConstructorOptions for defaults

      // quality and performance
      msaaSamples={2}
      useBrowserRecommendedResolution={false} // crisper image, does not ignore devicepixel ratio
      // resolutionScale={window.devicePixelRatio} // would override dpr
      scene3DOnly={true} // No 2D map resources loaded
      // sceneMode={SceneMode.SCENE3D} // Default but explicit

      // hide UI
      animation={false}
      baseLayerPicker={false}
      fullscreenButton={false}
      geocoder={false}
      homeButton={false}
      infoBox={false}
      sceneModePicker={false}
      selectionIndicator={selectionIndicator}
      timeline={false}
      navigationHelpButton={false}
      navigationInstructionsInitiallyVisible={false}
    >
      {showTileset && <BaseTileset />}
      {children}
      {showControls && (
        <ControlsUI
          showDebug={showDebug}
          showHome={showHome}
          showOrbit={showOrbit}
          searchComponent={<SearchWrapper />}
        />
      )}
      {showCrosshair && <Crosshair lineColor="white" />}
    </ResiumViewer>
  );
}

export default CustomViewer;
