import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";
import {
  Cartesian2,
  Cesium3DTileset,
  CesiumTerrainProvider,
  type CesiumWidget,
  type Scene,
} from "@carma-cesium";
import {
  createMinimalCesiumWidget,
  setViewFromCameraState,
} from "@carma-mapping/engines/cesium/core";

import type { AnnotationsDemoCameraState } from "../playground.types";
const applyCameraState = async (
  widget: CesiumWidget,
  state: AnnotationsDemoCameraState
) => {
  setViewFromCameraState(widget.camera, state);
  widget.scene.requestRender();
};

const initializeWidget = (
  container: HTMLDivElement,
  useBrowserRecommendedResolution = false
): CesiumWidget => {
  const widget = createMinimalCesiumWidget(container, {
    requestRenderMode: true,
    useBrowserRecommendedResolution,
  });

  widget.scene.requestRenderMode = true;

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
    console.warn(
      "[annotations-playground] Failed to initialize terrain provider",
      {
        error,
        url: WUPP_TERRAIN_PROVIDER.url,
      }
    );
  }

  try {
    providers.surface = await CesiumTerrainProvider.fromUrl(
      WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url
    );
  } catch (error) {
    console.warn(
      "[annotations-playground] Failed to initialize surface provider",
      {
        error,
        url: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url,
      }
    );
  }

  return providers;
};

const applyInitialCameraState = async ({
  widget,
  initialCameraState,
}: {
  widget: CesiumWidget;
  initialCameraState: AnnotationsDemoCameraState;
}) => {
  await applyCameraState(widget, initialCameraState);
};

const sampleScreenCenterTerrainIntersection = (scene: Scene) => {
  const { camera, canvas, globe } = scene;
  if (!camera || !canvas || typeof camera.getPickRay !== "function") {
    return null;
  }

  const ray = camera.getPickRay(
    new Cartesian2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5)
  );
  if (!ray || typeof globe?.pick !== "function") {
    return null;
  }

  return globe.pick(ray, scene);
};

const ensureScreenCenterTerrainIntersection = async (
  scene: Scene,
  maxAttempts = 45
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const hit = sampleScreenCenterTerrainIntersection(scene);
    if (hit) {
      return true;
    }
    scene.requestRender();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 16);
    });
  }

  console.warn(
    "[annotations-playground] Missing terrain intersection at screen center during startup. Continuing with view-state fallback handling."
  );
  return false;
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
    console.warn("[annotations-playground] Failed to load tileset", {
      error,
      url: WUPP_MESH_2024.url,
    });
    return null;
  }
};

type CesiumWidgetContainerProps = {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  onSceneChange?: (scene: Scene | null) => void;
  initialCameraState: AnnotationsDemoCameraState;
  startPoseResolved?: boolean;
  children: ReactNode;
};

export function CesiumWidgetContainer({
  rootRef,
  onSceneChange,
  initialCameraState,
  startPoseResolved = true,
  children,
}: CesiumWidgetContainerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [isWidgetReady, setIsWidgetReady] = useState(false);

  useEffect(() => {
    if (!startPoseResolved || !cesiumContainerRef.current) return;
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
      const providersPromise = initializeTerrainProviders();
      const tilesetPromise = loadTileset(widget);

      const providers = await providersPromise;

      if (disposed || widget.isDestroyed()) return;

      if (!providers.terrain) {
        throw new Error(
          "[annotations-playground] Terrain provider is required for this demo."
        );
      }

      widget.scene.terrainProvider = providers.terrain;

      await applyInitialCameraState({
        widget,
        initialCameraState,
      });
      await ensureScreenCenterTerrainIntersection(widget.scene);

      if (disposed || widget.isDestroyed()) return;

      onSceneChange?.(widget.scene);
      setIsWidgetReady(true);

      const tileset = await tilesetPromise;
      if (disposed || widget.isDestroyed()) return;

      terrainProviderRef.current = providers.terrain;
      surfaceProviderRef.current = providers.surface;
      tilesetRef.current = tileset;
      widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[annotations-playground] Failed to initialize CesiumWidget container",
        error
      );
      onSceneChange?.(null);
      setIsWidgetReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    });

    return () => {
      disposed = true;
      onSceneChange?.(null);
      setIsWidgetReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, [initialCameraState, onSceneChange, startPoseResolved]);

  useEffect(() => {
    if (!isWidgetReady) {
      return;
    }
    widgetRef.current?.scene.requestRender();
  }, [isWidgetReady]);

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
      {children}
    </div>
  );
}
