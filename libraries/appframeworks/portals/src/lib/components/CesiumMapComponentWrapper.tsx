import {
  ReactNode,
  useEffect,
  useRef,
  useState,
  Suspense,
  lazy,
  memo,
} from "react";

import { useCesiumContext, CtxEvent } from "@carma/cesium/core";
import {
  useTransitionContext,
  TransitionCtxEvent,
} from "@carma-mapping/map-transition-2d-3d";
import { usePortal } from "../contexts/PortalProvider";
import { useMapHashRoutingCesium } from "../hooks/useMapHashRoutingCesium";

// useSelectionCesium REMOVED - use declarative <CesiumSelectionMarker /> from @carma-cesium/selections
// useCesiumModels REMOVED - use declarative <CesiumModel /> from @carma-cesium/models
import { useSyncCesiumSceneStyle } from "../hooks/useSyncCesiumSceneStyle";

// Lazy load the heavy Cesium scene component
// This ensures Cesium is only loaded when the scene is actually supposed to render
const CesiumSceneComponent = lazy(() =>
  import("@carma/cesium/core").then((module) => ({
    default: module.CesiumSceneComponent,
  }))
);

/**
 * CesiumMapComponentWrapper - Portal-level wrapper for Cesium 3D scene
 *
 * LAZY PARADIGM:
 * - Scene only mounts on FIRST Activate event (2D→3D toggle)
 * - Heavy Cesium packages are lazy-loaded via dynamic imports
 * - Once mounted, scene stays mounted but suspended (hidden) in 2D mode
 * - Prevents resource initialization overhead on cold 2D start
 *
 * GATE MECHANISM:
 * - Portal must set context refs BEFORE scene mounts:
 *   1. currentSceneStyleRef.current = initialMapStyle (e.g., "lod2")
 *   2. initialCamera.current = cameraState
 * - Scene hooks read these refs on mount to initialize
 *
 * INTERPLAY WITH CONTEXT:
 * - CesiumContextProvider: Owns refs, event bus, static config
 * - Portal Wrapper: Sets ref values, manages visibility/transitions
 * - Scene Component: Reads refs on mount, registers callbacks
 * - No props passed to scene (refs/callbacks only)
 *
 * HARDENED AGAINST RE-RENDERS:
 * - Wrapped with React.memo to prevent parent re-renders from cascading
 * - Only children prop can trigger re-render (children typically stable)
 * - All internal state managed via refs to minimize render triggers
 */
const CesiumMapComponentWrapperInner = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  const containerStyleRef = useRef<HTMLDivElement | null>(null);
  const { subscribe, isSuspendedRef, prepareSceneInit, currentSceneStyleRef } =
    useCesiumContext();
  const { currentMapStyle, mapStyleToCesiumStyleMapping } = usePortal();

  // Use refs to avoid re-rendering when style changes
  const currentMapStyleRef = useRef(currentMapStyle);
  currentMapStyleRef.current = currentMapStyle;
  const mapStyleToCesiumStyleMappingRef = useRef(mapStyleToCesiumStyleMapping);
  mapStyleToCesiumStyleMappingRef.current = mapStyleToCesiumStyleMapping;
  const { config: transitionConfig } = useTransitionContext();

  // Track if scene is currently visible (for render triggers only)
  // Actual suspension state is in context.isSuspendedRef

  // Get CSS fade durations from config
  const cssFadeInDurationMs =
    transitionConfig.modeTo3d?.step5_cssFadeIn?.durationMs ?? 1000;
  const cssFadeOutDurationMs =
    transitionConfig.modeTo2d?.step3_cssFadeOut?.durationMs ?? 1000;

  // Track if scene has ever been activated (mounted)
  // Use ref to avoid closure issues in subscription callbacks
  const hasBeenActivatedRef = useRef(false);

  // Use state to trigger re-render when activation happens
  const [shouldMountScene, setShouldMountScene] = useState(false);

  console.log("[CesiumWrapper] RENDER", {
    shouldMountScene,
    hasBeenActivated: hasBeenActivatedRef.current,
    hasContainer: !!cesiumContainerRef.current,
    currentMapStyle: currentMapStyleRef.current,
    isSuspended: isSuspendedRef.current,
  });

  // === PORTAL-LEVEL HOOKS ===

  // Sync Cesium scene style with MapStyleProvider (LOD2/Mesh switching)
  // Emits SetSceneStyle events → Context calls registered callback → Scene applies style
  useSyncCesiumSceneStyle();

  // === GATE MECHANISM: Set refs before scene mounts ===
  // On FIRST Activate event:
  // 1. Set currentSceneStyleRef.current (scene reads on mount)
  // 2. Set initialCamera.current (scene reads on mount)
  // 3. Mount scene (setShouldMountScene)
  // On subsequent Activate events: just update visibility
  useEffect(() => {
    const updateVisibility = (isSuspended: boolean) => {
      isSuspendedRef.current = isSuspended;
      if (containerStyleRef.current) {
        // Update transition duration based on direction
        const transitionDuration = isSuspended
          ? cssFadeOutDurationMs
          : cssFadeInDurationMs;
        containerStyleRef.current.style.transition = `opacity ${transitionDuration}ms ease-in-out`;
        containerStyleRef.current.style.opacity = isSuspended ? "0" : "1";
        containerStyleRef.current.style.pointerEvents = isSuspended
          ? "none"
          : "auto";
      }
    };

    // Set initial state (suspended in 2D mode)
    updateVisibility(true);

    const unsubActivate = subscribe(CtxEvent.Activate, () => {
      // Only prepare and mount on FIRST activation
      // Subsequent activations just make scene visible again
      if (!hasBeenActivatedRef.current) {
        console.log("[CesiumWrapper] First activation - preparing scene init");

        // Convert portal map style (e.g., "karte") to Cesium scene style (e.g., "lod2")
        const cesiumSceneStyle =
          mapStyleToCesiumStyleMappingRef.current[currentMapStyleRef.current];
        console.log("[CesiumWrapper] Mapping portal style to Cesium", {
          portalStyle: currentMapStyleRef.current,
          cesiumStyle: cesiumSceneStyle,
        });

        // GATE: Set initial style in context ref BEFORE scene activation
        // Scene will read this ref on mount and apply the initial style
        try {
          const isReady = prepareSceneInit(cesiumSceneStyle);

          if (isReady) {
            // Mark as activated and mount scene
            hasBeenActivatedRef.current = true;
            console.log("[CesiumWrapper] ⚠️ MOUNTING SCENE for first time");
            setShouldMountScene(true); // Trigger re-render to mount scene
          } else {
            console.error(
              "[CesiumWrapper] Scene init validation returned false - not mounting"
            );
          }
        } catch (error) {
          console.error(
            "[CesiumWrapper] ❌ Scene init validation failed:",
            error
          );
          console.error("[CesiumWrapper] Error details:", {
            message: (error as Error).message,
            cesiumStyle: cesiumSceneStyle,
            portalStyle: currentMapStyleRef.current,
          });
          // Don't mount scene if validation fails
        }
      } else {
        console.log(
          "[CesiumWrapper] Subsequent activation - scene already mounted, just making visible"
        );
      }

      // Always update active state on every activate
      console.log("[CesiumWrapper] Updating active state (isSuspended→false)");
      isSuspendedRef.current = false; // Mark as active internally
      // Don't change opacity here - wait for SceneVisible after positioning
    });

    const unsubSceneVisible = subscribe(CtxEvent.SceneVisible, () => {
      console.debug("[CesiumWrapper] Scene visible - fade-in starts");
      updateVisibility(false); // Fade-in to visible
    });

    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      console.log("[CesiumWrapper] Cesium suspend (isSuspended→true)");
      isSuspendedRef.current = true; // Mark as suspended
      updateVisibility(true); // Fade-out immediately
    });

    return () => {
      unsubActivate();
      unsubSceneVisible();
      unsubSuspend();
    };
  }, [
    subscribe,
    cssFadeInDurationMs,
    cssFadeOutDurationMs,
    prepareSceneInit,
    isSuspendedRef,
  ]);

  // === HASH ROUTING (Portal Level) ===
  // Syncs Cesium camera to URL hash (subscribes to CameraSettled events)
  // This is the RIGHT place for hash management (portal owns state coordination)
  // Scene component is pure rendering - no state management
  useMapHashRoutingCesium();

  return (
    <div
      ref={containerStyleRef}
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
        opacity: 0, // Initial state: hidden (updated by useEffect)
        transition: `opacity ${cssFadeOutDurationMs}ms ease-in-out`, // Initial: fade-out duration (updated by useEffect)
        pointerEvents: "none", // Initial state: no interaction (updated by useEffect)
      }}
    >
      {/* Cesium container - must have explicit dimensions for canvas sizing */}
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* LAZY MOUNT: Only mount scene after first Activate event (2D→3D)
            GATE: Portal has set currentSceneStyleRef + initialCamera BEFORE this renders
            Scene hooks read those refs on mount to initialize
            Suspension handled by wrapper CSS (opacity/pointer-events)
            key="cesium-scene" prevents remounting on prop changes */}
        {shouldMountScene && (
          <Suspense
            fallback={
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#1e1e1e",
                  color: "white",
                  fontSize: "14px",
                }}
              >
                Loading 3D scene...
              </div>
            }
          >
            <CesiumSceneComponent
              key="cesium-scene"
              containerRef={cesiumContainerRef}
            >
              {children}
            </CesiumSceneComponent>
          </Suspense>
        )}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders during transitions
// Custom comparison: only re-render if children change (which is rare)
export const CesiumMapComponentWrapper = memo(
  CesiumMapComponentWrapperInner,
  (prevProps, nextProps) => {
    // Return true if props are equal (prevent re-render)
    // Return false if props changed (allow re-render)
    const childrenEqual = prevProps.children === nextProps.children;

    if (!childrenEqual) {
      console.log("[CesiumWrapper] Props changed - re-rendering", {
        childrenChanged: !childrenEqual,
      });
    }

    return childrenEqual;
  }
);

export default CesiumMapComponentWrapper;
