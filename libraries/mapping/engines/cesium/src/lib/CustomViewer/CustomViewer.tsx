import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";

import {
  BoundingSphere,
  Cartesian3,
  Color,
  HeadingPitchRange,
  Math as CeMath,
  OrthographicFrustum,
  PerspectiveFrustum,
  Rectangle,
  Viewer,
} from "cesium";
import { Viewer as ResiumViewer } from "resium";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useTweakpaneCtx } from "@carma-commons/debug";

import {
  setIsAnimating,
  setScreenSpaceCameraControllerEnableCollisionDetection,
  setScreenSpaceCameraControllerMaximumZoomDistance,
  setScreenSpaceCameraControllerMinimumZoomDistance,
  useScreenSpaceCameraControllerEnableCollisionDetection,
  useScreenSpaceCameraControllerMaximumZoomDistance,
  useScreenSpaceCameraControllerMinimumZoomDistance,
  useShowSecondaryTileset,
  useViewerHome,
  useViewerHomeOffset,
  useViewerIsMode2d,
} from "../CustomViewerContextProvider/slices/cesium";
import { cameraToCartographicDegrees, pickViewerCanvasCenter, resolutionFractions } from "../utils";
import { formatFractions } from "../utils/formatters";
import { useCesiumCustomViewer } from "../CustomViewerContextProvider";
import { BaseTilesets } from "./components/BaseTilesets";
import { encodeScene, replaceHashRoutedHistory } from "./utils";
import { useInitializeViewer, useLogCesiumRenderIn2D } from "./hooks";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import useDisableSSCC from "./hooks/useDisableSSCC";


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
const CESIUM_CAMERA_MIN_PITCH = CeMath.toRadians(-20);
const CESIUM_CAMERA_MIN_PITCH_RESET_TO = CeMath.toRadians(-30);


function CustomViewer(props: CustomViewerProps) {
  const { viewer, setViewer, imageryLayer } = useCesiumCustomViewer();
  const dispatch = useDispatch();
  const home = useViewerHome();
  const homeOffset = useViewerHomeOffset();
  const isSecondaryStyle = useShowSecondaryTileset();
  const isMode2d = useViewerIsMode2d();
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
  } = props;

  const [viewportLimit, setViewportLimit] = useState<number>(4);
  const [viewportLimitDebug, setViewportLimitDebug] = useState<boolean>(false);
  const minZoomDistance = useScreenSpaceCameraControllerMinimumZoomDistance();
  const maxZoomDistance = useScreenSpaceCameraControllerMaximumZoomDistance();
  const collisions = useScreenSpaceCameraControllerEnableCollisionDetection();
  const setMaxZoomDistance = (v: number) => dispatch(setScreenSpaceCameraControllerMaximumZoomDistance(v));
  const setMinZoomDistance = (v: number) => dispatch(setScreenSpaceCameraControllerMinimumZoomDistance(v));
  const setCollisions = (v: boolean) => dispatch(setScreenSpaceCameraControllerEnableCollisionDetection(v));


  const previousViewerRef = useRef<Viewer | null>(null); // track viewer changes
  const previousIsMode2d = useRef<boolean | null>(null);
  const previousIsSecondaryStyle = useRef<boolean | null>(null);

  const baseResolutionScale = viewerOptions.resolutionScale || DEFAULT_RESOLUTION_SCALE;
  const [adaptiveResolutionScale, setAdaptiveResolutionScale] = useState<number>(baseResolutionScale);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicMapContext: any =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const leaflet =
    topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  const [isUserAction, setIsUserAction] = useState(false);
  // DEV TWEAKPANE


  // Not neede anymore
  /*
    useEffect(() => {
      if (topicMapContext && isMode2d) {
        const handleLeafletMoveEnd = (event: LeafletEvent | { target: LeafletMap }) => {
          const center = event.target?.getCenter();
          const zoom = event.target?.getZoom();
  
          const mapLocation = {
            lat: center.lat,
            lng: center.lng,
            zoom,
          };
  
  
          if (viewer && mapLocation.lat && mapLocation.lng && mapLocation.zoom) {
            console.log("HOOK: zoom handleLeafletMoveEnd", mapLocation);
            //leafletToCesiumCamera(viewer, mapLocation);
          }
        };
  
        console.log("HOOK: topicMapContext changed", topicMapContext);
        const leaflet =
          topicMapContext?.routedMapRef?.leafletMap?.leafletElement;
        if (leaflet) {
          console.log("HOOK: leaflet changed", leaflet);
        }
        if (leaflet) {
          console.log("HOOK: [CustomViewer] zoom initial position from leaflet")
          handleLeafletMoveEnd({ target: leaflet });
          leaflet.on("moveend", handleLeafletMoveEnd);
          return () => {
            leaflet.off("moveend", handleLeafletMoveEnd);
          };
        }
  
      }
    }, [topicMapContext, viewer, isMode2d]);
    */


  useTweakpaneCtx(
    {
      title: "Camera Settings",
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
      get orthographic() {
        return viewer?.scene.camera.frustum instanceof OrthographicFrustum;
      },
      set orthographic(value: boolean) {
        if (viewer) {
          if (
            value &&
            viewer.scene.camera.frustum instanceof PerspectiveFrustum
          ) {
            viewer.scene.camera.switchToOrthographicFrustum();
          } else if (
            viewer.scene.camera.frustum instanceof OrthographicFrustum
          ) {
            viewer.scene.camera.switchToPerspectiveFrustum();
          }
        }
      },
    },

    [
      {
        name: "fov",
        label: "FOV",
        min: Math.PI / 400,
        max: Math.PI,
        step: 0.01,
        format: (v) => `${parseFloat(CeMath.toDegrees(v).toFixed(2))}°`,
      },
      {
        name: "orthographic",
        label: "Orthographic",
        type: "boolean",
      },
    ],
  );

  useTweakpaneCtx(
    {
      title: "Scene Settings",
    },
    {
      get viewportLimitDebug() {
        return viewportLimitDebug;
      },
      set viewportLimitDebug(value: boolean) {
        setViewportLimitDebug(value);
      },
      get viewportLimit() {
        return viewportLimit;
      },
      set viewportLimit(value: number) {
        !Number.isNaN(value) && setViewportLimit(value);
      },
      get resolutionScale() {
        // Find the closest value in the array to the current resolutionScale and return its index
        const currentValue = viewer ? viewer.resolutionScale : 1;
        const closestIndex = resolutionFractions.findIndex(
          (value) => value === currentValue,
        );
        return closestIndex !== -1
          ? closestIndex
          : resolutionFractions.length - 1; // Default to the last index if not found
      },
      set resolutionScale(index) {
        // Use the index to set the resolutionScale from the array
        if (viewer && index >= 0 && index < resolutionFractions.length) {
          const value = resolutionFractions[index];
          viewer.resolutionScale = value;
        }
      },
    },

    [
      { name: "viewportLimit", min: 1.5, max: 10, step: 0.5 },
      { name: "viewportLimitDebug" },
      {
        name: "resolutionScale",
        min: 0, // The minimum index
        max: resolutionFractions.length - 1, // The maximum index
        step: 1, // Step by index
        format: (v: number) => formatFractions(resolutionFractions[v]),
      },
    ],
  );

  useTweakpaneCtx(
    {
      title: "Scene Camera Controller",
    },
    {
      get maxZoomDistance() {
        return maxZoomDistance
      },
      set maxZoomDistance(value: number) {
        if (!isNaN(value)) {
          // TODO add debounce for all Setters
          setMaxZoomDistance(value)
        }
      },
      get minZoomDistance() {
        return minZoomDistance
      },
      set minZoomDistance(value: number) {
        if (!isNaN(value)) {
          setMinZoomDistance(value)
        }
      },

      get collisions() {
        return collisions
      },
      set collisions(v: boolean) {
        setCollisions(v)
      }
    },
    [
      { name: "collisions" },
      { name: "maxZoomDistance", min: 1000, max: 1000000, step: 1000 },
      { name: "minZoomDistance", min: 10, max: 1000, step: 10 },
    ],
  );

  useLogCesiumRenderIn2D();
  useTransitionTimeout();
  useDisableSSCC();

  /*
  useEffect(() => {
    if (!viewer) return;
    console.log("[CESIUM] HOOK Track user focus")

    const canvas = viewer.canvas;

    // Ensure the canvas can receive focus
    canvas.setAttribute("tabindex", "0");

    // Event handlers
    const handleFocus = () => setIsUserAction(true);
    const handleBlur = () => setIsUserAction(false);
    const handleMouseDown = () => {
      canvas.focus();
      setIsUserAction(true);
    };

    // Add event listeners
    canvas.addEventListener("focus", handleFocus);
    canvas.addEventListener("blur", handleBlur);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseDown); // Track mouse move as interaction

    // Cleanup event listeners on unmount
    return () => {
      canvas.removeEventListener("focus", handleFocus);
      canvas.removeEventListener("blur", handleBlur);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseDown);
    };
  }, [viewer]);
  */


  const viewerRef = useCallback((node) => {
    if (node !== null) {
      //setComponentStateViewer(node.cesiumElement);
      setViewer && setViewer(node.cesiumElement);
    }
  }, []);

  const location = useLocation();

  useInitializeViewer(viewer, home, homeOffset, leaflet);

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
    if (viewer) {
      console.log("HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera");
      const moveEndListener = async () => {
        console.log("HOOK [2D3D|CESIUM] xxx", viewer.camera.pitch, isMode2d);
        if (viewer.camera.position && !isMode2d) {
          console.log("HOOK [2D3D|CESIUM] xxx", viewer.camera.pitch);
          const rollDeviation =
            Math.abs(CeMath.TWO_PI - viewer.camera.roll) % CeMath.TWO_PI;

          if (rollDeviation > 0.02) {
            console.log("LISTENER HOOK [2D3D|CESIUM|CAMERA]: flyTo reset roll 2D3D", rollDeviation);
            const duration = Math.min(rollDeviation, 1);
            dispatch(setIsAnimating(true));
            viewer.camera.flyTo({
              destination: viewer.camera.position,
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: 0,
              },
              duration,
              complete: () => dispatch(setIsAnimating(false))
            });
          }
          const preventLookingUp = collisions && viewer.camera.pitch > CESIUM_CAMERA_MIN_PITCH;
          if (preventLookingUp && collisions) {
            console.log("LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch", viewer.camera.pitch);
            const centerPos = pickViewerCanvasCenter(viewer).scenePosition;
            if (centerPos) {
              dispatch(setIsAnimating(true));
              const distance = Cartesian3.distance(centerPos, viewer.camera.position)
              viewer.camera.flyToBoundingSphere(
                new BoundingSphere(centerPos, distance),
                {
                  offset: {
                    heading: viewer.camera.heading,
                    pitch: CESIUM_CAMERA_MIN_PITCH_RESET_TO,
                    range: distance,
                  },
                  duration: 1.5,
                  complete: () => dispatch(setIsAnimating(false))
                }
              );
            }
          }
        };
      }
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }

  }, [viewer, collisions, isMode2d, dispatch]);


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
      targetFrameRate={60}
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
  );
}

export default CustomViewer;
