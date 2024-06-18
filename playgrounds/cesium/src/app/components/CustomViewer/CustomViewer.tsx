import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Color, HeadingPitchRange, Viewer, Math as CeMath } from 'cesium';
import { Viewer as ResiumViewer } from 'resium';
import Crosshair from '../UI/Crosshair';
import SearchWrapper from './components/SearchWrapper';

import {
  useShowSecondaryTileset,
  useViewerHome,
  useViewerHomeOffset,
} from '../../store/slices/viewer';
import { BaseTilesets } from './components/BaseTilesets';
import ControlsUI from './components/ControlsUI';
import { replaceHashRoutedHistory } from './utils';
import { ResizeableContainer } from './components/ResizeableContainer';
import { useLocation } from 'react-router-dom';
import useInitializeViewer from './hooks';
import { getCesiumViewerZoomLevel } from '../../utils/cesiumHelpers';

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
  const globeBaseColor = Color.WHITE; //useGlobeBaseColor();
  const isSecondaryStyle = useShowSecondaryTileset();
  //const isAnimating = useViewerIsAnimating();

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

  const location = useLocation();

  useEffect(() => {
    console.log('HOOK: hashRoute changed', location.pathname);
    viewer &&
      replaceHashRoutedHistory(viewer, location.pathname, isSecondaryStyle);
  }, [location.pathname, viewer, isSecondaryStyle]);

  useInitializeViewer(viewer, home, homeOffset);

  useEffect(() => {
    if (viewer) {
      console.log('HOOK: update Hash, style changed', isSecondaryStyle);
      (async () => {
        await replaceHashRoutedHistory(
          viewer,
          location.pathname,
          isSecondaryStyle
        );
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, location.pathname, isSecondaryStyle]);

  useEffect(() => {
    console.log('HOOK: init or globeColor changed');
    if (!viewer) return;
    // set the globe color
    const { scene } = viewer;
    scene.globe.baseColor = globeColor;
    viewer.imageryLayers.removeAll();
    scene.screenSpaceCameraController.enableCollisionDetection = true;
  }, [viewer, globeColor]);

  useEffect(() => {
    console.log('HOOK: viewer changed', isSecondaryStyle);
    if (!viewer) return;
    // remove default imagery

    const moveEndListener = async () => {
      if (viewer.camera.position) {
        console.log('LISTENER: moveEndListener', isSecondaryStyle);
        const stateObj = await replaceHashRoutedHistory(
          viewer,
          location.pathname,
          isSecondaryStyle
        );
        /*
        const headingInDegrees = CeMath.toDegrees(viewer.camera.heading);
        const pitchInDegrees = CeMath.toDegrees(viewer.camera.pitch);
        const tolerance = 5;

        if (
          (headingInDegrees % 360 >= 360 - tolerance ||
            headingInDegrees % 360 <= tolerance) &&
          pitchInDegrees <= tolerance - 90
        ) {
         */
        //console.log('scene', scene);
        const leafletUrl = `https://carma-dev-deployments.github.io/topicmaps-kulturstadtplan/#/?${stateObj?.sceneHash}`;
        console.info('view in leaflet:', leafletUrl);
        //}
      }
    };

    viewer.camera.moveEnd.addEventListener(moveEndListener);
    return () => {
      viewer.camera.moveEnd.removeEventListener(moveEndListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, location.pathname, isSecondaryStyle]);

  console.log('RENDER: CustomViewer');

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
      skyBox={false}
    >
      <BaseTilesets />
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
      {/*
      <ResizeableContainer>
        <div></div>
      </ResizeableContainer>
      */}
    </ResiumViewer>
  );
}

export default CustomViewer;
