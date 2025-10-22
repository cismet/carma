import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { Scene, Cesium3DTileset, ImageryLayer } from "@carma/cesium";
import type { SceneStyleConfig, CesiumConfig } from "../../types/config";
import type { CameraViewOptions } from "../../types/camera";
import {
  CtxEvent,
  type SubscribeCesiumCtxFn,
  type EmitCesiumCtxFn,
} from "../cesium-context-event-map";
import { isValidScene } from "../../utils/lazy-validators";
import { diffTilesets, diffImageryLayers } from "../../scene/style-diff";

/**
 * Custom hook that manages all event subscriptions for CesiumContext refs.
 * Consolidates subscription logic to keep CesiumContextProvider clean.
 */
export const useContextSetupSubscriptions = ({
  subscribe,
  emit,
  sceneRef,
  isSuspendedRef,
  tilesetsRef,
  imageryLayersRef,
  isAnimatingRef,
  minZoomDistanceRef,
  maxZoomDistanceRef,
  enableCollisionDetectionRef,
  currentSceneStyleRef,
  homeRef,
  sceneStyle,
  config,
}: {
  subscribe: SubscribeCesiumCtxFn;
  emit: EmitCesiumCtxFn;
  sceneRef: MutableRefObject<Scene | null | false>;
  tilesetsRef: MutableRefObject<Map<string, Cesium3DTileset>>;
  imageryLayersRef: MutableRefObject<Map<string, ImageryLayer>>;
  isSuspendedRef: MutableRefObject<boolean>;
  isAnimatingRef: MutableRefObject<boolean>;
  minZoomDistanceRef: MutableRefObject<number>;
  maxZoomDistanceRef: MutableRefObject<number>;
  enableCollisionDetectionRef: MutableRefObject<boolean>;
  currentSceneStyleRef: MutableRefObject<string | undefined>;
  homeRef: MutableRefObject<CameraViewOptions | null>;
  sceneStyle?: SceneStyleConfig;
  config: CesiumConfig;
}) => {
  // Update isSuspendedRef when suspend/activate events are emitted
  useEffect(() => {
    const unsubActivate = subscribe(CtxEvent.Activate, (triggerData) => {
      console.debug("[CesiumContext] Activate event received", {
        triggerData,
        currentStyle: currentSceneStyleRef.current,
      });
      isSuspendedRef.current = false;

      // Wait for scene to be ready before reapplying style
      const currentStyle = currentSceneStyleRef.current;
      if (currentStyle) {
        const unsubSceneReady = subscribe(CtxEvent.SceneReady, () => {
          console.debug(
            "[CesiumContext] Reapplying style after scene ready:",
            currentStyle
          );
          emit(CtxEvent.SetSceneStyle, currentStyle);
          unsubSceneReady(); // Only apply once
        });
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

  // Handle GoHome event - fly camera to home position
  useEffect(() => {
    const unsubGoHome = subscribe(CtxEvent.GoHome, () => {
      const scene = sceneRef.current;
      const home = homeRef.current;

      if (!scene || !home) {
        console.warn(
          "[CesiumContext] Cannot fly home - missing scene or home config"
        );
        return;
      }

      console.debug("[CesiumContext] Flying to home position", home);

      // Clear any ongoing animation
      emit(CtxEvent.AnimationEnd, undefined);

      const { target, orientation } = home;

      (async () => {
        const { tryWithValidCamera, BoundingSphere, Cartesian3 } = await import(
          "@carma/cesium"
        );
        const targetCartesian3 = new Cartesian3(target.x, target.y, target.z);
        tryWithValidCamera(scene.camera, (camera) => {
          if (orientation) {
            // Fly to position with HeadingPitchRange
            camera.flyTo({
              destination: targetCartesian3,
              orientation: {
                heading: orientation.heading,
                pitch: orientation.pitch,
                range: orientation.range,
              },
              duration: 2.0,
            });
          } else {
            // Fallback: fly to bounding sphere around target
            const boundingSphere = new BoundingSphere(targetCartesian3, 400);
            camera.flyToBoundingSphere(boundingSphere, { duration: 2.0 });
          }
        });
      })();
    });

    return () => {
      unsubGoHome();
    };
  }, [subscribe, emit, sceneRef, homeRef]);

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
    let currentStyle: string | null = null;

    const applySceneStyle = (newStyle: string) => {
      // Deduplicate - ignore if already applying this style
      if (currentStyle === newStyle) {
        console.log(
          `[CesiumContext] Style "${newStyle}" already active, skipping`
        );
        return;
      }

      const scene = sceneRef.current;
      if (!isValidScene(scene) || !scene) {
        console.warn(
          "[CesiumContext] Cannot apply scene style - invalid scene"
        );
        return;
      }

      const timestamp = new Date().toISOString().split("T")[1];
      console.log(
        `[${timestamp}] [CesiumContext] Applying scene style: ${newStyle}`
      );
      currentStyle = newStyle;

      if (!sceneStyle) {
        console.warn("[CesiumContext] No sceneStyle configured");
        return;
      }

      const style = sceneStyle.styles?.find((s) => s.id === newStyle);
      if (!style) {
        console.warn(
          `[CesiumContext] Style id "${newStyle}" not found in sceneStyle.styles`
        );
        return;
      }

      console.debug(`[CesiumContext] Applying style "${newStyle}":`, style);

      // Apply backgroundColor from style
      if (style.backgroundColor && Array.isArray(style.backgroundColor)) {
        (async () => {
          const { Color } = await import("@carma/cesium");
          const [r, g, b, a] = style.backgroundColor!;
          const bgColor = Color.fromBytes(r, g, b, a);
          scene.backgroundColor = bgColor;
          const container = scene.canvas.parentElement;
          if (container) {
            const cssColor = bgColor.toCssColorString();
            container.style.backgroundColor = cssColor;
          }
          console.log(
            `[CesiumContext] Set backgroundColor:`,
            style.backgroundColor
          );
        })();
      }

      // Apply globe settings from style
      if (style.globe?.baseColor) {
        (async () => {
          const { Color } = await import("@carma/cesium");
          const [r, g, b, a] = style.globe!.baseColor;
          scene.globe.baseColor = new Color(r, g, b, a);
          scene.globe.show = true;

          // Enable translucency if alpha < 1
          if (a < 1.0) {
            scene.globe.translucency.enabled = true;
            console.log(
              `[CesiumContext] Enabled globe translucency (alpha=${a})`
            );
          } else {
            scene.globe.translucency.enabled = false;
          }

          console.log(
            `[CesiumContext] Set globe.baseColor (rgba):`,
            style.globe?.baseColor
          );
        })();
      }

      // Ensure globe is visible if imagery or terrain is present
      if (style.imageryLayers && style.imageryLayers.length > 0) {
        scene.globe.show = true;
        console.log(`[CesiumContext] Globe show=true (has imagery)`);
      }

      // Apply shadow settings from style
      const shadowsEnabled = style.shadows ?? false;
      scene.globe.enableLighting = shadowsEnabled;
      scene.shadowMap.enabled = shadowsEnabled;
      if (!shadowsEnabled && scene.globe.terrainProvider) {
        (scene.globe.terrainProvider as any).castShadows = false;
        (scene.globe.terrainProvider as any).receiveShadows = false;
      }
      console.log(`[CesiumContext] Shadows enabled:`, shadowsEnabled);

      // TODO: tilesets, imageryProviders, terrainProviders removed from CesiumConfig
      // These are now managed differently - need to update this code
      /*
      const allTilesetIds = new Set<string>();
      if (config.tilesets) {
        config.tilesets.forEach((t) => {
          const tilesetId = t.id || t.config.id;
          if (tilesetId) allTilesetIds.add(tilesetId);
        });
      }
      */

      // Collect ALL tileset IDs from sceneStyle config
      const allTilesetIds = new Set<string>();
      sceneStyle.styles?.forEach((s) => {
        s.tilesets?.forEach((t) => {
          if (t.id) allTilesetIds.add(t.id);
        });
      });

      // Diff and apply tileset changes
      console.log(
        `[CesiumContext] Loaded tilesets:`,
        Array.from(tilesetsRef.current.keys())
      );
      console.log(
        `[CesiumContext] All available tileset IDs:`,
        Array.from(allTilesetIds)
      );
      console.log(
        `[CesiumContext] Desired tilesets:`,
        style.tilesets?.map((t) => t.id) || []
      );

      const tilesetChanges = diffTilesets(
        tilesetsRef.current,
        style,
        allTilesetIds
      );

      console.log(
        `[CesiumContext] Style "${newStyle}": Tileset changes (${tilesetChanges.length}):`,
        tilesetChanges
      );

      tilesetChanges.forEach(({ id, action, opacity }) => {
        console.log(
          `  → ${id}: ${action.toUpperCase()}${
            opacity !== undefined ? ` opacity=${opacity}` : ""
          }`
        );
        emit(CtxEvent.SetTilesetVisibility, { id, visible: action === "show" });

        if (opacity !== undefined) {
          emit(CtxEvent.SetTilesetOpacity, { id, opacity });
        }
      });

      // Collect ALL imagery IDs from sceneStyle config
      const allImageryIds = new Set<string>();
      sceneStyle.styles?.forEach((s) => {
        s.imageryLayers?.forEach((il) => {
          if (il.id) allImageryIds.add(il.id);
        });
      });

      // Diff and apply imagery changes
      const imageryChanges = diffImageryLayers(
        imageryLayersRef.current,
        style,
        allImageryIds
      );

      if (imageryChanges.length > 0) {
        console.groupCollapsed(
          `[CesiumContext] Style "${newStyle}": Updating imagery (${imageryChanges.length} changes)`
        );
        imageryChanges.forEach(({ id, action, opacity }) => {
          console.log(
            `  ${id}: ${action.toUpperCase()}${
              opacity !== undefined ? ` opacity=${opacity}` : ""
            }`
          );
          emit(CtxEvent.SetImageryVisibility, {
            id,
            visible: action === "show",
          });

          if (opacity !== undefined) {
            emit(CtxEvent.SetImageryOpacity, { id, opacity });
          }
        });
        console.groupEnd();
      } else {
        console.log(
          `[CesiumContext] Style "${newStyle}": No imagery changes needed`
        );
      }

      // TODO: Terrain switching not yet implemented
      // if (style.terrain) {
      //   emit(CtxEvent.SetTerrainProvider, { id: style.terrain });
      // }

      // Request render to ensure visual updates
      scene.requestRender();

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
      if (!sceneStyle || !sceneStyle.styles || sceneStyle.styles.length < 2) {
        console.warn(
          "[CesiumContext] Cannot toggle - need at least 2 styles in config"
        );
        return;
      }

      const currentStyle = currentSceneStyleRef.current;
      const currentIndex = sceneStyle.styles.findIndex(
        (s) => s.id === currentStyle
      );
      const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % sceneStyle.styles.length;
      const newStyle = sceneStyle.styles[nextIndex].id;

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
  }, [subscribe, emit, currentSceneStyleRef, sceneRef, sceneStyle, config]);

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
