import { useEffect, useRef, useCallback } from "react";
import { Color } from "@carma/cesium";
import { useCesiumContext } from "../context/hooks/use-cesium-context";
import { useSceneStyleResources } from "../hooks/scene/use-scene-style-resources";
import { useTilesetManager } from "../hooks/resources/tilesets/use-tileset-manager";
import { useImageryManager } from "../hooks/resources/imagery/use-imagery-manager";
import { useTerrainManager } from "../hooks/resources/terrain/use-terrain-manager";
import { useCesiumGlobe } from "../hooks/scene/use-cesium-globe";
import { useShadows } from "../hooks/scene/use-shadows";

/**
 * SceneStyleManager Component
 *
 * Manages scene styles, resource loading, and readiness coordination.
 *
 * Responsibilities:
 * - Coordinates style switching via callbacks
 * - Tracks which resources are required for active style
 * - Manages all resource hooks (tilesets, terrain, imagery)
 * - Manages all appearance hooks (globe, background, shadows)
 * - Reports readiness to context via refs and callbacks (NOT event bus)
 *
 * Architecture:
 * - Receives style config via props from CesiumSceneComponent
 * - Accesses context for refs, events, and coordination
 * - Provides coordinator API to resource managers
 * - Reports style readiness via context refs (internal coordination)
 * - Context can emit events to external consumers if needed
 * - Pure coordination - no direct scene manipulation
 */

export interface SceneStyleManagerProps {
  sceneStyle: any; // TODO: Type this properly based on your config structure
}

export const SceneStyleManager = ({ sceneStyle }: SceneStyleManagerProps) => {
  const {
    currentSceneStyleRef,
    availableSceneStylesRef,
    sceneStyleApplierRef,
    sceneStyleReadyStateRef,
    sceneStyleReadyCallbackRef,
    sceneRef,
  } = useCesiumContext();
  const localStyleRef = useRef<string | null>(null);

  // Track resource loading for reporting to context
  const resourceTrackerRef = useRef<{
    required: Set<string>;
    ready: Set<string>;
    hasEmitted: boolean;
  }>({
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

  // Report style readiness to context via refs and callback
  const reportStyleReadiness = useCallback(
    (isReady: boolean) => {
      const tracker = resourceTrackerRef.current;
      const currentStyle = currentSceneStyleRef.current;

      if (!currentStyle) {
        console.warn("[SceneStyleManager|ReadyReport] No current style set");
        return;
      }

      // Update context ref with current readiness state
      sceneStyleReadyStateRef.current = {
        currentStyle,
        isReady,
        requiredResources: Array.from(tracker.required),
        readyResources: Array.from(tracker.ready),
      };

      // Notify context via callback (context can emit events to external consumers)
      sceneStyleReadyCallbackRef.current?.(isReady, currentStyle);

      console.log(
        `[SceneStyleManager|ReadyReport] Style "${currentStyle}" → ${
          isReady ? "READY" : "LOADING"
        }`,
        {
          required: Array.from(tracker.required),
          ready: Array.from(tracker.ready),
        }
      );
    },
    [currentSceneStyleRef, sceneStyleReadyStateRef, sceneStyleReadyCallbackRef]
  );

  // Check if all resources are ready and report to context
  const checkAndReportResourcesReady = useCallback(() => {
    const tracker = resourceTrackerRef.current;

    if (tracker.hasEmitted) {
      console.log("[SceneStyleManager|Resources] Already emitted, skipping");
      return;
    }

    if (tracker.required.size === 0) {
      console.log("[SceneStyleManager|Resources] No resources required");
      return;
    }

    const allReady = Array.from(tracker.required).every((id) =>
      tracker.ready.has(id)
    );

    console.log("[SceneStyleManager|Resources] Check:", {
      required: Array.from(tracker.required),
      ready: Array.from(tracker.ready),
      allReady,
    });

    if (allReady) {
      tracker.hasEmitted = true;
      console.log(
        "[SceneStyleManager|Resources] ✅ All resources ready, emitting via context"
      );
      // Direct callback instead of event emission
      sceneStyleReadyCallbackRef.current?.(true, "scene-resources-ready");
      reportStyleReadiness(true);
    }
  }, [reportStyleReadiness]);

  // API for resource managers to report readiness
  // TODO: Once hooks are updated, they will call this to report individual resource readiness
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const resourceCoordinatorRef = useRef({
    setResourceReady: (resourceId: string) => {
      console.log(`[SceneStyleManager|Resources] ${resourceId} → READY`);
      resourceTrackerRef.current.ready.add(resourceId);
      checkAndReportResourcesReady();
    },
  });

  // Style callbacks ref for resource managers to register their handlers
  const styleCallbacksRef = useRef<{
    onBackgroundColorChange?: (color: [number, number, number, number]) => void;
    onShadowsChange?: (enabled: boolean) => void;
    onGlobeSettingsChange?: (settings: any) => void;
    onTilesetsChange?: (tilesetRefs: Array<{ id: string }>) => void;
    onImageryLayersChange?: (
      layers: Array<{ id: string; opacity: number }>
    ) => void;
    onTerrainChange?: (terrainId: string) => void;
  }>({});

  // Extract resources from style config (passed as prop)
  const { tilesets, terrain, imagery } = useSceneStyleResources({ sceneStyle });

  console.log("[SceneStyleManager] Managing resources:", {
    tilesets,
    terrain,
    imagery,
  });

  // TODO: Update these hooks to accept resourceCoordinatorRef for style readiness reporting
  // For now, they use their own progress tracking mechanisms
  // Initialize resource managers (they register callbacks in styleCallbacksRef)
  useTilesetManager(tilesets, styleCallbacksRef, false); // TODO: Pass resourceCoordinatorRef
  useImageryManager(imagery, styleCallbacksRef); // TODO: Pass resourceCoordinatorRef
  useTerrainManager(terrain); // TODO: Pass resourceCoordinatorRef

  // Initialize appearance managers (they register callbacks in styleCallbacksRef)
  useCesiumGlobe(styleCallbacksRef); // TODO: Pass resourceCoordinatorRef
  useShadows();

  // Initialize background color hook with callback mechanism
  useEffect(() => {
    const handleBackgroundColorChange = (
      backgroundColor: [number, number, number, number]
    ) => {
      const scene = sceneRef.current;
      if (!scene) return;

      (() => {
        const [r, g, b, a] = backgroundColor;
        const bgColor = new Color(r, g, b, a);
        scene.backgroundColor = bgColor;

        // Also set the container background color for consistency
        const container = scene.canvas.parentElement;
        if (container) {
          const cssColor = bgColor.toCssColorString();
          container.style.backgroundColor = cssColor;

          // Ensure canvas itself has solid background
          scene.canvas.style.backgroundColor = cssColor;

          console.debug(
            "[CESIUM|BACKGROUND] Background color set:",
            backgroundColor,
            "CSS color:",
            cssColor
          );
        }
        scene.requestRender();
      })();
    };

    // Register callback
    const currentCallbacks = styleCallbacksRef.current;
    currentCallbacks.onBackgroundColorChange = handleBackgroundColorChange;

    return () => {
      currentCallbacks.onBackgroundColorChange = undefined;
    };
  }, [sceneRef, styleCallbacksRef]);

  // Publish available styles to context
  useEffect(() => {
    if (!sceneStyle?.styles || sceneStyle.styles.length === 0) {
      console.warn("[SceneStyleManager] No styles configured");
      availableSceneStylesRef.current = [];
      return;
    }

    const styleIds = sceneStyle.styles.map((s) => s.id);
    console.log("[SceneStyleManager] Available styles:", styleIds);
    availableSceneStylesRef.current = styleIds;
  }, [sceneStyle, availableSceneStylesRef]);

  // Register style applier and apply initial style
  useEffect(() => {
    const applySceneStyle = (newStyle: string) => {
      if (localStyleRef.current === newStyle) {
        console.log(
          `[SceneStyleManager] Style "${newStyle}" already active, skipping`
        );
        return;
      }

      const timestamp = new Date().toISOString().split("T")[1];
      console.log(
        `[${timestamp}] [SceneStyleManager] Applying scene style: ${newStyle}`
      );
      localStyleRef.current = newStyle;
      currentSceneStyleRef.current = newStyle;

      if (!sceneStyle) {
        console.warn("[SceneStyleManager] No sceneStyle configured");
        return;
      }

      const style = sceneStyle.styles?.find((s) => s.id === newStyle);
      if (!style) {
        console.warn(
          `[SceneStyleManager] Style id "${newStyle}" not found in sceneStyle.styles`
        );
        return;
      }

      console.log(`[SceneStyleManager] Calling style callbacks for:`, style);

      // Reset resource tracker for new style
      resourceTrackerRef.current.required.clear();
      resourceTrackerRef.current.ready.clear();
      resourceTrackerRef.current.hasEmitted = false;

      // Determine required resources from style config
      if (style.tilesets && style.tilesets.length > 0) {
        style.tilesets.forEach((t) => {
          console.log(`[SceneStyleManager|Resources] ${t.id} → REQUIRED`);
          resourceTrackerRef.current.required.add(t.id);
        });
      }
      if (style.terrain) {
        console.log(
          `[SceneStyleManager|Resources] ${style.terrain} → REQUIRED`
        );
        resourceTrackerRef.current.required.add(style.terrain);
      }
      if (style.imageryLayers && style.imageryLayers.length > 0) {
        style.imageryLayers.forEach((l) => {
          console.log(`[SceneStyleManager|Resources] ${l.id} → REQUIRED`);
          resourceTrackerRef.current.required.add(l.id);
        });
      }
      if (style.globe) {
        console.log(`[SceneStyleManager|Resources] globe → REQUIRED`);
        resourceTrackerRef.current.required.add("globe");
      }
      if (style.backgroundColor) {
        console.log(`[SceneStyleManager|Resources] background → REQUIRED`);
        resourceTrackerRef.current.required.add("background");
      }

      // Call all registered callbacks
      styleCallbacksRef.current.onTilesetsChange?.(style.tilesets || []);
      styleCallbacksRef.current.onBackgroundColorChange?.(
        style.backgroundColor
      );
      styleCallbacksRef.current.onShadowsChange?.(style.shadows ?? false);
      styleCallbacksRef.current.onGlobeSettingsChange?.(style.globe || {});
      styleCallbacksRef.current.onImageryLayersChange?.(
        style.imageryLayers || []
      );
      if (style.terrain) {
        styleCallbacksRef.current.onTerrainChange?.(style.terrain);
      }

      console.log(`[SceneStyleManager] Style "${newStyle}" callbacks invoked`);
    };

    // Register applier
    sceneStyleApplierRef.current = applySceneStyle;
    console.log("[SceneStyleManager] Registered style applier with context");

    // Wait for scene ready, then apply initial style using polling
    const checkSceneReady = () => {
      const scene = sceneRef.current;
      if (scene && scene.isDestroyed() === false) {
        console.log("[SceneStyleManager] Scene ready - applying initial style");

        const initialStyle = currentSceneStyleRef.current;
        if (!initialStyle) {
          console.warn("[SceneStyleManager] No initial style set in context");
          return;
        }

        const style = sceneStyle?.styles?.find((s) => s.id === initialStyle);
        if (!style) {
          console.warn(`[SceneStyleManager] Style "${initialStyle}" not found`);
          return;
        }

        console.log(`[SceneStyleManager] Calling style callbacks for:`, style);

        // Reset resource tracker
        resourceTrackerRef.current.required.clear();
        resourceTrackerRef.current.ready.clear();
        resourceTrackerRef.current.hasEmitted = false;

        // Determine required resources
        if (style.tilesets && style.tilesets.length > 0) {
          style.tilesets.forEach((t) => {
            console.log(
              `[SceneStyleManager|Resources] ${t.id} → REQUIRED (initial)`
            );
            resourceTrackerRef.current.required.add(t.id);
          });
        }
        if (style.terrain) {
          console.log(
            `[SceneStyleManager|Resources] ${style.terrain} → REQUIRED (initial)`
          );
          resourceTrackerRef.current.required.add(style.terrain);
        }
        if (style.imageryLayers && style.imageryLayers.length > 0) {
          style.imageryLayers.forEach((l) => {
            console.log(
              `[SceneStyleManager|Resources] ${l.id} → REQUIRED (initial)`
            );
            resourceTrackerRef.current.required.add(l.id);
          });
        }
        if (style.globe) {
          console.log(`[SceneStyleManager|Resources] globe → REQUIRED (initial)`);
          resourceTrackerRef.current.required.add("globe");
        }
        if (style.backgroundColor) {
          console.log(
            `[SceneStyleManager|Resources] background → REQUIRED (initial)`
          );
          resourceTrackerRef.current.required.add("background");
        }

        // Call all registered callbacks
        styleCallbacksRef.current.onTilesetsChange?.(style.tilesets || []);
        styleCallbacksRef.current.onBackgroundColorChange?.(
          style.backgroundColor
        );
        styleCallbacksRef.current.onShadowsChange?.(style.shadows ?? false);
        styleCallbacksRef.current.onGlobeSettingsChange?.(style.globe || {});
        styleCallbacksRef.current.onImageryLayersChange?.(
          style.imageryLayers || []
        );
        if (style.terrain) {
          styleCallbacksRef.current.onTerrainChange?.(style.terrain);
        }

        console.log("[SceneStyleManager] Initial style callbacks invoked");
      } else {
        // Scene not ready yet, check again in 100ms
        setTimeout(checkSceneReady, 100);
      }
    };

    // Start checking immediately
    checkSceneReady();

    return () => {
      sceneStyleApplierRef.current = null;
      console.log(
        "[SceneStyleManager] Unregistered style applier from context"
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneStyle]);

  return null;
};
