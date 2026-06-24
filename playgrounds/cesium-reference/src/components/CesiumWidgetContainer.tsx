import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  type CesiumWidget,
  type ImageryLayer,
  type Scene,
} from "cesium";
import {
  createMinimalCesiumWidget,
  type SceneAnimationMap,
} from "@carma-mapping/engines/cesium/core";
import { degToRadNumeric } from "@carma-units";
import {
  WUPPERTAL,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";
import {
  CESIUM_RUNTIME_TRANSITION_STATE,
  CesiumContext,
  type CesiumContextType,
} from "@carma-mapping/engines/cesium/react/runtime";

const REFERENCE_TILESET_ID = "mesh-2024";
const REFERENCE_TERRAIN_PROVIDER_ID = "terrain";
const REFERENCE_SURFACE_PROVIDER_ID = "surface";

const requestRenderWithOptions = (
  scene: Scene | null,
  opts?: {
    delay?: number;
    repeat?: number;
    repeatInterval?: number;
  }
) => {
  if (!scene || scene.isDestroyed()) return;
  const delay = Math.max(0, opts?.delay ?? 0);
  const repeat = Math.max(1, opts?.repeat ?? 1);
  const repeatInterval = Math.max(0, opts?.repeatInterval ?? 50);

  const renderOnce = () => {
    if (!scene.isDestroyed()) {
      scene.requestRender();
    }
  };

  if (delay > 0) {
    window.setTimeout(renderOnce, delay);
  } else {
    renderOnce();
  }

  for (let index = 1; index < repeat; index += 1) {
    window.setTimeout(renderOnce, delay + repeatInterval * index);
  }
};

const initializeWidget = (
  container: HTMLDivElement,
  useBrowserRecommendedResolution = false
): CesiumWidget => {
  const widget = createMinimalCesiumWidget(container, {
    useBrowserRecommendedResolution,
  });
  const position = Cartesian3.fromDegrees(
    WUPPERTAL.position.longitude,
    WUPPERTAL.position.latitude - 0.003,
    500
  );
  widget.camera.setView({
    destination: position,
    orientation: {
      heading: degToRadNumeric(0),
      pitch: degToRadNumeric(-45),
      roll: 0,
    },
  });

  return widget;
};

const initializeTerrainProviders = async () => {
  const providers = {
    terrain: null as CesiumTerrainProvider | null,
    surface: null as CesiumTerrainProvider | null,
  };

  try {
    providers.terrain = await CesiumTerrainProvider.fromUrl(
      WUPP_TERRAIN_PROVIDER.url
    );
  } catch (error) {
    console.warn("[cesium-reference] Failed to initialize terrain provider", {
      error,
      url: WUPP_TERRAIN_PROVIDER.url,
    });
  }

  try {
    providers.surface = await CesiumTerrainProvider.fromUrl(
      WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url
    );
  } catch (error) {
    console.warn("[cesium-reference] Failed to initialize surface provider", {
      error,
      url: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url,
    });
  }

  return providers;
};

const loadTileset = async (
  widget: CesiumWidget
): Promise<Cesium3DTileset | null> => {
  try {
    const tileset = await Cesium3DTileset.fromUrl(WUPP_MESH_2024.url, {
      preloadWhenHidden: false,
      scene: widget.scene,
      shadows: 0,
      enableCollision: false,
      maximumScreenSpaceError: 6,
      skipLevelOfDetail: true,
      skipScreenSpaceErrorFactor: 128,
      baseScreenSpaceError: 4096,
    });

    if (!widget.isDestroyed()) {
      widget.scene.primitives.add(tileset);
      widget.scene.requestRender();
    }

    return tileset;
  } catch (error) {
    console.warn("[cesium-reference] Failed to load tileset", {
      error,
      url: WUPP_MESH_2024.url,
    });
    return null;
  }
};

type CesiumWidgetContainerProps = {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
};

export function CesiumWidgetContainer({
  rootRef,
  children,
}: CesiumWidgetContainerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const sceneAnimationMapRef = useRef<SceneAnimationMap | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);
  const runtimeRef = useRef<CesiumWidget | null>(null);
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [providersReady, setProvidersReady] = useState(false);
  const [isRuntimeReady, setIsRuntimeReady] = useState(false);
  const [initialViewApplied, setInitialViewApplied] = useState(true);

  useEffect(() => {
    if (!cesiumContainerRef.current) return;
    let disposed = false;

    const initialize = async () => {
      const widget = initializeWidget(cesiumContainerRef.current);
      if (disposed) {
        if (!widget.isDestroyed()) {
          widget.destroy();
        }
        return;
      }

      runtimeRef.current = widget;
      setIsRuntimeReady(true);
      setInitialViewApplied(true);

      const [providers, tileset] = await Promise.all([
        initializeTerrainProviders(),
        loadTileset(widget),
      ]);

      if (disposed || widget.isDestroyed()) return;

      terrainProviderRef.current = providers.terrain;
      surfaceProviderRef.current = providers.surface;
      tilesetRef.current = tileset;
      setProvidersReady(true);
      widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[cesium-reference] Failed to initialize CesiumWidget container",
        error
      );
    });

    return () => {
      disposed = true;
      setProvidersReady(false);
      setIsRuntimeReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = runtimeRef.current;
      runtimeRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, []);

  const contextValue = useMemo<CesiumContextType>(() => {
    const getScene = () => {
      const widget = runtimeRef.current;
      if (!widget || widget.isDestroyed()) return null;
      return widget.scene;
    };

    const withRuntime = <T,>(
      cb: (runtime: CesiumWidget) => T
    ): T | undefined => {
      const runtime = runtimeRef.current;
      return runtime && !runtime.isDestroyed() ? cb(runtime) : undefined;
    };

    const withScene = <T,>(
      cb: (scene: Scene, runtime: CesiumWidget) => T
    ): T | undefined => {
      const scene = getScene();
      const runtime = runtimeRef.current;
      return scene && runtime && !runtime.isDestroyed()
        ? cb(scene, runtime)
        : undefined;
    };

    const withTileset = <T,>(
      id: string,
      cb: (tileset: Cesium3DTileset, runtime: CesiumWidget) => T
    ): T | undefined => {
      const runtime = runtimeRef.current;
      const tileset = tilesetRef.current;
      return id === REFERENCE_TILESET_ID &&
        tileset &&
        runtime &&
        !runtime.isDestroyed()
        ? cb(tileset, runtime)
        : undefined;
    };

    const getTerrainProviderById = (id: string) => {
      if (id === REFERENCE_TERRAIN_PROVIDER_ID) {
        return terrainProviderRef.current;
      }
      if (id === REFERENCE_SURFACE_PROVIDER_ID) {
        return surfaceProviderRef.current;
      }
      return null;
    };

    const withTerrainProviderById = <T,>(
      id: string,
      cb: (provider: CesiumTerrainProvider, runtime: CesiumWidget) => T
    ): T | undefined => {
      const runtime = runtimeRef.current;
      const provider = getTerrainProviderById(id);
      return provider && runtime && !runtime.isDestroyed()
        ? cb(provider, runtime)
        : undefined;
    };

    return {
      runtimeRef: runtimeRef as MutableRefObject<CesiumWidget | null>,
      sceneAnimationMapRef:
        sceneAnimationMapRef as MutableRefObject<SceneAnimationMap | null>,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isRuntimeReady,
      setIsRuntimeReady,
      providersReady,
      initialViewApplied,
      setInitialViewApplied,
      requestRender: (opts) => requestRenderWithOptions(getScene(), opts),
      isValidRuntime: () => {
        const runtime = runtimeRef.current;
        return Boolean(runtime && !runtime.isDestroyed());
      },
      withRuntime,
      withCamera: (cb) =>
        withRuntime((runtime) => {
          return cb(runtime.camera, runtime);
        }),
      withScene,
      withImageryLayer: () => undefined,
      withImageryLayerById: () => undefined,
      withTileset,
      withTerrainProvider: (cb) => {
        return withTerrainProviderById(REFERENCE_TERRAIN_PROVIDER_ID, cb);
      },
      withTerrainProviderById,
      withSurfaceProvider: (cb) => {
        return withTerrainProviderById(REFERENCE_SURFACE_PROVIDER_ID, cb);
      },
      getTerrainProvider: () => terrainProviderRef.current,
      getTerrainProviderById,
      getSurfaceProvider: () => surfaceProviderRef.current,
      getImageryLayer: () => null as ImageryLayer | null,
      getImageryLayerById: () => null as ImageryLayer | null,
      getTerrainProviderInitSignatureById: (id) => `reference:${id}`,
      getTilesetInitSignatureById: (id) => `reference:${id}`,
      getScene,
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
      tilesetIds: [REFERENCE_TILESET_ID],
      visibleTilesetIds: [REFERENCE_TILESET_ID],
      ssccMinimumZoomDistance: 1,
      ssccMaximumZoomDistance: Infinity,
      ssccEnableCollisionDetection: false,
      isAnimating: false,
      setIsAnimating: () => undefined,
    };
  }, [initialViewApplied, isRuntimeReady, providersReady]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <CesiumContext.Provider value={contextValue}>
        {children}
      </CesiumContext.Provider>
    </div>
  );
}
