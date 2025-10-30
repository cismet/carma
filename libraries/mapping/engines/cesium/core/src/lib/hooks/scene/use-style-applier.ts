import { useEffect, useRef, type MutableRefObject } from "react";
import { useCesiumContext } from "../../context";

type ResourceTracker = {
  required: Set<string>;
  ready: Set<string>;
  hasEmitted: boolean;
};

type StyleCallbacks = {
  onTilesetsChange?: (tilesets: any[]) => void;
  onBackgroundColorChange?: (color: any) => void;
  onShadowsChange?: (enabled: boolean) => void;
  onGlobeSettingsChange?: (settings: any) => void;
  onImageryLayersChange?: (layers: any[]) => void;
  onTerrainChange?: (terrainId: string) => void;
};

const markResourcesRequired = (style: any, tracker: ResourceTracker) => {
  tracker.required.clear();
  tracker.ready.clear();
  tracker.hasEmitted = false;

  if (style.tilesets?.length > 0) {
    style.tilesets.forEach((t: any) => {
      console.log(`[SceneStyleManager|Resources] ${t.id} → REQUIRED`);
      tracker.required.add(t.id);
    });
  }
  if (style.terrain) {
    console.log(`[SceneStyleManager|Resources] ${style.terrain} → REQUIRED`);
    tracker.required.add(style.terrain);
  }
  if (style.imageryLayers?.length > 0) {
    style.imageryLayers.forEach((l: any) => {
      console.log(`[SceneStyleManager|Resources] ${l.id} → REQUIRED`);
      tracker.required.add(l.id);
    });
  }
  if (style.globe) {
    console.log(`[SceneStyleManager|Resources] globe → REQUIRED`);
    tracker.required.add("globe");
  }
  if (style.backgroundColor) {
    console.log(`[SceneStyleManager|Resources] background → REQUIRED`);
    tracker.required.add("background");
  }
};

const invokeStyleCallbacks = (style: any, callbacks: StyleCallbacks) => {
  callbacks.onTilesetsChange?.(style.tilesets || []);
  callbacks.onBackgroundColorChange?.(style.backgroundColor);
  callbacks.onShadowsChange?.(style.shadows ?? false);
  callbacks.onGlobeSettingsChange?.(style.globe || {});
  callbacks.onImageryLayersChange?.(style.imageryLayers || []);
  if (style.terrain) {
    callbacks.onTerrainChange?.(style.terrain);
  }
};

export const useStyleApplier = (
  sceneStyle: any,
  styleCallbacksRef: MutableRefObject<StyleCallbacks>,
  resourceTrackerRef: MutableRefObject<ResourceTracker>
) => {
  const {
    sceneRef,
    getCurrentSceneStyle,
    setCurrentSceneStyle,
    setSceneStyleApplier,
  } = useCesiumContext();

  const localStyleRef = useRef<string | null>(null);

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
      setCurrentSceneStyle(newStyle);

      if (!sceneStyle) {
        console.warn("[SceneStyleManager] No sceneStyle configured");
        return;
      }

      const style = sceneStyle.styles?.find((s: any) => s.id === newStyle);
      if (!style) {
        console.warn(
          `[SceneStyleManager] Style id "${newStyle}" not found in sceneStyle.styles`
        );
        return;
      }

      console.log(`[SceneStyleManager] Calling style callbacks for:`, style);

      markResourcesRequired(style, resourceTrackerRef.current);
      invokeStyleCallbacks(style, styleCallbacksRef.current);

      console.log(`[SceneStyleManager] Style "${newStyle}" callbacks invoked`);
    };

    setSceneStyleApplier(applySceneStyle);
    console.log("[SceneStyleManager] Registered style applier with context");

    const checkSceneReady = () => {
      const scene = sceneRef.current;
      if (scene && scene.isDestroyed() === false) {
        console.log("[SceneStyleManager] Scene ready - applying initial style");

        const initialStyle = getCurrentSceneStyle();
        if (!initialStyle) {
          console.warn("[SceneStyleManager] No initial style set in context");
          return;
        }

        const style = sceneStyle?.styles?.find(
          (s: any) => s.id === initialStyle
        );
        if (!style) {
          console.warn(`[SceneStyleManager] Style "${initialStyle}" not found`);
          return;
        }

        console.log(`[SceneStyleManager] Calling style callbacks for:`, style);

        markResourcesRequired(style, resourceTrackerRef.current);
        invokeStyleCallbacks(style, styleCallbacksRef.current);

        console.log("[SceneStyleManager] Initial style callbacks invoked");
      } else {
        setTimeout(checkSceneReady, 100);
      }
    };

    checkSceneReady();

    return () => {
      setSceneStyleApplier(null);
      console.log(
        "[SceneStyleManager] Unregistered style applier from context"
      );
    };
  }, [
    sceneStyle,
    sceneRef,
    getCurrentSceneStyle,
    setCurrentSceneStyle,
    setSceneStyleApplier,
    styleCallbacksRef,
    resourceTrackerRef,
  ]);
};
