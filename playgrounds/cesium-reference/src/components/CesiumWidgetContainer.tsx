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
  CesiumContext,
  type CesiumContextType,
} from "@carma-mapping/engines/cesium/react/runtime";

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

    const withRuntime = (cb: (runtime: CesiumWidget) => void): boolean => {
      const runtime = runtimeRef.current;
      if (!runtime || runtime.isDestroyed()) return false;
      cb(runtime);
      return true;
    };

    const withScene = (
      cb: (scene: Scene, runtime: CesiumWidget) => void
    ): boolean => {
      const scene = getScene();
      const runtime = runtimeRef.current;
      if (!scene || !runtime || runtime.isDestroyed()) return false;
      cb(scene, runtime);
      return true;
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
          cb(runtime.camera, runtime);
        }),
      withCanvas: (cb) =>
        withRuntime((runtime) => {
          cb(runtime.canvas, runtime);
        }),
      withScene,
      withImageryLayer: () => false,
      withPrimaryTileset: (cb) => {
        const runtime = runtimeRef.current;
        const tileset = tilesetRef.current;
        if (!tileset || !runtime || runtime.isDestroyed()) return false;
        cb(tileset, runtime);
        return true;
      },
      withSecondaryTileset: () => false,
      withEllipsoidTerrainProvider: () => false,
      withTerrainProvider: (cb) => {
        const runtime = runtimeRef.current;
        const provider = terrainProviderRef.current;
        if (!provider || !runtime || runtime.isDestroyed()) return false;
        cb(provider, runtime);
        return true;
      },
      withSurfaceProvider: (cb) => {
        const runtime = runtimeRef.current;
        const provider = surfaceProviderRef.current;
        if (!provider || !runtime || runtime.isDestroyed()) return false;
        cb(provider, runtime);
        return true;
      },
      getTerrainProvider: () => terrainProviderRef.current,
      getSurfaceProvider: () => surfaceProviderRef.current,
      getImageryLayer: () => null as ImageryLayer | null,
      getScene,
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
