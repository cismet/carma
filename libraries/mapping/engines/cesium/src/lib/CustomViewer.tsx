import {
  memo,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
} from "react";
import { useSelector } from "react-redux";

import { Color, Viewer, HeadingPitchRange, Rectangle, SceneMode } from "cesium";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { selectViewerHome, selectViewerHomeOffset } from "./slices/cesium";

import ElevationControl from "./components/controls/ElevationControl";

import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useCesiumContext } from "./hooks/useCesiumContext";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useCesiumHashUpdater } from "./hooks/useCesiumHashUpdater";
import { useCesiumWhenHidden } from "./hooks/useCesiumWhenHidden";
import { useInitializeViewer } from "./hooks/useInitializeViewer";
import { useLogCesiumRenderIn2D } from "./hooks/useLogCesiumRenderIn2D";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import useTweakpane from "./hooks/useTweakpane";
import { useTilesets } from "./hooks/useTilesets";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
};

export type CustomViewerProps = {
  children?: ReactNode;
  containerRef?: RefObject<HTMLDivElement>;
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
    selectionIndicator = false,
    globeOptions = {
      baseColor: Color.TRANSPARENT,
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

  useTilesets();

  useEffect(() => {
    if (containerRef?.current) {
      const options: Viewer.ConstructorOptions = {
        //full // equals style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        // Quality and performance
        msaaSamples: 4,
        requestRenderMode: true,
        scene3DOnly: true,
        sceneMode: SceneMode.SCENE3D,
        selectionIndicator: selectionIndicator,
        targetFrameRate: CESIUM_TARGET_FRAME_RATE,
        useBrowserRecommendedResolution: true,
        contextOptions: { webgl: { alpha: true } },

        // Hide UI components
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        sceneModePicker: false,
        skyBox: false,
        timeline: false,
      };
      try {
        viewerRef.current = new Viewer(containerRef.current, options);
        const container = viewerRef.current.container;
        const cesiumViewer = container.children[0] as HTMLElement;
        const cesiumViewerCesiumWidgetContainer = cesiumViewer
          .children[0] as HTMLElement;
        const cesiumWidget = cesiumViewerCesiumWidgetContainer
          .children[0] as HTMLElement;
        cesiumViewer.style.backgroundColor = "transparent";
        cesiumViewerCesiumWidgetContainer.style.backgroundColor = "transparent";
        cesiumWidget.style.backgroundColor = "transparent";
      } catch (error) {
        console.error("Error initializing viewer:", error);
      }
    }
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  console.debug("RENDER: [CESIUM] CustomViewer");

  return (
    <>
      <ElevationControl show={false} />
      {children}
    </>
  );
}

export default CustomViewer;
