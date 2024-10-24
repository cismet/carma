import {
  memo,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useSelector } from "react-redux";

import { Color, HeadingPitchRange, Rectangle } from "cesium";
import { Viewer as ResiumViewer } from "resium";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  selectViewerHome,
  selectViewerHomeOffset,
  selectViewerIsMode2d,
  selectShowSecondaryTileset,
} from "./slices/cesium";

import { BaseTilesets } from "./components/BaseTilesets";
import ElevationControl from "./components/controls/ElevationControl";


import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useCesiumViewer } from "./hooks/useCesiumViewer";
import { useCesiumContext } from './hooks/useCesiumContext';
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useCesiumHashUpdater } from './hooks/useCesiumHashUpdater';
import { useCesiumWhenHidden } from "./hooks/useCesiumWhenHidden";
import { useInitializeViewer } from "./hooks/useInitializeViewer";
import { useLogCesiumRenderIn2D } from "./hooks/useLogCesiumRenderIn2D";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import useTweakpane from "./hooks/useTweakpane";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
}

export type CustomViewerProps = {
  children?: ReactNode;
  containerRef?: RefObject<HTMLDivElement>;
  className?: string;
  postInit?: () => void;

  enableLocationHashUpdate?: boolean;

  // Init
  homeOrientation?: HeadingPitchRange;
  // UI
  // TODO replace with external callbacks?
  //showControls?: boolean;
  //showHome?: boolean;
  //showLockCenter?: boolean;
  //showOrbit?: boolean;

  // override resium UI defaults
  infoBox?: boolean;
  selectionIndicator?: boolean;

  //disableZoomRestrictions?: boolean; // todo
  //minZoom?: number; // todo
  minPitch?: number;
  minPitchRange?: number;
  globeOptions?: GlobeOptions;
  viewerOptions?: {
    resolutionScale?: number;
  };
  minimapLayerUrl?: string;
};

const DEFAULT_RESOLUTION_SCALE = 1;
export const TRANSITION_DELAY = 1000;
const CESIUM_TARGET_FRAME_RATE = 120;

export function CustomViewer(props: CustomViewerProps) {
  const { viewerRef } = useCesiumContext();
  const home = useSelector(selectViewerHome);
  const homeOffset = useSelector(selectViewerHomeOffset);
  //const isAnimating = useViewerIsAnimating();

  const {
    children,
    className,
    selectionIndicator = false,
    globeOptions = {
      baseColor: Color.WHITESMOKE,
      cartographicLimitRectangle: undefined,
      showGroundAtmosphere: false,
      showSkirts: false,
    },
    viewerOptions = {
      resolutionScale: DEFAULT_RESOLUTION_SCALE,
    },
    containerRef,
    enableLocationHashUpdate = true,
    minPitch,
    minPitchRange,
  } = props;



  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicMapContext: any =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const leaflet = topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  // DEV TWEAKPANE
  useTweakpane();

  useInitializeViewer({ home, homeOffset, leaflet, containerRef });
  useCesiumGlobe({ globeOptions: globeOptions });

  useLogCesiumRenderIn2D();

  useTransitionTimeout();
  useDisableSSCC();
  useCameraRollSoftLimiter();
  useCameraPitchSoftLimiter(22, 8);
  useCameraPitchEasingLimiter(minPitch, { easingRangeDeg: minPitchRange });

  useCesiumWhenHidden({ delay: TRANSITION_DELAY });
  useCesiumHashUpdater({ enableLocationHashUpdate });

  console.info("RENDER: [CESIUM] CustomViewer");

  return (
    <>
      <ElevationControl show={false} />
      <ResiumViewer
        ref={(node) => {
          if (node !== null) {
            viewerRef.current = node.cesiumElement ?? null;
            //viewer = node.cesiumElement ?? null;
          }
        }}
        className={className}
        // Resium ViewerOtherProps
        full // equals style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}`
        // Cesium Props
        // see https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html#.ConstructorOptions for defaults

        // quality and performance
        msaaSamples={4}
        //useBrowserRecommendedResolution={true} // false allows crisper image, does not ignore devicepixel ratio
        //resolutionScale={window.devicePixelRatio} // would override dpr
        scene3DOnly={true} // No 2D map resources loaded
        //sceneMode={SceneMode.SCENE3D} // Default but explicit

        // hide UI
        animation={false}
        //resolutionScale={adaptiveResolutionScale}
        baseLayer={false}
        baseLayerPicker={false}
        fullscreenButton={false}
        geocoder={false}
        targetFrameRate={CESIUM_TARGET_FRAME_RATE}
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
      </ResiumViewer>
    </>
  );
}

export default memo(CustomViewer);
