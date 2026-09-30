import type { Map as MaplibreMap } from "maplibre-gl";

import type { ShadowProjectionDebugSnapshot } from "./shadow-projection-debug-store";
import {
  hasShadowProjectionDebugListeners,
  registerShadowProjectionDebugPublisher,
  publishShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";

const SHADOW_DEBUG_PUBLISH_INTERVAL_MS = 100;

type RenderingState = Pick<
  ShadowProjectionDebugSnapshot,
  "bufferLayout" | "sunDiscSamples" | "tiledStats"
>;

/** Owns snapshot identity, rendering stats, and throttled publication. */
export const createShadowProjectionDebugPublisher = (
  map: MaplibreMap,
  getRenderingState: () => RenderingState
) => {
  let disposed = false;
  let lastDebugPublishMs = Number.NEGATIVE_INFINITY;
  let debugPublishTimer: ReturnType<typeof setTimeout> | null = null;
  let latestProjectionDebugSnapshot: ShadowProjectionDebugSnapshot | null =
    null;
  let publishedProjectionDebugBase: ShadowProjectionDebugSnapshot | null = null;
  let publishedDebugRenderingKey = "";

  const publish = () => {
    if (
      disposed ||
      !latestProjectionDebugSnapshot ||
      !hasShadowProjectionDebugListeners(map)
    )
      return;
    const elapsed = performance.now() - lastDebugPublishMs;
    if (elapsed < SHADOW_DEBUG_PUBLISH_INTERVAL_MS) {
      debugPublishTimer ??= globalThis.setTimeout(() => {
        debugPublishTimer = null;
        publish();
      }, SHADOW_DEBUG_PUBLISH_INTERVAL_MS - elapsed);
      return;
    }
    if (debugPublishTimer !== null) {
      globalThis.clearTimeout(debugPublishTimer);
      debugPublishTimer = null;
    }
    const renderingState = getRenderingState();
    const renderingKey = JSON.stringify([
      renderingState.bufferLayout,
      renderingState.sunDiscSamples,
      renderingState.tiledStats,
    ]);
    if (
      publishedProjectionDebugBase === latestProjectionDebugSnapshot &&
      publishedDebugRenderingKey === renderingKey
    )
      return;
    lastDebugPublishMs = performance.now();
    publishedProjectionDebugBase = latestProjectionDebugSnapshot;
    publishedDebugRenderingKey = renderingKey;
    publishShadowProjectionDebugSnapshot(map, {
      ...latestProjectionDebugSnapshot,
      ...renderingState,
    });
  };

  return {
    publish,
    setSnapshot(snapshot: ShadowProjectionDebugSnapshot | null) {
      latestProjectionDebugSnapshot = snapshot;
    },
    markStale() {
      lastDebugPublishMs = Number.NEGATIVE_INFINITY;
    },
    reset() {
      if (debugPublishTimer !== null) {
        globalThis.clearTimeout(debugPublishTimer);
        debugPublishTimer = null;
      }
      latestProjectionDebugSnapshot = null;
      publishedProjectionDebugBase = null;
      publishedDebugRenderingKey = "";
    },
    dispose() {
      disposed = true;
      if (debugPublishTimer !== null) {
        globalThis.clearTimeout(debugPublishTimer);
        debugPublishTimer = null;
      }
      latestProjectionDebugSnapshot = null;
    },
  };
};

registerShadowProjectionDebugPublisher(createShadowProjectionDebugPublisher);
