import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { Color, type Scene } from "cesium";
import type { SceneStyleConfig } from "@carma/types";
import {
  CtxEvent,
  type SubscribeCesiumCtxFn,
  type EmitCesiumCtxFn,
} from "../../../cesiumContextEventMap";
import { isValidScene } from "../../../utils/instanceGates";

/**
 * Custom hook that manages all event subscriptions for CesiumContext refs.
 * Consolidates subscription logic to keep CesiumContextProvider clean.
 */
export const useCesiumContextSubscriptions = ({
  subscribe,
  emit,
  sceneRef,
  isSuspendedRef,
  isAnimatingRef,
  minZoomDistanceRef,
  maxZoomDistanceRef,
  enableCollisionDetectionRef,
  currentSceneStyleRef,
  homePositionRef,
  homeOffsetRef,
  sceneStyles,
}: {
  subscribe: SubscribeCesiumCtxFn;
  emit: EmitCesiumCtxFn;
  sceneRef: MutableRefObject<Scene | null>;
  isSuspendedRef: MutableRefObject<boolean>;
  isAnimatingRef: MutableRefObject<boolean>;
  minZoomDistanceRef: MutableRefObject<number>;
  maxZoomDistanceRef: MutableRefObject<number>;
  enableCollisionDetectionRef: MutableRefObject<boolean>;
  currentSceneStyleRef: MutableRefObject<string | undefined>;
  homePositionRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
  homeOffsetRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
  sceneStyles?: SceneStyleConfig[];
}) => {
  // Update isSuspendedRef when suspend/activate events are emitted
  useEffect(() => {
    const unsubActivate = subscribe(CtxEvent.Activate, () => {
      isSuspendedRef.current = false;

      const currentStyle = currentSceneStyleRef.current;
      if (currentStyle) {
        console.debug(
          "[CesiumContext] Reapplying style on activate:",
          currentStyle
        );
        emit(CtxEvent.SetSceneStyle, currentStyle);
      }
    });
    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      isSuspendedRef.current = true;
    });
    return () => {
      unsubActivate();
      unsubSuspend();
    };
  }, [subscribe, isSuspendedRef, currentSceneStyleRef, emit]);

  // Update isAnimatingRef when animation events are emitted
  useEffect(() => {
    const unsubStart = subscribe(CtxEvent.AnimationStart, () => {
      isAnimatingRef.current = true;
      console.debug("[CesiumContext] Animation started");
    });
    const unsubEnd = subscribe(CtxEvent.AnimationEnd, () => {
      isAnimatingRef.current = false;
      console.debug("[CesiumContext] Animation ended");
    });
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, [subscribe, isAnimatingRef]);

  // DISABLED: Camera controller setting events (for minimal mode)
  /* useEffect(() => {
    const unsubMinZoom = subscribe(CtxEvent.SetMinZoomDistance, (value) => {
      minZoomDistanceRef.current = value;
      const scene = sceneRef.current;
      if (scene?.screenSpaceCameraController) {
        scene.screenSpaceCameraController.minimumZoomDistance = value;
        console.debug("[CesiumContext] Set min zoom distance:", value);
      }
    });

    const unsubMaxZoom = subscribe(CtxEvent.SetMaxZoomDistance, (value) => {
      maxZoomDistanceRef.current = value;
      const scene = sceneRef.current;
      if (scene?.screenSpaceCameraController) {
        scene.screenSpaceCameraController.maximumZoomDistance = value;
        console.debug("[CesiumContext] Set max zoom distance:", value);
      }
    });

    const unsubCollision = subscribe(
      CtxEvent.SetEnableCollisionDetection,
      (value) => {
        enableCollisionDetectionRef.current = value;
        const scene = sceneRef.current;
        if (scene?.screenSpaceCameraController) {
          scene.screenSpaceCameraController.enableCollisionDetection = value;
          console.debug("[CesiumContext] Set collision detection:", value);
        }
      }
    );

    return () => {
      unsubMinZoom();
      unsubMaxZoom();
      unsubCollision();
    };
  }, [
    subscribe,
    sceneRef,
    minZoomDistanceRef,
    maxZoomDistanceRef,
    enableCollisionDetectionRef,
  ]); */

  // DISABLED: Scene style events (for minimal mode)
  /* useEffect(() => {
    const applySceneStyle = (newStyle: string) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) {
        console.warn(
          "[CesiumContext] Cannot apply scene style - invalid scene"
        );
        return;
      }

      console.debug("[CesiumContext] Applying scene style:", newStyle);

      if (!Array.isArray(sceneStyles)) {
        console.warn("[CesiumContext] Legacy object-based sceneStyles no longer supported");
        return;
      }

      const styleIndex = sceneStyles.findIndex(s => s.id === newStyle);
      if (styleIndex === -1) {
        console.warn(`[CesiumContext] Style ID "${newStyle}" not found in sceneStyles array`);
        return;
      }

      const style = sceneStyles[styleIndex];
      console.debug(`[CesiumContext] Applying style "${newStyle}" (slot ${styleIndex}):`, style);

      if (style.backgroundColor) {
        scene.backgroundColor = Color.fromBytes(...style.backgroundColor);
      }

      if (style.globe?.baseColor) {
        scene.globe.baseColor = Color.fromBytes(...style.globe.baseColor);
      }

      const allTilesetIds = new Set<string>();
      sceneStyles.forEach(s => {
        s.tilesets?.forEach(t => allTilesetIds.add(t.id));
      });

      allTilesetIds.forEach(id => {
        const isInCurrentStyle = style.tilesets?.some(t => t.id === id);
        emit(CtxEvent.SetTilesetVisibility, { 
          id, 
          visible: isInCurrentStyle ?? false 
        });
      });

      if (style.tilesets) {
        style.tilesets.forEach(({ id, opacity }) => {
          if (opacity !== undefined) {
            emit(CtxEvent.SetTilesetOpacity, { id, opacity });
          }
        });
      }

      if (style.imagery) {
        console.debug(`[CesiumContext] Managing ${style.imagery.length} imagery layers`);
        scene.imageryLayers.removeAll();
        
        style.imagery.forEach(({ id, opacity }) => {
          console.debug(`[CesiumContext] Would load imagery: ${id} (opacity: ${opacity ?? 1.0})`);
        });
      }

      if (style.terrain) {
        console.debug(`[CesiumContext] Would switch terrain to: ${style.terrain}`);
      }

      console.debug(`[CesiumContext] Successfully applied style "${newStyle}"`);
    };

    const unsubSetStyle = subscribe(CtxEvent.SetSceneStyle, (value) => {
      currentSceneStyleRef.current = value;
      console.debug("[CesiumContext] Set scene style:", value);
      applySceneStyle(value);
    });

    const unsubToggleStyle = subscribe(CtxEvent.ToggleSceneStyle, () => {
      if (!Array.isArray(sceneStyles) || sceneStyles.length < 2) {
        console.warn("[CesiumContext] Cannot toggle - need at least 2 styles in config");
        return;
      }

      const currentStyle = currentSceneStyleRef.current;
      const currentIndex = sceneStyles.findIndex(s => s.id === currentStyle);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % sceneStyles.length;
      const newStyle = sceneStyles[nextIndex].id;
      
      currentSceneStyleRef.current = newStyle;
      console.debug(`[CesiumContext] Toggle: ${currentStyle} -> ${newStyle} (slot ${currentIndex} -> ${nextIndex})`);
      applySceneStyle(newStyle);
    });

    return () => {
      unsubSetStyle();
      unsubToggleStyle();
    };
  }, [subscribe, emit, currentSceneStyleRef, sceneRef, sceneStyles]); */

  // DISABLED: Tileset visibility/opacity events (deprecated refs)
  /* useEffect(() => {
    const unsubSetVisibility = subscribe(
      CtxEvent.SetTilesetVisibility,
      ({ id, visible }) => {
        tilesetVisibilityRef.current.set(id, visible);
        console.debug("[CesiumContext] Set tileset visibility:", {
          id,
          visible,
        });
      }
    );

    return () => {
      unsubSetVisibility();
    };
  }, [subscribe, tilesetVisibilityRef]);

  // Subscribe to tileset opacity events
  useEffect(() => {
    const unsubSetOpacity = subscribe(
      CtxEvent.SetTilesetOpacity,
      ({ id, opacity }) => {
        tilesetOpacityRef.current.set(id, opacity);
        console.debug("[CesiumContext] Set tileset opacity:", { id, opacity });
      }
    );

    return () => {
      unsubSetOpacity();
    };
  }, [subscribe, tilesetOpacityRef]); */

  // DISABLED: Home position events (for minimal mode)
  /* useEffect(() => {
    const unsubSetHomePosition = subscribe(
      CtxEvent.SetHomePosition,
      (position) => {
        homePositionRef.current = position;
        console.debug("[CesiumContext] Set home position:", position);
      }
    );

    const unsubSetHomeOffset = subscribe(CtxEvent.SetHomeOffset, (offset) => {
      homeOffsetRef.current = offset;
      console.debug("[CesiumContext] Set home offset:", offset);
    });

    return () => {
      unsubSetHomePosition();
      unsubSetHomeOffset();
    };
  }, [subscribe, homePositionRef, homeOffsetRef]); */
};
