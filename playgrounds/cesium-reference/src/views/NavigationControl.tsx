import {
  FC,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Tooltip } from "antd";

import {
  CesiumTerrainProvider,
  ImageryLayer,
  Viewer,
  WebMapServiceImageryProvider,
} from "cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";

import {
  BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
} from "@carma-commons/resources";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import {
  initSceneAnimationMap,
  type SceneAnimationMap,
} from "@carma-mapping/engines/cesium/core";

import {
  CESIUM_RUNTIME_TRANSITION_STATE,
  CesiumContext,
  useZoomControls,
  PitchingCompass,
  type CesiumContextType,
  type CesiumRuntime,
} from "@carma-mapping/engines/cesium/react/runtime";

import useTileset from "../hooks/useTileset";
import { useZoomToTilesetOnReady } from "../hooks/useZoomToTilesetOnReady";
import { cesiumConstructorOptions } from "../config";
const NavigationControlView: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sceneAnimationMapRef = useRef<SceneAnimationMap | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);
  const [isRuntimeReady, setIsRuntimeReady] = useState(false);
  const ctx = useMemo<CesiumContextType>(() => {
    const withRuntime = <T,>(
      cb: (runtime: CesiumRuntime) => T
    ): T | undefined => {
      const runtime = viewerRef.current as unknown as CesiumRuntime | null;
      return runtime && !runtime.isDestroyed() ? cb(runtime) : undefined;
    };

    return {
      runtimeRef:
        viewerRef as unknown as MutableRefObject<CesiumRuntime | null>,
      sceneAnimationMapRef:
        sceneAnimationMapRef as MutableRefObject<SceneAnimationMap | null>,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isRuntimeReady,
      setIsRuntimeReady,
      providersReady: isRuntimeReady,
      initialViewApplied: isRuntimeReady,
      setInitialViewApplied: () => undefined,
      requestRender: () => {
        viewerRef.current?.scene.requestRender();
      },
      isValidRuntime: () => {
        const runtime = viewerRef.current;
        return Boolean(runtime && !runtime.isDestroyed());
      },
      withRuntime,
      withCamera: (cb) =>
        withRuntime((runtime) => {
          return cb(runtime.camera, runtime);
        }),
      withScene: (cb) =>
        withRuntime((runtime) => {
          return cb(runtime.scene, runtime);
        }),
      withImageryLayer: () => undefined,
      withImageryLayerById: () => undefined,
      withTileset: () => undefined,
      withTerrainProvider: () => undefined,
      withTerrainProviderById: () => undefined,
      withSurfaceProvider: () => undefined,
      getTerrainProvider: () => null,
      getTerrainProviderById: () => null,
      getSurfaceProvider: () => null,
      getImageryLayer: () => null,
      getImageryLayerById: () => null,
      getTerrainProviderInitSignatureById: (id) => `reference:${id}`,
      getTilesetInitSignatureById: (id) => `reference:${id}`,
      getScene: () => {
        const runtime = viewerRef.current;
        return runtime && !runtime.isDestroyed() ? runtime.scene : null;
      },
      currentTransition: CESIUM_RUNTIME_TRANSITION_STATE.NONE,
      isTransitioning: false,
      clearTransition: () => undefined,
      sceneStyles: {},
      sceneStyleIds: [],
      currentSceneStyle: undefined,
      currentSceneStyleConfig: undefined,
      setCurrentSceneStyle: () => undefined,
      toggleCurrentSceneStyle: () => undefined,
      models: undefined,
      tilesetIds: [],
      visibleTilesetIds: [],
      ssccMinimumZoomDistance: 1,
      ssccMaximumZoomDistance: Infinity,
      ssccEnableCollisionDetection: false,
      isAnimating: false,
      setIsAnimating: () => undefined,
    };
  }, [isRuntimeReady]);

  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_LOD2_TILESET.url,
    viewerRef.current
  );

  useEffect(() => {
    const initializeViewer = async () => {
      if (containerRef.current) {
        const viewer = new Viewer(
          containerRef.current,
          cesiumConstructorOptions
        );
        viewerRef.current = viewer;
        sceneAnimationMapRef.current = initSceneAnimationMap();

        viewer.terrainProvider = await CesiumTerrainProvider.fromUrl(
          WUPP_TERRAIN_PROVIDER.url
        );

        const imageryProvider = new WebMapServiceImageryProvider(
          BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU
        );
        const newImageryLayer = new ImageryLayer(imageryProvider);
        viewer.imageryLayers.add(newImageryLayer);

        setIsRuntimeReady(true);
      }
    };

    initializeViewer();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        sceneAnimationMapRef.current = null;
        setIsRuntimeReady(false);
      }
    };
  }, []);

  useZoomToTilesetOnReady(viewerRef.current, tilesetRef, tilesetReady);
  const { handleZoomIn, handleZoomOut } = useZoomControls(ctx);

  console.log("RENDER", isRuntimeReady);

  return (
    <>
      {isRuntimeReady && (
        <CesiumContext.Provider value={ctx}>
          <ControlLayout ifStorybook={false}>
            <Control position="topleft" order={10}>
              <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
                <ControlButtonStyler
                  onClick={handleZoomIn}
                  style={{
                    borderBottomWidth: 0,
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    fontWeight: 700,
                    zIndex: 9999999,
                  }}
                  dataTestId="zoom-in-control"
                >
                  <FontAwesomeIcon icon={faPlus} style={{ fontSize: "1rem" }} />
                </ControlButtonStyler>
              </Tooltip>
              <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
                <ControlButtonStyler
                  onClick={handleZoomOut}
                  style={{
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderTopWidth: 1,
                    borderTopStyle: "solid",
                  }}
                  dataTestId="zoom-out-control"
                >
                  <FontAwesomeIcon
                    icon={faMinus}
                    style={{ fontSize: "1rem" }}
                  />
                </ControlButtonStyler>
              </Tooltip>
            </Control>
            <Control position="topleft" order={30}>
              <ControlButtonStyler>
                <PitchingCompass />
              </ControlButtonStyler>
            </Control>
          </ControlLayout>
        </CesiumContext.Provider>
      )}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
        }}
      />
    </>
  );
};

export default NavigationControlView;
