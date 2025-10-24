import { useEffect, useRef, type MutableRefObject } from "react";
import { useCesiumContext } from "../../context/hooks/use-cesium-context";
import { CtxEvent } from "../../context/cesium-context-event-map";

/**
 * Scene-level hook that coordinates scene style switching AND resource loading.
 *
 * Architecture:
 * - **Pure coordinator** - does NOT manipulate scene directly
 * - Reads style config and calls registered callbacks
 * - Tracks which resources are required for active style
 * - Emits SceneResourcesReady when all resources are loaded
 *
 * Responsibilities:
 * - Publish available style IDs to context
 * - Register style applier callback with context
 * - When style changes: determine required resources from config
 * - Track resource readiness and emit event when complete
 * - Call all registered callbacks for style changes
 *
 * Callbacks called:
 * - onTilesetsChange (useTilesetManager)
 * - onBackgroundColorChange (useBackgroundColor)
 * - onShadowsChange (useShadows)
 * - onGlobeSettingsChange (useCesiumGlobe)
 * - onImageryLayersChange (useImageryManager)
 * - onTerrainChange (useTerrainManager)
 */

interface ResourceTracker {
  required: Set<string>;
  ready: Set<string>;
  hasEmitted: boolean;
}

export const useSceneStyleSwitcher = (
  styleCallbacksRef: MutableRefObject<{
    onBackgroundColorChange?: (color: [number, number, number, number]) => void;
    onShadowsChange?: (enabled: boolean) => void;
    onGlobeSettingsChange?: (settings: Record<string, unknown>) => void;
    onTilesetsChange?: (tilesetRefs: Array<{ id: string }>) => void;
    onImageryLayersChange?: (
      layers: Array<{ id: string; opacity: number }>
    ) => void;
    onTerrainChange?: (terrainId: string) => void;
  }>,
  onSceneContentPresentable?: () => void,
  onSceneResourcesReady?: () => void
): MutableRefObject<{
  setResourceReady: (resourceId: string) => void;
  setResourcePresentable: (resourceId: string) => void;
}> => {
  const {
    config,
    currentSceneStyleRef,
    availableSceneStylesRef,
    sceneStyleApplierRef,
    subscribe,
  } = useCesiumContext();

  const sceneStyle = config.sceneStyle;

  // Track current style locally to deduplicate
  const localStyleRef = useRef<string | null>(null);

  // Track resource loading for SceneResourcesReady event (all resources fully loaded)
  const resourceTrackerRef = useRef<ResourceTracker>({
    required: new Set(),
    ready: new Set(),
    hasEmitted: false,
  });

  // Track presentable state (minimum content loaded per resource type)
  const presentableTrackerRef = useRef<{
    required: Set<string>;
    presentable: Set<string>;
    hasEmitted: boolean;
  }>({
    required: new Set(),
    presentable: new Set(),
    hasEmitted: false,
  });

  // Check if scene has minimum content to be presentable
  const checkAndEmitContentPresentable = () => {
    const tracker = presentableTrackerRef.current;

    if (tracker.hasEmitted) {
      return;
    }

    if (tracker.required.size === 0) {
      return;
    }

    const allPresentable = Array.from(tracker.required).every((id) =>
      tracker.presentable.has(id)
    );

    console.log("[StyleSwitcher|Presentable] Check:", {
      required: Array.from(tracker.required),
      presentable: Array.from(tracker.presentable),
      allPresentable,
    });

    if (allPresentable) {
      tracker.hasEmitted = true;
      console.log(
        "[StyleSwitcher|Presentable] ✅ Scene content presentable, calling callback"
      );
      onSceneContentPresentable?.();
    }
  };

  // Check if all resources are ready and emit event
  const checkAndEmitResourcesReady = () => {
    const tracker = resourceTrackerRef.current;

    if (tracker.hasEmitted) {
      console.log("[StyleSwitcher|Resources] Already emitted, skipping");
      return;
    }

    if (tracker.required.size === 0) {
      console.log("[StyleSwitcher|Resources] No resources required");
      return;
    }

    const allReady = Array.from(tracker.required).every((id) =>
      tracker.ready.has(id)
    );

    console.log("[StyleSwitcher|Resources] Check:", {
      required: Array.from(tracker.required),
      ready: Array.from(tracker.ready),
      allReady,
    });

    if (allReady) {
      tracker.hasEmitted = true;
      console.log(
        "[StyleSwitcher|Resources] ✅ All resources ready, calling callback"
      );
      onSceneResourcesReady?.();
    }
  };

  // API for resource managers to report readiness
  const coordinatorRef = useRef({
    setResourceReady: (resourceId: string) => {
      console.log(`[StyleSwitcher|Resources] ${resourceId} → READY`);
      resourceTrackerRef.current.ready.add(resourceId);
      checkAndEmitResourcesReady();
    },
    setResourcePresentable: (resourceId: string) => {
      console.log(`[StyleSwitcher|Presentable] ${resourceId} → PRESENTABLE`);
      presentableTrackerRef.current.presentable.add(resourceId);
      checkAndEmitContentPresentable();
    },
  });

  // Publish available styles to context on mount/change
  // Update context ref directly (internal coordination, NOT event bus)
  useEffect(() => {
    if (!sceneStyle?.styles || sceneStyle.styles.length === 0) {
      console.warn("[SceneStyleSwitcher] No styles configured");
      availableSceneStylesRef.current = [];
      return;
    }

    const styleIds = sceneStyle.styles.map((s) => s.id);
    console.log("[SceneStyleSwitcher] Available styles:", styleIds);

    // Update context ref directly (NOT via event bus)
    availableSceneStylesRef.current = styleIds;
  }, [sceneStyle, availableSceneStylesRef]);

  // Register style applier function with context and apply initial style
  // Context calls this when external consumers request style changes
  useEffect(() => {
    const applySceneStyle = (newStyle: string) => {
      // Deduplicate - ignore if already applying this style
      if (localStyleRef.current === newStyle) {
        console.log(
          `[SceneStyleSwitcher] Style "${newStyle}" already active, skipping`
        );
        return;
      }

      const timestamp = new Date().toISOString().split("T")[1];
      console.log(
        `[${timestamp}] [SceneStyleSwitcher] Applying scene style: ${newStyle}`
      );
      localStyleRef.current = newStyle;
      currentSceneStyleRef.current = newStyle;

      if (!sceneStyle) {
        console.warn("[SceneStyleSwitcher] No sceneStyle configured");
        return;
      }

      const style = sceneStyle.styles?.find((s) => s.id === newStyle);
      if (!style) {
        console.warn(
          `[SceneStyleSwitcher] Style id "${newStyle}" not found in sceneStyle.styles`
        );
        return;
      }

      console.log(`[SceneStyleSwitcher] Calling style callbacks for:`, style);

      // Reset resource trackers for new style
      resourceTrackerRef.current.required.clear();
      resourceTrackerRef.current.ready.clear();
      resourceTrackerRef.current.hasEmitted = false;

      presentableTrackerRef.current.required.clear();
      presentableTrackerRef.current.presentable.clear();
      presentableTrackerRef.current.hasEmitted = false;

      // Determine required resources from style config (use actual resource IDs)
      if (style.tilesets && style.tilesets.length > 0) {
        style.tilesets.forEach((t) => {
          if (t.id) {
            console.log(
              `[StyleSwitcher|Resources] ${t.id} → REQUIRED (applyStyle)`
            );
            resourceTrackerRef.current.required.add(t.id);
            presentableTrackerRef.current.required.add(t.id);
          }
        });
      }
      if (style.terrain) {
        console.log(
          `[StyleSwitcher|Resources] ${style.terrain} → REQUIRED (applyStyle)`
        );
        resourceTrackerRef.current.required.add(style.terrain);
        presentableTrackerRef.current.required.add(style.terrain);
      }
      if (style.imageryLayers && style.imageryLayers.length > 0) {
        style.imageryLayers.forEach((l) => {
          console.log(
            `[StyleSwitcher|Resources] ${l.id} → REQUIRED (applyStyle)`
          );
          resourceTrackerRef.current.required.add(l.id);
          presentableTrackerRef.current.required.add(l.id);
        });
      }
      if (style.globe) {
        console.log(`[StyleSwitcher|Resources] globe → REQUIRED (applyStyle)`);
        resourceTrackerRef.current.required.add("globe");
        presentableTrackerRef.current.required.add("globe");
      }
      if (style.backgroundColor) {
        console.log(
          `[StyleSwitcher|Resources] background → REQUIRED (applyStyle)`
        );
        resourceTrackerRef.current.required.add("background");
        presentableTrackerRef.current.required.add("background");
      }

      // Call all registered callbacks with style settings
      // Each hook (useTilesetManager, useBackgroundColor, etc.) handles its own domain
      // Filter tilesets with required IDs only
      const validTilesets = (style.tilesets || []).filter(
        (t): t is { id: string } => !!t.id
      );
      styleCallbacksRef.current.onTilesetsChange?.(validTilesets);
      styleCallbacksRef.current.onBackgroundColorChange?.(
        style.backgroundColor
      );
      styleCallbacksRef.current.onShadowsChange?.(style.shadows ?? false);
      styleCallbacksRef.current.onGlobeSettingsChange?.(style.globe || {});
      // Filter imagery layers with required fields
      const validImageryLayers = (style.imageryLayers || []).map((l) => ({
        id: l.id,
        opacity: l.opacity ?? 1,
      }));
      styleCallbacksRef.current.onImageryLayersChange?.(validImageryLayers);
      if (style.terrain) {
        styleCallbacksRef.current.onTerrainChange?.(style.terrain);
      }

      console.log(`[SceneStyleSwitcher] Style "${newStyle}" callbacks invoked`);
    };

    // Register applier function in context ref (NOT event bus subscription)
    // Context will call this function when external consumers request style changes
    sceneStyleApplierRef.current = applySceneStyle;
    console.log("[SceneStyleSwitcher] Registered style applier with context");

    // Wait for scene to be ready before applying initial style
    const unsubscribe = subscribe(CtxEvent.SceneReady, () => {
      console.log("[SceneStyleSwitcher] Scene ready - applying initial style");

      const initialStyle = currentSceneStyleRef.current;
      if (!initialStyle) {
        console.warn("[SceneStyleSwitcher] No initial style set in context");
        return;
      }

      const style = sceneStyle?.styles?.find((s) => s.id === initialStyle);
      if (!style) {
        console.warn(`[SceneStyleSwitcher] Style "${initialStyle}" not found`);
        return;
      }

      console.log(`[SceneStyleSwitcher] Calling style callbacks for:`, style);

      // Reset resource trackers for initial style
      resourceTrackerRef.current.required.clear();
      resourceTrackerRef.current.ready.clear();
      resourceTrackerRef.current.hasEmitted = false;

      presentableTrackerRef.current.required.clear();
      presentableTrackerRef.current.presentable.clear();
      presentableTrackerRef.current.hasEmitted = false;

      // Determine required resources from style config (use actual resource IDs)
      if (style.tilesets && style.tilesets.length > 0) {
        style.tilesets.forEach((t) => {
          if (t.id) {
            console.log(
              `[StyleSwitcher|Resources] ${t.id} → REQUIRED (initial)`
            );
            resourceTrackerRef.current.required.add(t.id);
            presentableTrackerRef.current.required.add(t.id);
          }
        });
      }
      if (style.terrain) {
        console.log(
          `[StyleSwitcher|Resources] ${style.terrain} → REQUIRED (initial)`
        );
        resourceTrackerRef.current.required.add(style.terrain);
        presentableTrackerRef.current.required.add(style.terrain);
      }
      if (style.imageryLayers && style.imageryLayers.length > 0) {
        style.imageryLayers.forEach((l) => {
          console.log(`[StyleSwitcher|Resources] ${l.id} → REQUIRED (initial)`);
          resourceTrackerRef.current.required.add(l.id);
          presentableTrackerRef.current.required.add(l.id);
        });
      }
      if (style.globe) {
        console.log(`[StyleSwitcher|Resources] globe → REQUIRED (initial)`);
        resourceTrackerRef.current.required.add("globe");
        presentableTrackerRef.current.required.add("globe");
      }
      if (style.backgroundColor) {
        console.log(
          `[StyleSwitcher|Resources] background → REQUIRED (initial)`
        );
        resourceTrackerRef.current.required.add("background");
        presentableTrackerRef.current.required.add("background");
      }

      // Call all registered callbacks with style settings
      // Filter tilesets with required IDs only
      const validTilesets = (style.tilesets || []).filter(
        (t): t is { id: string } => !!t.id
      );
      styleCallbacksRef.current.onTilesetsChange?.(validTilesets);
      styleCallbacksRef.current.onBackgroundColorChange?.(
        style.backgroundColor
      );
      styleCallbacksRef.current.onShadowsChange?.(style.shadows ?? false);
      styleCallbacksRef.current.onGlobeSettingsChange?.(style.globe || {});
      // Filter imagery layers with required fields
      const validImageryLayers = (style.imageryLayers || []).map((l) => ({
        id: l.id,
        opacity: l.opacity ?? 1,
      }));
      styleCallbacksRef.current.onImageryLayersChange?.(validImageryLayers);
      if (style.terrain) {
        styleCallbacksRef.current.onTerrainChange?.(style.terrain);
      }

      console.log("[SceneStyleSwitcher] Initial style callbacks invoked");
    });

    return () => {
      unsubscribe();
      sceneStyleApplierRef.current = null;
      console.log(
        "[SceneStyleSwitcher] Unregistered style applier from context"
      );
    };
    // Note: Refs (sceneRef, sceneStyleApplierRef, styleCallbacksRef, currentSceneStyleRef, subscribe)
    // are stable and don't need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneStyle]);

  // Return API for resource managers to report readiness
  return coordinatorRef;
};

export default useSceneStyleSwitcher;
