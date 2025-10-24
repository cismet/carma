import { useEffect } from "react";
import {
  useTransitionContext,
  TransitionCtxEvent,
  MapTransitionState,
} from "@carma-mapping/map-transition-2d-3d";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { ManagedEngineKeys, type ManagedEngineKey } from "../constants";

/**
 * TransitionEngineSync - Central coordinator for 2D↔3D engine switching
 *
 * This component centralizes ALL engine control for transitions.
 * No other component should emit Activate/Suspend events.
 *
 * Architecture:
 * - Listens to: TransitionTo3dStart/TransitionTo2dStart (from TransitionContext)
 * - Emits to: Cesium (Activate/Suspend) and TopicMap (Activate/Suspend)
 * - Updates: Parent's engine state via callbacks
 *
 * Why it lives in PortalProvider:
 * - Needs access to ALL engine contexts (Cesium + TopicMap)
 * - Owns the currentEngine state that needs updating
 * - Sits at the coordination layer between transition logic and engine contexts
 *
 * @param setCurrentEngine - Callback to update portal engine state
 */
export const TransitionEngineSync = ({
  setCurrentEngine,
}: {
  setCurrentEngine: (engine: ManagedEngineKey) => void;
}) => {
  const { subscribe, transitionStateRef } = useTransitionContext();
  const { emit: emitCesium } = useCesiumContext();
  const { emit: emitTopicMap } = useCarmaTopicMapContext();

  useEffect(() => {
    // Import event types dynamically to avoid circular deps
    const setupListeners = async () => {
      const { CtxEvent } = await import("@carma-mapping/engines/cesium/core");
      const { TopicMapCtxEvent } = await import(
        "@carma-mapping/engines/carma-cismap"
      );

      // === TO 3D TRANSITION ===
      const unsubscribeTo3dStart = subscribe(
        TransitionCtxEvent.TransitionTo3dStart,
        () => {
          console.debug(
            "[TransitionEngineSync] Transition to 3D started: Activating Cesium, suspending TopicMap"
          );

          // Update portal engine state
          setCurrentEngine(ManagedEngineKeys.CESIUM_3D);

          // Activate Cesium engine (this starts the transition, fade-in happens after positioning)
          emitCesium(CtxEvent.Activate, {
            source: "portal-transition",
            component: "TransitionEngineSync",
            reason: "2D→3D transition started",
          });

          // Suspend TopicMap engine immediately
          emitTopicMap(TopicMapCtxEvent.Suspend, undefined);
        }
      );

      // === TO 2D TRANSITION ===
      // TIMING CHANGE: Don't suspend Cesium on TransitionTo2dStart!
      // Instead, monitor state changes and suspend when CSS fade step begins
      const unsubscribeTo2dStart = subscribe(
        TransitionCtxEvent.TransitionTo2dStart,
        () => {
          console.debug(
            "[TransitionEngineSync] Transition to 2D started: Activating TopicMap"
          );

          // Update portal engine state
          setCurrentEngine(ManagedEngineKeys.LEAFLET_2D);

          // Activate TopicMap engine immediately
          emitTopicMap(TopicMapCtxEvent.Activate, undefined);

          // DON'T suspend Cesium here - let it stay visible during camera animation
          // Suspend will be triggered by state watcher when CSS fade begins
        }
      );

      // Watch for transition state changes to suspend Cesium at the right time
      const checkStateInterval = setInterval(() => {
        const currentState = transitionStateRef.current;

        // When CSS fade-out step begins, suspend Cesium to trigger fade
        if (currentState === MapTransitionState.to2d_step3_cssFadeOut) {
          console.debug(
            "[TransitionEngineSync] CSS fade-out starting: Suspending Cesium now"
          );
          emitCesium(CtxEvent.Suspend, undefined);

          // Clear interval - we only need to suspend once per transition
          clearInterval(checkStateInterval);
        }
      }, 16); // Check every frame (~60fps)

      return () => {
        unsubscribeTo3dStart();
        unsubscribeTo2dStart();
        clearInterval(checkStateInterval);
      };
    };

    let cleanup: (() => void) | undefined;
    setupListeners().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      cleanup?.();
    };
  }, [
    subscribe,
    transitionStateRef,
    emitCesium,
    emitTopicMap,
    setCurrentEngine,
  ]);

  return null; // This component only manages subscriptions
};
