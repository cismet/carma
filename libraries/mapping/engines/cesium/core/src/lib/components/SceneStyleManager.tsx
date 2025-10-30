import { useEffect, useRef, useCallback } from "react";
import { useCesiumContext } from "../context/hooks/use-cesium-context";
import { useSceneStyleResources } from "../hooks/scene/use-scene-style-resources";
import { useTilesetManager } from "../hooks/resources/tilesets/use-tileset-manager";
import { useImageryManager } from "../hooks/resources/imagery/use-imagery-manager";
import { useTerrainManager } from "../hooks/resources/terrain/use-terrain-manager";
import { useCesiumGlobe } from "../hooks/scene/use-cesium-globe";
import { useShadows } from "../hooks/scene/use-shadows";
import { useBackgroundColor } from "../hooks/scene/use-background-color";
import { useStyleApplier } from "../hooks/scene/use-style-applier";

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
    getCurrentSceneStyle,
    setAvailableSceneStyles,
    setSceneStyleReadyState,
    getSceneStyleReadyCallback,
  } = useCesiumContext();

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
      const currentStyle = getCurrentSceneStyle();

      if (!currentStyle) {
        console.warn("[SceneStyleManager|ReadyReport] No current style set");
        return;
      }

      // Update context ref with current readiness state
      setSceneStyleReadyState({
        currentStyle,
        isReady,
        requiredResources: Array.from(tracker.required),
        readyResources: Array.from(tracker.ready),
      });

      // Notify context via callback (context can emit events to external consumers)
      const callback = getSceneStyleReadyCallback();
      callback?.(isReady, currentStyle);

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
    [getCurrentSceneStyle, setSceneStyleReadyState, getSceneStyleReadyCallback]
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
      const callback = getSceneStyleReadyCallback();
      callback?.(true, "scene-resources-ready");
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

  // Initialize resource managers with readiness tracking
  useTilesetManager(
    tilesets,
    styleCallbacksRef,
    false,
    resourceCoordinatorRef.current.setResourceReady
  );
  useImageryManager(
    imagery,
    styleCallbacksRef,
    resourceCoordinatorRef.current.setResourceReady
  );
  useTerrainManager(terrain, resourceCoordinatorRef.current.setResourceReady);

  useCesiumGlobe(
    styleCallbacksRef,
    () => resourceCoordinatorRef.current.setResourceReady("globe")
  );
  useShadows();
  useBackgroundColor(
    styleCallbacksRef,
    () => resourceCoordinatorRef.current.setResourceReady("background")
  );

  // Publish available styles to context
  useEffect(() => {
    if (!sceneStyle?.styles || sceneStyle.styles.length === 0) {
      console.warn("[SceneStyleManager] No styles configured");
      setAvailableSceneStyles([]);
      return;
    }

    const styleIds = sceneStyle.styles.map((s) => s.id);
    console.log("[SceneStyleManager] Available styles:", styleIds);
    setAvailableSceneStyles(styleIds);
  }, [sceneStyle, setAvailableSceneStyles]);

  // Register style applier and apply initial style
  useStyleApplier(sceneStyle, styleCallbacksRef, resourceTrackerRef);

  return null;
};
