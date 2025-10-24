import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { SceneStyleConfig } from "@carma/cesium/types";
import {
  CtxEvent,
  type SubscribeCesiumCtxFn,
} from "../cesium-context-event-map";

/**
 * Custom hook that manages all event subscriptions for CesiumContext refs.
 * Consolidates subscription logic to keep CesiumContextProvider clean.
 *
 * Architecture:
 * - External consumers emit events via the bus (SetSceneStyle, ToggleSceneStyle, GoHome, etc)
 * - Context receives events and handles them appropriately:
 *
 * **Style Changes** (Scene Coordination): Uses callback pattern
 *   - Context calls registered callback: sceneStyleApplierRef.current(styleId)
 *   - Scene hook registers callback on mount
 *   - This is for scene lifecycle coordination
 *
 * **Commands** (Direct Execution): Context manipulates scene directly
 *   - GoHome: Context directly flies camera using sceneRef
 *   - Suspend/Activate: Context updates isSuspendedRef
 *   - These are one-time commands, not lifecycle coordination
 */
export const useContextSetupSubscriptions = ({
  subscribe,
  emit,
  sceneRef,
  isSuspendedRef,
  isAnimatingRef,
  currentSceneStyleRef,
  sceneStyleApplierRef,
  homeCamera,
  sceneStyle,
}: {
  subscribe: SubscribeCesiumCtxFn;
  emit: any; // EmitCesiumCtxFn
  sceneRef: MutableRefObject<any>; // Scene | null | false
  isSuspendedRef: MutableRefObject<boolean>;
  isAnimatingRef: MutableRefObject<boolean>;
  currentSceneStyleRef: MutableRefObject<string | undefined>;
  sceneStyleApplierRef: MutableRefObject<((styleId: string) => void) | null>;
  homeCamera: MutableRefObject<any>; // CameraPoseRadians | null
  sceneStyle?: SceneStyleConfig;
}) => {
  // Update isSuspendedRef when suspend/activate events are emitted
  // Note: Portal sets currentSceneStyleRef BEFORE emitting Activate
  // Scene component reads ref on mount - no need for context to coordinate
  useEffect(() => {
    const unsubActivate = subscribe(CtxEvent.Activate, (triggerData) => {
      console.debug("[CesiumContext] Activate event received", {
        triggerData,
        currentStyle: currentSceneStyleRef.current,
      });
      isSuspendedRef.current = false;
      // Note: Portal has already set currentSceneStyleRef before activation
      // Scene hooks will read ref on mount - no coordination needed here
    });
    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      isSuspendedRef.current = true;
    });
    return () => {
      unsubActivate();
      unsubSuspend();
    };
  }, [subscribe, isSuspendedRef, currentSceneStyleRef]);

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

  // Handle GoHome event - context logic that directly manipulates scene
  // This is NOT scene coordination - it's a command that context executes
  useEffect(() => {
    const unsubGoHome = subscribe(CtxEvent.GoHome, () => {
      const scene = sceneRef.current;
      const home = homeCamera.current;

      if (!scene || !home) {
        console.warn(
          "[CesiumContext] Cannot fly home - missing scene or home config"
        );
        return;
      }

      console.debug("[CesiumContext] Flying to home position", home);

      // Clear any ongoing animation
      emit(CtxEvent.AnimationEnd, undefined);

      (async () => {
        const { Cartesian3, flyToTarget } = await import("@carma/cesium");

        // Convert geographic position (radians) to Cartesian3 target point
        const homeTyped = home as any;

        // Target point on the ground (use ground altitude, not camera altitude)
        const targetPoint = Cartesian3.fromRadians(
          homeTyped.longitude,
          homeTyped.latitude,
          0 // Ground level - we want to look AT this point
        );

        // Calculate range from camera height
        const range = homeTyped.height ?? 800; // Default 800m range

        // Use flyToTarget helper with HeadingPitchRange
        const camera = scene.camera;
        flyToTarget(
          camera,
          targetPoint,
          {
            heading: homeTyped.heading ?? 0,
            pitch: homeTyped.pitch ?? -0.785, // ~-45° in radians
            range: range,
          },
          2.0 // 2 second animation duration
        );

        console.debug("[CesiumContext] Flying to home position complete");
      })();
    });

    return () => {
      unsubGoHome();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);
  // Note: emit, sceneRef, homeCamera are stable refs - accessing .current doesn't require deps

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

  // Subscribe to style change events from EXTERNAL consumers
  // Context coordinates via callback ref (internal scene coordination)
  // Scene component registers its applier function in sceneStyleApplierRef
  useEffect(() => {
    const unsubSetStyle = subscribe(
      CtxEvent.SetSceneStyle,
      (styleId: string) => {
        console.debug("[CesiumContext] SetSceneStyle event received:", styleId);
        currentSceneStyleRef.current = styleId;

        // Call scene's registered callback (NOT direct scene manipulation)
        const applier = sceneStyleApplierRef.current;
        if (applier) {
          applier(styleId);
        } else {
          console.warn("[CesiumContext] No scene style applier registered yet");
        }
      }
    );

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

      console.debug(
        `[CesiumContext] Toggle: ${currentStyle} -> ${newStyle} (slot ${currentIndex} -> ${nextIndex})`
      );

      // Update ref and call scene's registered callback
      currentSceneStyleRef.current = newStyle;
      const applier = sceneStyleApplierRef.current;
      if (applier) {
        applier(newStyle);
      } else {
        console.warn("[CesiumContext] No scene style applier registered yet");
      }
    });

    return () => {
      unsubSetStyle();
      unsubToggleStyle();
    };
  }, [subscribe, currentSceneStyleRef, sceneStyleApplierRef, sceneStyle]);

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
