import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  Color,
  HeadingPitchRange,
  Rectangle,
  Viewer,
} from "cesium";
import { Viewer as ResiumViewer } from "resium";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useCesiumContext } from "./CesiumContextProvider";
import {
  selectViewerHome,
  selectViewerHomeOffset,
  selectViewerIsMode2d,
  selectShowSecondaryTileset,
} from "./slices/cesium";

import { BaseTilesets } from "./components/BaseTilesets";
import ElevationControl from "./components/controls/ElevationControl";

import useTransitionTimeout from "./hooks/useTransitionTimeout";
import useDisableSSCC from "./hooks/useDisableSSCC";
import useTweakpane from "./hooks/useTweakpane";
import useCameraRollSoftLimiter from './hooks/useCameraRollSoftLimiter';
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";

import { encodeScene, replaceHashRoutedHistory } from "./utils/hashHelpers";
import useInitializeViewer from "./hooks/useInitializeViewer";
import { useLogCesiumRenderIn2D } from "./hooks/useLogCesiumRenderIn2D";
import { cameraToCartographicDegrees } from "./utils/cesiumHelpers";

type CustomViewerProps = {
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
  globe?: {
    // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
    baseColor?: Color;
    cartographicLimitRectangle?: Rectangle;
    showGroundAtmosphere?: boolean;
    showSkirts?: boolean;
  };
  viewerOptions?: {
    resolutionScale?: number;
  };
  minimapLayerUrl?: string;
};

const DEFAULT_RESOLUTION_SCALE = 1;
export const TRANSITION_DELAY = 1000;
const CESIUM_TARGET_FRAME_RATE = 120;

export function CustomViewer(props: CustomViewerProps) {
  const { viewer, setViewer } = useCesiumContext();
  const home = useSelector(selectViewerHome);
  const homeOffset = useSelector(selectViewerHomeOffset);
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const isMode2d = useSelector(selectViewerIsMode2d)
  //const isAnimating = useViewerIsAnimating();

  const {
    children,
    className,
    selectionIndicator = false,
    globe: globeProps = {
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
    minPitchRange
  } = props;

  const previousViewerRef = useRef<Viewer | null>(null); // track viewer changes
  const previousIsMode2d = useRef<boolean | null>(null);
  const previousIsSecondaryStyle = useRef<boolean | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicMapContext: any =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const leaflet =
    topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  // DEV TWEAKPANE
  useTweakpane()

  const viewerRef = useCallback((node) => {
    if (node !== null) {
      //setComponentStateViewer(node.cesiumElement);
      setViewer && setViewer(node.cesiumElement);
    }
  }, []);

  const location = useLocation();

  useInitializeViewer(viewer, home, homeOffset, leaflet);

  useLogCesiumRenderIn2D();
  useTransitionTimeout();
  useDisableSSCC();
  useCameraRollSoftLimiter();
  useCameraPitchSoftLimiter(22, 8);
  useCameraPitchEasingLimiter(minPitch, { easingRangeDeg: minPitchRange });

  useEffect(() => {
    if (viewer && enableLocationHashUpdate && !isMode2d) {
      console.log(
        "HOOK: update Hash, route or style changed",
        isSecondaryStyle,
      );
      replaceHashRoutedHistory(
        encodeScene(viewer, { isSecondaryStyle }),
        location.pathname,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, isMode2d, enableLocationHashUpdate, location.pathname, isSecondaryStyle]);

  useEffect(() => {
    if (viewer && containerRef?.current) {
      const resizeObserver = new ResizeObserver(() => {
        console.log("HOOK: resize cesium container");
        if (containerRef?.current) {
          viewer.canvas.width = containerRef.current.clientWidth;
          viewer.canvas.height = containerRef.current.clientHeight;
          viewer.canvas.style.width = "100%";
          viewer.canvas.style.height = "100%";
        }
      });
      if (containerRef?.current) {
        resizeObserver.observe(containerRef.current);
      }
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [viewer, containerRef, isMode2d]);

  useEffect(() => {
    if (viewer && viewer.scene.globe) {
      console.log("HOOK: globe setting changed");
      // set the globe props
      if (globeProps.baseColor !== undefined) {
        viewer.scene.globe.baseColor = globeProps.baseColor;
      }
      if (globeProps.cartographicLimitRectangle !== undefined) {
        viewer.scene.globe.cartographicLimitRectangle = globeProps.cartographicLimitRectangle;
      }
      if (globeProps.showGroundAtmosphere !== undefined) {
        viewer.scene.globe.showGroundAtmosphere = globeProps.showGroundAtmosphere;
      }
      if (globeProps.showSkirts !== undefined) {
        viewer.scene.globe.showSkirts = globeProps.showSkirts;
      }
    }
  }, [viewer, globeProps.baseColor, globeProps.cartographicLimitRectangle, globeProps.showGroundAtmosphere, globeProps.showSkirts]);

  useEffect(() => {
    // hook hide Cesium Layers in 2d
    if (viewer) {
      if (isMode2d) {
        setTimeout(() => {
          for (let i = 0; i < viewer.imageryLayers.length; i++) {
            const layer = viewer.imageryLayers.get(i);
            if (layer) {
              layer.show = false; // Hide the layer
              console.info("HOOK: [CESIUM] hiding cesium imagery layer", i)
            }
          }
        }, TRANSITION_DELAY);
      } else {
        for (let i = 0; i < viewer.imageryLayers.length; i++) {
          const layer = viewer.imageryLayers.get(i);
          if (layer) {
            layer.show = true; // unHide the layer
            console.info("HOOK: [CESIUM] howing cesium imagery layer", i)
          }
        }
      }
    }
  }, [viewer, isMode2d]);


  useEffect(() => {
    // init hook
    if (viewer) {
      if (viewer !== previousViewerRef.current) {
        console.log("HOOK: viewer changed, remove default layers");
        // TODO use CesiumWidget to have less Boilerplate
        viewer.imageryLayers.removeAll();
      }
      if (viewer !== previousViewerRef.current || isMode2d !== previousIsMode2d.current || isSecondaryStyle !== previousIsSecondaryStyle.current) {
        previousIsMode2d.current = isMode2d;
        previousIsSecondaryStyle.current = isSecondaryStyle;
        previousViewerRef.current = viewer;
      }
    }
  }, [
    viewer,
    isSecondaryStyle,
    isMode2d,
  ]);

  useEffect(() => {
    // update hash hook
    if (viewer) {
      console.log("HOOK: [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to update hash");
      const moveEndListener = async () => {
        // let TopicMap/leaflet handle the view change in 2d Mode
        if (viewer.camera.position && !isMode2d && enableLocationHashUpdate) {
          const camDeg = cameraToCartographicDegrees(viewer.camera)
          console.log("LISTENER: Cesium moveEndListener encode viewer to hash", isSecondaryStyle, camDeg);
          const encodedScene = encodeScene(viewer, { isSecondaryStyle });
          replaceHashRoutedHistory(encodedScene, location.pathname);
        }
      };
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }

  }, [
    viewer,
    location.pathname,
    isSecondaryStyle,
    isMode2d,
    enableLocationHashUpdate,
  ]);

  console.info("RENDER: [CESIUM] CustomViewer");

  return (
    <>
      <ElevationControl show={false} />
      <ResiumViewer
        ref={viewerRef}
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

export default CustomViewer;
