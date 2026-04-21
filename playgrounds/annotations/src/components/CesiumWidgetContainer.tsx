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
  SceneMode,
  readCesiumPrivateSceneTweens,
  type CesiumWidget,
  type Scene,
} from "@carma-cesium";
import {
  createMinimalCesiumWidget,
  setViewFromCameraState,
} from "@carma-mapping/engines/cesium/core";
import {
  PREVIEW_OVERLAY_GROUP,
  PREVIEW_OVERLAY_GROUP_RENDER_ORDER,
  resolvePreviewOverlayMountConfig,
  type PreviewOverlayGroup,
} from "@carma-mapping/annotations/runtime";

import type { AnnotationsDemoCameraState } from "../playground.types";

const ANNOTATIONS_PLAYGROUND_MAX_RENDER_RATE_HZ = 144;
const ANNOTATIONS_PLAYGROUND_MIN_RENDER_INTERVAL_MS =
  1000 / ANNOTATIONS_PLAYGROUND_MAX_RENDER_RATE_HZ;
const ANNOTATIONS_PLAYGROUND_INTERACTION_RENDER_GRACE_MS = 250;
const ANNOTATION_OVERLAY_ROOT_STYLE = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  isolation: "isolate",
} as const;
const ANNOTATION_OVERLAY_CONTAINER_STYLE = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
} as const;
const ANNOTATION_OVERLAY_EXTERNAL_Z_INDEX_BY_GROUP: Readonly<
  Record<PreviewOverlayGroup, number>
> = Object.freeze({
  [PREVIEW_OVERLAY_GROUP.VISUALIZER]: 100,
  [PREVIEW_OVERLAY_GROUP.LABEL]: 110,
});

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
    targetFrameRate: ANNOTATIONS_PLAYGROUND_MAX_RENDER_RATE_HZ,
    useBrowserRecommendedResolution,
    useDefaultRenderLoop: false,
  });

  widget.useDefaultRenderLoop = false;
  widget.targetFrameRate = ANNOTATIONS_PLAYGROUND_MAX_RENDER_RATE_HZ;
  widget.scene.requestRenderMode = true;
  widget.scene.pickTranslucentDepth = false;
  widget.scene.globe.depthTestAgainstTerrain = true;

  return widget;
};

const hasOngoingSceneWork = (scene: Scene): boolean => {
  const internalScene = scene as Scene & {
    _renderRequested?: boolean;
    _screenSpaceCameraController?: {
      _tweens?: { length?: number } | null;
    } | null;
    camera: Scene["camera"] & {
      _currentFlight?: unknown;
    };
  };

  return Boolean(
    internalScene._renderRequested ||
      (readCesiumPrivateSceneTweens(scene)?.length ?? 0) > 0 ||
      (internalScene._screenSpaceCameraController?._tweens?.length ?? 0) > 0 ||
      internalScene.camera._currentFlight ||
      scene.mode === SceneMode.MORPHING ||
      scene.globe?.tilesLoaded === false
  );
};

const installExplicitRenderScheduler = ({
  widget,
  container,
}: {
  widget: CesiumWidget;
  container: HTMLElement;
}) => {
  const { scene } = widget;
  const originalRequestRender = scene.requestRender.bind(scene);
  const mutableScene = scene as Scene & {
    requestRender: () => void;
  };
  let queuedRenderFrameId = 0;
  let queuedRenderTimeoutId = 0;
  let renderQueued = false;
  let destroyed = false;
  let lastRenderAtMs = Number.NEGATIVE_INFINITY;
  let interactionRenderUntilMs = Number.NEGATIVE_INFINITY;

  const clearQueuedRender = () => {
    if (queuedRenderFrameId !== 0) {
      window.cancelAnimationFrame(queuedRenderFrameId);
      queuedRenderFrameId = 0;
    }
    if (queuedRenderTimeoutId !== 0) {
      window.clearTimeout(queuedRenderTimeoutId);
      queuedRenderTimeoutId = 0;
    }
  };

  const runQueuedRender = () => {
    if (destroyed || widget.isDestroyed()) {
      return;
    }

    clearQueuedRender();
    renderQueued = false;
    widget.resize();
    widget.render();
    lastRenderAtMs = performance.now();

    if (
      lastRenderAtMs < interactionRenderUntilMs ||
      hasOngoingSceneWork(scene)
    ) {
      scheduleRender();
    }
  };

  const scheduleRender = () => {
    if (destroyed || widget.isDestroyed() || renderQueued) {
      return;
    }

    renderQueued = true;
    const elapsedMs = performance.now() - lastRenderAtMs;
    const remainingDelayMs = Math.max(
      0,
      ANNOTATIONS_PLAYGROUND_MIN_RENDER_INTERVAL_MS - elapsedMs
    );
    if (remainingDelayMs === 0) {
      queuedRenderFrameId = window.requestAnimationFrame(() => {
        runQueuedRender();
      });
      return;
    }

    queuedRenderTimeoutId = window.setTimeout(() => {
      queuedRenderTimeoutId = 0;
      queuedRenderFrameId = window.requestAnimationFrame(() => {
        runQueuedRender();
      });
    }, remainingDelayMs);
  };

  const requestScheduledRender = () => {
    originalRequestRender();
    scheduleRender();
  };

  mutableScene.requestRender = requestScheduledRender;

  const requestInteractionDrivenRender = () => {
    // Keep the explicit render loop alive briefly while Cesium processes input.
    interactionRenderUntilMs =
      performance.now() + ANNOTATIONS_PLAYGROUND_INTERACTION_RENDER_GRACE_MS;
    requestScheduledRender();
  };
  const interactionRenderEvents = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
  ] as const;
  for (const eventName of interactionRenderEvents) {
    scene.canvas.addEventListener(eventName, requestInteractionDrivenRender, {
      passive: true,
    });
  }

  const refreshForResize = () => {
    requestScheduledRender();
  };

  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          refreshForResize();
        })
      : null;
  resizeObserver?.observe(container);
  resizeObserver?.observe(scene.canvas);
  window.addEventListener("resize", refreshForResize);

  requestScheduledRender();

  return () => {
    destroyed = true;
    resizeObserver?.disconnect();
    window.removeEventListener("resize", refreshForResize);
    for (const eventName of interactionRenderEvents) {
      scene.canvas.removeEventListener(
        eventName,
        requestInteractionDrivenRender
      );
    }
    clearQueuedRender();
    mutableScene.requestRender = originalRequestRender;
  };
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
  const cleanupRenderSchedulerRef = useRef<(() => void) | null>(null);
  const terrainSamplingProviderRef = useRef<CesiumTerrainProvider | null>(null);
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
      cleanupRenderSchedulerRef.current = installExplicitRenderScheduler({
        widget,
        container: cesiumContainerRef.current,
      });
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
      setIsWidgetReady(false);
      terrainSamplingProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      cleanupRenderSchedulerRef.current?.();
      cleanupRenderSchedulerRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    });

    return () => {
      disposed = true;
      onSceneChange?.(null);
      setIsWidgetReady(false);
      terrainSamplingProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      cleanupRenderSchedulerRef.current?.();
      cleanupRenderSchedulerRef.current = null;
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
      {PREVIEW_OVERLAY_GROUP_RENDER_ORDER.map((group) => {
        const { rootAttribute, containerAttribute } =
          resolvePreviewOverlayMountConfig(group);

        return (
          <div
            key={group}
            {...{
              [rootAttribute]: "true",
            }}
            style={{
              ...ANNOTATION_OVERLAY_ROOT_STYLE,
              zIndex: ANNOTATION_OVERLAY_EXTERNAL_Z_INDEX_BY_GROUP[group],
            }}
          >
            <div
              {...{
                [containerAttribute]: "true",
              }}
              style={ANNOTATION_OVERLAY_CONTAINER_STYLE}
            />
          </div>
        );
      })}
      {children}
    </div>
  );
}
