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
} from "@carma-commons/resources";
import {
  Cesium3DTileset,
  CesiumTerrainProvider,
  type CesiumWidget,
  type Scene,
} from "@carma-cesium";
import {
  createMinimalCesiumWidget,
  registerCesiumSceneSurfacePickingTileset,
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
  widget.scene.pickTranslucentDepth = false;
  widget.scene.globe.depthTestAgainstTerrain = true;

  return widget;
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

const initializeTerrainSamplingProvider = async () => {
  try {
    return await CesiumTerrainProvider.fromUrl(WUPP_TERRAIN_PROVIDER.url);
  } catch (error) {
    console.warn(
      "[annotations-playground] Failed to initialize off-scene terrain sampling provider",
      {
        error,
        url: WUPP_TERRAIN_PROVIDER.url,
      }
    );
    return null;
  }
};

const waitForNextSceneRender = async (scene: Scene) => {
  await new Promise<void>((resolve) => {
    const removePostRenderListener = scene.postRender.addEventListener(() => {
      removePostRenderListener?.();
      resolve();
    });
    scene.requestRender();
  });
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
  onSurfacePickingTargetChange?: (tileset: Cesium3DTileset | null) => void;
  initialCameraState: AnnotationsDemoCameraState;
  startPoseResolved?: boolean;
  children: ReactNode;
};

export function CesiumWidgetContainer({
  rootRef,
  onSceneChange,
  onSurfacePickingTargetChange,
  initialCameraState,
  startPoseResolved = true,
  children,
}: CesiumWidgetContainerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const terrainSamplingProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const unregisterSurfacePickingTilesetRef = useRef<(() => void) | null>(null);
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
      const tilesetPromise = loadTileset(widget);
      void initializeTerrainSamplingProvider().then((provider) => {
        if (disposed) {
          return;
        }

        terrainSamplingProviderRef.current = provider;
      });

      await applyInitialCameraState({
        widget,
        initialCameraState,
      });

      const tileset = await tilesetPromise;
      if (disposed || widget.isDestroyed()) return;

      tilesetRef.current = tileset;
      onSurfacePickingTargetChange?.(tileset);
      unregisterSurfacePickingTilesetRef.current?.();
      unregisterSurfacePickingTilesetRef.current = tileset
        ? registerCesiumSceneSurfacePickingTileset(widget.scene, tileset)
        : null;
      await waitForNextSceneRender(widget.scene);

      if (disposed || widget.isDestroyed()) return;

      onSceneChange?.(widget.scene);
      setIsWidgetReady(true);
    };

    initialize().catch((error) => {
      console.error(
        "[annotations-playground] Failed to initialize CesiumWidget container",
        error
      );
      onSceneChange?.(null);
      onSurfacePickingTargetChange?.(null);
      setIsWidgetReady(false);
      terrainSamplingProviderRef.current = null;
      tilesetRef.current = null;
      unregisterSurfacePickingTilesetRef.current?.();
      unregisterSurfacePickingTilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    });

    return () => {
      disposed = true;
      onSceneChange?.(null);
      onSurfacePickingTargetChange?.(null);
      setIsWidgetReady(false);
      terrainSamplingProviderRef.current = null;
      tilesetRef.current = null;
      unregisterSurfacePickingTilesetRef.current?.();
      unregisterSurfacePickingTilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, [
    initialCameraState,
    onSurfacePickingTargetChange,
    onSceneChange,
    startPoseResolved,
  ]);

  useEffect(() => {
    if (!isWidgetReady) {
      return;
    }
    widgetRef.current?.scene.requestRender();
  }, [isWidgetReady]);

  return (
    <div
      ref={rootRef}
      data-annotation-cursor-root="true"
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
