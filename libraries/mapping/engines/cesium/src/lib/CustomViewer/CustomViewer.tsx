import {
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Color,
  HeadingPitchRange,
  Viewer,
  Math as CeMath,
  PerspectiveFrustum,
  Rectangle,
  OrthographicFrustum,
  Cartesian3,
  Transforms,
  BoundingSphere,
  Model,
  Cartographic,
  Matrix4,
  Matrix3,
} from "cesium";
import { Entity, Model as ResiumModel, Viewer as ResiumViewer } from "resium";

import {
  useShowSecondaryTileset,
  useViewerHome,
  useViewerHomeOffset,
  useViewerIsMode2d,
} from "../CustomViewerContextProvider/slices/cesium";
import { BaseTilesets } from "./components/BaseTilesets";
import { encodeScene, replaceHashRoutedHistory } from "./utils";
import { useLocation } from "react-router-dom";
import useInitializeViewer from "./hooks";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useTweakpaneCtx } from "@carma-commons/debug";
import { leafletToCesiumCamera, resolutionFractions } from "../utils";

import { formatFractions } from "../utils/formatters";
import { useCesiumCustomViewer } from "../CustomViewerContextProvider";
import type { LeafletEvent } from "leaflet";
import { ModelAsset } from "../..";

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
  model?: ModelAsset;
  viewerOptions?: {
    resolutionScale?: number;
  };

  minimapLayerUrl?: string;
};

const DEFAULT_RESOLUTION_SCALE = 1;
const OFFSCREEN_RESOLUTION_SCALE = 1 / 64;
export const TRANSITION_DELAY = 1000;

function CustomViewer(props: CustomViewerProps) {
  const { setViewer } = useCesiumCustomViewer();
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
    model = null,
  } = props;

  const xyz = model!.modelOffset!
  const centeredModel = Matrix4.fromTranslation(new Cartesian3(-xyz.x, -xyz.y, xyz.z))

  const rotationMatrix = Matrix3.fromRotationZ(model!.modelRotation!.z as number); // 90 degrees in radians
  // Create a 4x4 rotation matrix from the 3x3 rotation matrix
  const rotationZ = Matrix4.fromRotationTranslation(rotationMatrix, Cartesian3.ZERO);

  const rotatedModel = Matrix4.multiply(rotationZ, centeredModel, new Matrix4());


  const modelPosDeg = model?.modelPosition!
  const modelPos = Cartesian3.fromDegrees(modelPosDeg.longitude, modelPosDeg.latitude, modelPosDeg.height)

  const locatedModel = Transforms.eastNorthUpToFixedFrame(modelPos)
  const modelMatrix = Matrix4.multiply(locatedModel, rotatedModel, new Matrix4());
  //const modelMatrix = Matrix4.fromTranslation(new Cartesian3(0, 0, 0))

  const [viewportLimit, setViewportLimit] = useState<number>(4);
  const [viewportLimitDebug, setViewportLimitDebug] = useState<boolean>(false);

  const [viewer, setComponentStateViewer] = useState<Viewer | null>(null);
  const baseResolutionScale = viewerOptions.resolutionScale || DEFAULT_RESOLUTION_SCALE;
  const [adaptiveResolutionScale, setAdaptiveResolutionScale] = useState<number>(baseResolutionScale);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topicMapContext: any =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const leaflet =
    topicMapContext?.routedMapRef?.leafletMap?.leafletElement;

  const [isUserAction, setIsUserAction] = useState(false);
  // DEV TWEAKPANE

  // Create a callback function to set the FOV

  // TODO implement focus check to prevent update loops

  useEffect(() => {
    if (topicMapContext && isMode2d) {
      const handleLeafletMoveEnd = (event: LeafletEvent) => {
        const center = event.target?.getCenter();
        const zoom = event.target?.getZoom();

        const mapLocation = {
          lat: center.lat,
          lng: center.lng,
          zoom,
        };

        //console.log("handleLeafletMoveEnd xxx", mapLocation);

        if (viewer && mapLocation.lat && mapLocation.lng && mapLocation.zoom) {
          leafletToCesiumCamera(viewer, mapLocation);
        }
      };

      console.log("HOOK: topicMapContext changed", topicMapContext);
      const leaflet =
        topicMapContext?.routedMapRef?.leafletMap?.leafletElement;
      if (leaflet) {
        console.log("HOOK: leaflet changed", leaflet);
      }
      if (leaflet) {
        leaflet.on("moveend", handleLeafletMoveEnd);
        return () => {
          leaflet.off("moveend", handleLeafletMoveEnd);
        };
      }

    }
  }, [topicMapContext, viewer, isMode2d]);


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
  useEffect(() => {
    if (!viewer) return;

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


  //const viewerRef = useCesiumCustomViewer();

  /*
  const viewerCallback = useCallback((node) => {
    if (node !== null) {
      setComponentStateViewer(node.cesiumElement);
      //setViewer && setViewer(node.cesiumElement);
    }
  }, [viewerRef]);
*/
  const viewerRef = useCallback((node) => {
    if (node !== null) {
      setComponentStateViewer(node.cesiumElement);
      setViewer && setViewer(node.cesiumElement);
    }
  }, []);

  const location = useLocation();

  useInitializeViewer(viewer, home, homeOffset, leaflet);

  useEffect(() => {
    if (viewer && enableLocationHashUpdate) {
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
  }, [viewer, enableLocationHashUpdate, location.pathname, isSecondaryStyle]);

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
    if (viewer) {
      console.log("HOOK: globe setting changed");
      // set the globe props
      //Object.assign(scene.globe, globeProps);
      Object.entries(globeProps).forEach(([key, value]) => {
        if (value !== undefined) {
          viewer.scene.globe[key] = value;
        }
      });
    }
  }, [viewer, globeProps]);

  useEffect(() => {
    if (viewer) {
      console.log("HOOK: viewer changed intit scene settings");
      viewer.imageryLayers.removeAll();
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    }

  }, [viewer]);

  useEffect(() => {
    // render offscreen with ultra low res to reduce memory usage
    if (viewer) {
      if (isMode2d) {
        setTimeout(() => {
          console.log("HOOK: setAdaptiveResolutionScale", OFFSCREEN_RESOLUTION_SCALE);
          setAdaptiveResolutionScale(OFFSCREEN_RESOLUTION_SCALE);
          viewer.resolutionScale = OFFSCREEN_RESOLUTION_SCALE;
        }, TRANSITION_DELAY);
      } else {
        console.log("HOOK: setAdaptiveResolutionScale", baseResolutionScale);
        setAdaptiveResolutionScale(baseResolutionScale);
        viewer.resolutionScale = baseResolutionScale;
      }
    } else {
      setAdaptiveResolutionScale(OFFSCREEN_RESOLUTION_SCALE);
    }
  }, [viewer, isMode2d, baseResolutionScale]);

  useEffect(() => {
    console.log("HOOK: viewer changed", isSecondaryStyle);
    if (!viewer) return;

    // remove default imagery

    const moveEndListener = async () => {
      if (viewer.camera.position) {
        console.log("LISTENER: moveEndListener", isSecondaryStyle);
        const encodedScene = encodeScene(viewer, { isSecondaryStyle });

        // let TopicMap/leaflet handle the view change in 2d Mode
        !isMode2d && enableLocationHashUpdate && replaceHashRoutedHistory(encodedScene, location.pathname);

        if (isUserAction && !isMode2d) {
          // remove roll from camera orientation
          const rollDeviation =
            Math.abs(CeMath.TWO_PI - viewer.camera.roll) % CeMath.TWO_PI;
          if (rollDeviation > 0.02) {
            console.log("LISTENER HOOK: flyTo reset roll", rollDeviation);
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
          // preload 2D view (TODO: disable to reduce request count)
          // console.log("leaflet", leaflet, topicMapContext?.routedMapRef);
          // leaflet && setLeafletView(viewer, leaflet, { animate: false });
        }
      }
    };

    viewer.camera.moveEnd.addEventListener(moveEndListener);
    return () => {
      viewer.camera.moveEnd.removeEventListener(moveEndListener);
    };
  }, [
    viewer,
    leaflet,
    location.pathname,
    isSecondaryStyle,
    topicMapContext?.routedMapRef,
    isMode2d,
    isUserAction,
    enableLocationHashUpdate,
  ]);

  console.log("RENDER: CustomViewer");

  const handleModelReady = (model: Model) => {
    console.log("Model ready", model)
    const boundingSphere: BoundingSphere = model.boundingSphere;
    // Set the camera to view the model's bounding box

    const cartoSphere = Cartographic.fromCartesian(boundingSphere.center)
    console.log("model", cartoSphere)
    if (cartoSphere) {
      const { latitude, longitude, height } = cartoSphere
      console.log("Model located at:", boundingSphere.center, modelMatrix, CeMath.toDegrees(latitude), CeMath.toDegrees(longitude), height);
      viewer && viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  };

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
      {model && <Entity point={{ pixelSize: 50, color: Color.BLUE }} position={modelPos} >

      </Entity>}
      {model && <ResiumModel
        scale={1}
        modelMatrix={modelMatrix}
        url={model.uri}
        onReady={handleModelReady}
      />}

      {children}
    </ResiumViewer>
  );
}

export default CustomViewer;
