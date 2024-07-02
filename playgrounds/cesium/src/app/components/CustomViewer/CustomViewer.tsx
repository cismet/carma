import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Color,
  HeadingPitchRange,
  Viewer,
  Math as CeMath,
  PerspectiveFrustum,
} from 'cesium';
import { Viewer as ResiumViewer } from 'resium';
import Crosshair from '../UI/Crosshair';
import SearchWrapper from './components/SearchWrapper';

import {
  useShowSecondaryTileset,
  useViewerHome,
  useViewerHomeOffset,
  useViewerIsMode2d,
} from '../../store/slices/viewer';
import { BaseTilesets } from './components/BaseTilesets';
import ControlsUI from './components/ControlsUI';
import { encodeScene, replaceHashRoutedHistory } from './utils';
import { ResizeableContainer } from './components/ResizeableContainer';
import { useLocation } from 'react-router-dom';
import useInitializeViewer from './hooks';
import TopicMap from './components/TopicMap';
import { TopicMapContextProvider } from 'react-cismap/contexts/TopicMapContextProvider';
import { useTweakpaneCtx } from '@carma/debug-ui';

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
  const isMode2d = useViewerIsMode2d();
  //const isAnimating = useViewerIsAnimating();

  const {
    children,
    className,
    showCrosshair = true,
    showControls = true,
    showHome = true,
    showOrbit = true,
    showDebug = false,
    infoBox = false,
    selectionIndicator = false,

    globeColor = globeBaseColor,
  } = props;

  const [viewer, setViewer] = useState<Viewer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // const topicMapContext: any = useContext(TopicMapContext);
  // const leafletElement =    topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  const [isUserAction, setIsUserAction] = useState(false);
  // DEV TWEAKPANE

  // Create a callback function to set the FOV

  useTweakpaneCtx(
    {
      title: 'Camera Settings',
    },
    {
      get fov() {
        return (viewer?.scene.camera.frustum as PerspectiveFrustum)?.fov || 1.0;
      },

      set fov(value: number) {
        if (
          viewer &&
          viewer.scene.camera.frustum instanceof PerspectiveFrustum &&
          !Number.isNaN(value)
        ) {
          viewer.scene.camera.frustum.fov = value;
        }
      },
    },

    [
      {
        name: 'fov',
        label: 'FOV',
        min: 0,
        max: Math.PI,
        step: 0.01,
        format: (v) => `${parseFloat(CeMath.toDegrees(v).toFixed(2))}°`,
      },
    ]
  );

  useTweakpaneCtx(
    {
      title: 'Scene Settings',
    },
    {
      get resolutionScale() {
        return viewer?.resolutionScale || 1.0;
      },
      set resolutionScale(v) {
        if (viewer) {
          viewer.resolutionScale = v;
        }
      },
    },

    [
      {
        name: 'resolutionScale',
        options: {
          'LQ 1/8': 1 / 8,
          'LQ 1/4': 1 / 4,
          'LQ 1/3': 1 / 3,
          'SQ 1/2': 1 / 2,
          'HQ 1 pixelPerfect': 1,
          'HQ 2': 2,
          'HQ 3': 3,
          'HQ 4': 4,
        },
        //label: 'Globe Base Color',
      },
    ]
  );

  useEffect(() => {
    if (!viewer) return;

    const canvas = viewer.canvas;

    // Ensure the canvas can receive focus
    canvas.setAttribute('tabindex', '0');

    // Event handlers
    const handleFocus = () => setIsUserAction(true);
    const handleBlur = () => setIsUserAction(false);
    const handleMouseDown = () => {
      canvas.focus();
      setIsUserAction(true);
    };

    // Add event listeners
    canvas.addEventListener('focus', handleFocus);
    canvas.addEventListener('blur', handleBlur);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseDown); // Track mouse move as interaction

    // Cleanup event listeners on unmount
    return () => {
      canvas.removeEventListener('focus', handleFocus);
      canvas.removeEventListener('blur', handleBlur);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseDown);
    };
  }, [viewer]);

  const viewerRef = useCallback((node) => {
    if (node !== null) {
      setViewer(node.cesiumElement);
    }
  }, []);

  const location = useLocation();

  useInitializeViewer(viewer, home, homeOffset);

  useEffect(() => {
    if (viewer) {
      console.log(
        'HOOK: update Hash, route or style changed',
        isSecondaryStyle
      );
      replaceHashRoutedHistory(
        encodeScene(viewer, { isSecondaryStyle }),
        location.pathname
      );
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
        const encodedScene = encodeScene(viewer, { isSecondaryStyle });

        // let TopicMap/leaflet handle the view change in 2d Mode
        !isMode2d && replaceHashRoutedHistory(encodedScene, location.pathname);

        if (isUserAction && !isMode2d) {
          // remove roll from camera orientation
          const rollDeviation =
            Math.abs(CeMath.TWO_PI - viewer.camera.roll) % CeMath.TWO_PI;
          if (rollDeviation > 0.02) {
            console.log('LISTENER HOOK: flyTo reset roll', rollDeviation);
            const duration = Math.min(rollDeviation, 1);
            viewer.camera.flyTo({
              destination: viewer.camera.position,
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: 0,
              },
              duration,
            });
          }
          // TODO: this will mess with url state, as TopicMap also updates the hash
          //showDebug && setLeafletView(viewer, leafletElement);
        }
      }
    };

    viewer.camera.moveEnd.addEventListener(moveEndListener);
    return () => {
      viewer.camera.moveEnd.removeEventListener(moveEndListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewer,
    location.pathname,
    isSecondaryStyle,
    //leafletElement,
    isUserAction,
  ]);

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
      <TopicMapContextProvider>
        {showControls && (
          <ControlsUI
            showDebug={showDebug}
            showHome={showHome}
            showOrbit={showOrbit}
            searchComponent={<SearchWrapper />}
          />
        )}
        {showCrosshair && <Crosshair lineColor="white" />}
        <ResizeableContainer
          enableDragging={showDebug}
          start={showDebug ? 5 : 0}
        >
          <TopicMap />
        </ResizeableContainer>{' '}
      </TopicMapContextProvider>
    </ResiumViewer>
  );
}

export default CustomViewer;
