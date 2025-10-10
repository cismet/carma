import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { Scene } from "cesium";
import {
  CtxEvent,
  SubscribeCesiumCtxFn,
  EmitCesiumCtxFn,
} from "../../../cesiumContextEventMap";
import { SCENE_STYLES, TILESET_IDS } from "../../../constants";
import {
  setupPrimaryStyle,
  setupSecondaryStyle,
} from "../../../utils/sceneStyles";
import { isValidScene } from "../../../utils/instanceGates";
import type {
  WithCallback,
  TerrainProviderCallback,
} from "../../../hooks/useValidInstances";
import type { SceneStyles } from "../../../../index";

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
  tilesetVisibilityRef,
  tilesetOpacityRef,
  homePositionRef,
  homeOffsetRef,
  withTerrainProvider,
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
  tilesetVisibilityRef: MutableRefObject<Map<string, boolean>>;
  tilesetOpacityRef: MutableRefObject<Map<string, number>>;
  homePositionRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
  homeOffsetRef: MutableRefObject<{ x: number; y: number; z: number } | null>;
  withTerrainProvider: WithCallback<TerrainProviderCallback>;
  sceneStyles?: SceneStyles;
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

  // Subscribe to camera controller setting events
  useEffect(() => {
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
  ]);

  // Subscribe to scene style events and apply scene changes
  useEffect(() => {
    const applySceneStyle = (newStyle: string) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) {
        console.warn(
          "[CesiumContext] Cannot apply scene style - invalid scene"
        );
        return;
      }

      console.debug("[CesiumContext] Applying scene style:", newStyle);

      if (newStyle === SCENE_STYLES.PRIMARY) {
        console.debug(
          "[CesiumContext] Switching to PRIMARY style (Luftbild/Mesh mode)"
        );
        setupPrimaryStyle(scene, withTerrainProvider, sceneStyles?.primary);
        console.debug(
          "[CesiumContext] Hiding LOD2 (primary tileset), showing mesh (secondary tileset)"
        );
        emit(CtxEvent.SetTilesetVisibility, {
          id: TILESET_IDS.PRIMARY,
          visible: false,
        });
        emit(CtxEvent.SetTilesetVisibility, {
          id: TILESET_IDS.SECONDARY,
          visible: true,
        });
        // TODO: Get style config from context and set background
        // if (primaryStyle?.backgroundColor) {
        //   setCesiumBackgroundCssVar(primaryStyle.backgroundColor);
        // }
      } else if (newStyle === SCENE_STYLES.SECONDARY) {
        console.debug(
          "[CesiumContext] Switching to SECONDARY style (LOD2 mode)"
        );
        setupSecondaryStyle(scene, withTerrainProvider, sceneStyles?.secondary);
        console.debug(
          "[CesiumContext] Showing LOD2 (primary tileset), hiding mesh (secondary tileset)"
        );
        emit(CtxEvent.SetTilesetVisibility, {
          id: TILESET_IDS.PRIMARY,
          visible: true,
        });
        emit(CtxEvent.SetTilesetVisibility, {
          id: TILESET_IDS.SECONDARY,
          visible: false,
        });
        // TODO: Get style config from context and set background
        // if (secondaryStyle?.backgroundColor) {
        //   setCesiumBackgroundCssVar(secondaryStyle.backgroundColor);
        // }
      } else {
        console.warn("[CesiumContext] Unknown scene style:", newStyle);
      }
    };

    const unsubSetStyle = subscribe(CtxEvent.SetSceneStyle, (value) => {
      currentSceneStyleRef.current = value;
      console.debug("[CesiumContext] Set scene style:", value);
      applySceneStyle(value);
    });

    const unsubToggleStyle = subscribe(CtxEvent.ToggleSceneStyle, () => {
      const currentStyle = currentSceneStyleRef.current;
      const newStyle =
        currentStyle === SCENE_STYLES.PRIMARY
          ? SCENE_STYLES.SECONDARY
          : SCENE_STYLES.PRIMARY;
      currentSceneStyleRef.current = newStyle;
      console.debug("[CesiumContext] Toggle scene style:", newStyle);
      applySceneStyle(newStyle);
    });

    return () => {
      unsubSetStyle();
      unsubToggleStyle();
    };
  }, [subscribe, emit, currentSceneStyleRef, sceneRef, withTerrainProvider]);

  // Subscribe to tileset visibility events
  useEffect(() => {
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
  }, [subscribe, tilesetOpacityRef]);

  // Subscribe to home position events
  useEffect(() => {
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
  }, [subscribe, homePositionRef, homeOffsetRef]);
};
