import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { Viewer } from "cesium";
import {
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  createMinimalCesiumWidget,
  type CesiumWidget,
  type ImageryLayer,
  type Scene,
} from "@carma/cesium";
import { degToRadNumeric } from "@carma/units/helpers";
import {
  WUPPERTAL,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";
import {
  CesiumContext,
  type CesiumContextType,
  type SceneAnimationMap,
} from "@carma-mapping/engines/cesium/legacy";

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
  const viewerRef = useRef<Viewer | null>(null);
  const sceneAnimationMapRef = useRef<SceneAnimationMap | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [providersReady, setProvidersReady] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
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

      widgetRef.current = widget;
      setIsViewerReady(true);
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
      setIsViewerReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, []);

  const contextValue = useMemo<CesiumContextType>(() => {
    const getScene = () => {
      const widget = widgetRef.current;
      if (!widget || widget.isDestroyed()) return null;
      return widget.scene;
    };

    const withScene = (cb: (scene: Scene, viewer: Viewer) => void): boolean => {
      const scene = getScene();
      if (!scene) return false;
      cb(scene, viewerRef.current as Viewer);
      return true;
    };

    return {
      viewerRef: viewerRef as MutableRefObject<Viewer | null>,
      sceneAnimationMapRef:
        sceneAnimationMapRef as MutableRefObject<SceneAnimationMap | null>,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isViewerReady,
      setIsViewerReady,
      providersReady,
      initialViewApplied,
      setInitialViewApplied,
      requestRender: (opts) => requestRenderWithOptions(getScene(), opts),
      isValidViewer: () => false,
      withViewer: () => false,
      withCamera: () => false,
      withCanvas: () => false,
      withScene,
      withEntities: () => false,
      withImageryLayer: () => false,
      withPrimaryTileset: (cb) => {
        const tileset = tilesetRef.current;
        if (!tileset) return false;
        cb(tileset, viewerRef.current as Viewer);
        return true;
      },
      withSecondaryTileset: () => false,
      withEllipsoidTerrainProvider: () => false,
      withTerrainProvider: (cb) => {
        const provider = terrainProviderRef.current;
        if (!provider) return false;
        cb(provider, viewerRef.current as Viewer);
        return true;
      },
      withSurfaceProvider: (cb) => {
        const provider = surfaceProviderRef.current;
        if (!provider) return false;
        cb(provider, viewerRef.current as Viewer);
        return true;
      },
      getTerrainProvider: () => terrainProviderRef.current,
      getSurfaceProvider: () => surfaceProviderRef.current,
      getImageryLayer: () => null as ImageryLayer | null,
      getScene,
    };
  }, [initialViewApplied, isViewerReady, providersReady]);

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
