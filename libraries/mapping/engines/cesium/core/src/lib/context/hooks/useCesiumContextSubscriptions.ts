import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { Color, type Scene } from "cesium";
import type { SceneStyleConfig, CesiumConfig } from "../../types/config";
import {
  CtxEvent,
  type SubscribeCesiumCtxFn,
  type EmitCesiumCtxFn,
} from "../cesiumContextEventMap";
import { isValidScene } from "@carma-mapping/engines/cesium/api";

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
  config,
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
  config: CesiumConfig;
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

  useEffect(() => {
    const applySceneStyle = (newStyle: string) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene) || !scene) {
        console.warn(
          "[CesiumContext] Cannot apply scene style - invalid scene"
        );
        return;
      }

      console.debug("[CesiumContext] Applying scene style:", newStyle);

      if (!Array.isArray(sceneStyles)) {
        console.warn(
          "[CesiumContext] Legacy object-based sceneStyles no longer supported"
        );
        return;
      }

      const styleIndex = sceneStyles.findIndex((s) => s.id === newStyle);
      if (styleIndex === -1) {
        console.warn(
          `[CesiumContext] Style id "${newStyle}" not found in sceneStyles array`
        );
        return;
      }

      const style = sceneStyles[styleIndex];
      console.debug(
        `[CesiumContext] Applying style "${newStyle}" (slot ${styleIndex}):`,
        style
      );

      // Apply background color to scene
      if (style.backgroundColor) {
        const bgColor = Color.fromBytes(...style.backgroundColor);
        scene.backgroundColor = bgColor;

        // Also apply to the canvas container element for consistent background
        const container = scene.canvas.parentElement;
        if (container) {
          const cssColor = bgColor.toCssColorString();
          container.style.backgroundColor = cssColor;
          console.debug("[CesiumContext] Set container background:", cssColor);
        }
      }

      // Apply globe settings
      if (style.globe?.baseColor) {
        scene.globe.baseColor = Color.fromBytes(...style.globe.baseColor);
        // Ensure globe is visible when style defines globe settings
        scene.globe.show = true;
      }

      // Apply shadow settings
      // Default to disabled if not explicitly specified in style
      const shadowsEnabled = style.shadows ?? false;
      console.debug(
        "[CesiumContext] Applying shadows:",
        shadowsEnabled ? "ENABLED" : "DISABLED"
      );

      scene.globe.enableLighting = shadowsEnabled;
      scene.shadowMap.enabled = shadowsEnabled;

      // Also disable shadows on terrain if shadows are disabled
      if (!shadowsEnabled && scene.globe.terrainProvider) {
        (scene.globe.terrainProvider as any).castShadows = false;
        (scene.globe.terrainProvider as any).receiveShadows = false;
      }

      const allTilesetIds = new Set<string>();

      // Get ALL tilesets from config, not just those in styles
      if (config.tilesets) {
        config.tilesets.forEach((t) => {
          const tilesetId = t.id || t.config.id;
          if (tilesetId) allTilesetIds.add(tilesetId);
        });
      }

      // Check visibility for all tilesets
      console.groupCollapsed(
        `[CesiumContext] Style "${newStyle}": Updating ${allTilesetIds.size} tilesets`
      );
      allTilesetIds.forEach((id) => {
        const isInCurrentStyle = style.tilesets?.some((t) => t.id === id);
        const visible = isInCurrentStyle ?? false;
        console.log(`  ${visible ? "✓ SHOW" : "✗ HIDE"}: ${id}`);
        emit(CtxEvent.SetTilesetVisibility, {
          id,
          visible,
        });
      });
      console.groupEnd();

      if (style.tilesets) {
        style.tilesets.forEach(({ id, opacity }) => {
          if (opacity !== undefined) {
            emit(CtxEvent.SetTilesetOpacity, { id, opacity });
          }
        });
      }

      // Handle imagery layers
      const allImageryIds = new Set<string>();

      // Get ALL imagery layers from config
      if (config.imageryProviders) {
        config.imageryProviders.forEach((ip) => {
          const cfg = ip.config as any;
          const layerId = ip.layer || cfg.layer || cfg.layers;
          if (layerId) allImageryIds.add(layerId);
        });
      }

      // Check visibility for all imagery layers
      allImageryIds.forEach((id) => {
        const isInCurrentStyle = style.imageryLayers?.some(
          (il) => il.layer === id
        );
        emit(CtxEvent.SetImageryVisibility, {
          id,
          visible: isInCurrentStyle ?? false,
        });
      });

      // Set opacity for imagery layers in style
      if (style.imageryLayers) {
        style.imageryLayers.forEach(({ layer, opacity }) => {
          if (opacity !== undefined) {
            emit(CtxEvent.SetImageryOpacity, { id: layer, opacity });
          }
        });
      }

      // Handle terrain
      if (style.terrainLayer) {
        // Get all available terrain IDs from config
        const availableTerrainIds = new Set(
          config.terrainProviders?.map((tp) => {
            const cfg = tp.config as any;
            return tp.id || cfg.id;
          }) || []
        );

        console.log(
          `[CesiumContext] Terrain "${style.terrainLayer}" requested from style, ` +
            (availableTerrainIds.has(style.terrainLayer)
              ? "FOUND"
              : "NOT FOUND") +
            ` in provider list`
        );

        if (availableTerrainIds.has(style.terrainLayer)) {
          emit(CtxEvent.SetTerrainProvider, { id: style.terrainLayer });
        }
      } else {
        scene.globe.show = false;
        console.log(
          "[CesiumContext] Terrain disabled - no terrainLayer in style"
        );
      }

      // Wait for next frame to log actual primitive states after visibility updates
      requestAnimationFrame(() => {
        console.groupCollapsed(
          `[CesiumContext] Scene primitives after style "${newStyle}"`
        );
        for (let i = 0; i < scene.primitives.length; i++) {
          const primitive = scene.primitives.get(i);
          const primitiveType = primitive.constructor.name;

          if (primitiveType === "Cesium3DTileset") {
            const tileset = primitive as any;
            console.log(
              `  [${i}] Tileset: ${tileset.url || "unknown"} - show: ${
                tileset.show
              }`
            );
          } else {
            const show = (primitive as any).show;
            console.log(
              `  [${i}] ${primitiveType} - show: ${
                show !== undefined ? show : "N/A"
              }`
            );
          }
        }
        console.log(`Total primitives: ${scene.primitives.length}`);
        console.groupEnd();

        console.groupCollapsed(
          `[CesiumContext] Imagery layers after style "${newStyle}"`
        );
        for (let i = 0; i < scene.imageryLayers.length; i++) {
          const layer = scene.imageryLayers.get(i);
          console.log(
            `  [${i}] ${layer.imageryProvider.constructor.name} - show: ${layer.show}, alpha: ${layer.alpha}`
          );
        }
        console.log(`Total imagery layers: ${scene.imageryLayers.length}`);
        console.groupEnd();

        console.log(
          `[CesiumContext] Shadow state: enableLighting=${scene.globe.enableLighting}, shadowMap.enabled=${scene.shadowMap.enabled}`
        );
      });

      console.debug(`[CesiumContext] Successfully applied style "${newStyle}"`);
    };

    const unsubSetStyle = subscribe(CtxEvent.SetSceneStyle, (value: string) => {
      currentSceneStyleRef.current = value;
      console.debug("[CesiumContext] Set scene style:", value);
      applySceneStyle(value);
    });

    const unsubToggleStyle = subscribe(CtxEvent.ToggleSceneStyle, () => {
      if (!Array.isArray(sceneStyles) || sceneStyles.length < 2) {
        console.warn(
          "[CesiumContext] Cannot toggle - need at least 2 styles in config"
        );
        return;
      }

      const currentStyle = currentSceneStyleRef.current;
      const currentIndex = sceneStyles.findIndex((s) => s.id === currentStyle);
      const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % sceneStyles.length;
      const newStyle = sceneStyles[nextIndex].id;

      currentSceneStyleRef.current = newStyle;
      console.debug(
        `[CesiumContext] Toggle: ${currentStyle} -> ${newStyle} (slot ${currentIndex} -> ${nextIndex})`
      );
      applySceneStyle(newStyle);
    });

    return () => {
      unsubSetStyle();
      unsubToggleStyle();
    };
  }, [subscribe, emit, currentSceneStyleRef, sceneRef, sceneStyles, config]);

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
