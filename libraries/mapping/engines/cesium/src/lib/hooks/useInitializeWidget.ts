import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import {
  BoundingSphere,
  Camera,
  Cartesian3,
  Cartographic,
  CesiumWidget,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  PerspectiveFrustum,
  Rectangle,
  Scene,
  ScreenSpaceCameraController,
} from "cesium";

import { useCesiumContext } from "./useCesiumContext";
import type { CesiumWidget } from "../CesiumContext";
// Adapter-free: we write the CesiumWidget directly into widgetRef; our context accepts it.
import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectShowSecondaryTileset,
  selectCesiumHome,
  selectCesiumHomeOffset,
  selectCesiumIsInBackground,
} from "../slices/cesium";
import { validateWorldCoordinate } from "../utils/positions";
import { Scene } from "cesium";

/**
 * Initialize a CesiumWidget and adapt it to our Viewer-like context.
 * This keeps the rest of the app working while bypassing Cesium Viewer widgets/entities plumbing.
 */
// Type for storing position and orientation
interface CameraState {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  postionCartographic?: Cartographic;
}

const postRenderHandlerMap: WeakMap<Scene, () => void> = new WeakMap();
const preUpdateHandlerMap: WeakMap<Scene, () => void> = new WeakMap();
const initialViewSetMap: WeakMap<CesiumWidget, boolean> = new WeakMap();

export const useInitialize = (
  containerRef: React.RefObject<HTMLDivElement>,
  initialCameraView?: {
    position?: Cartographic;
    heading?: number;
    pitch?: number;
    fov?: number;
  } | null
) => {
  const {
    widgetRef,
    isReady,
    setisReady,
    shouldSuspendCameraLimitersRef,
    withScene,
    withCamera,
    withWidget,
    setInitialCameraSettled,
  } = useCesiumContext();

  const home = useSelector(selectCesiumHome);
  const homeOffset = useSelector(selectCesiumHomeOffset);

  // align Cesium default fallback with local home
  if (home) {
    const { longitude, latitude } = Cartographic.fromCartesian(home);
    const rect = new Rectangle(longitude, latitude, longitude, latitude);
    Camera.DEFAULT_VIEW_RECTANGLE = rect;
  }
  Camera.DEFAULT_OFFSET = new HeadingPitchRange(
    CesiumMath.toRadians(0),
    CesiumMath.toRadians(-45),
    700
  );

  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);
  const minZoom = useSelector(
    selectScreenSpaceCameraControllerMinimumZoomDistance
  );
  const maxZoom = useSelector(
    selectScreenSpaceCameraControllerMaximumZoomDistance
  );
  const enableCollisionDetection = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );
  const isMode2d = useSelector(selectCesiumIsInBackground);

  const previousIsMode2d = useRef<boolean | null>(null);
  const previousIsSecondaryStyle = useRef<boolean | null>(null);
  const lastGoodCameraState = useRef<CameraState | null>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (widgetRef.current) return; // already initialized

    const widget = new CesiumWidget(containerRef.current, {
      scene3DOnly: true,
      baseLayer: false,
      skyBox: false,
      skyAtmosphere: false,
      useBrowserRecommendedResolution: true,
    });
    widgetRef.current = widget;

    // Configure error handling similar to viewer path
    try {
      // disable built-in loop errors panel
      (
        widget as unknown as { showRenderLoopErrors?: boolean }
      ).showRenderLoopErrors = false;
      if (typeof widget.scene.rethrowRenderErrors === "boolean") {
        widget.scene.rethrowRenderErrors = false;
      }
      widget.scene.renderError.addEventListener((err: unknown) => {
        // match viewer path: suppress ErrorBoundary by default and log
        window.CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY = true;
        const meta = { requestRenderMode: widget.scene.requestRenderMode };
        console.warn("[Cesium] renderError intercepted (widget)", err, meta);
        try {
          window.dispatchEvent(
            new CustomEvent("carma:cesium:renderError", {
              detail: { error: err, meta },
            })
          );
        } catch {}
      });
    } catch {}

    // Use CesiumWidget natively; CesiumWidget exposes entities/dataSources/dataSourceDisplay
    widgetRef.current = widget;

    // Initial state
    setInitialCameraSettled(null);
    console.info("[CESIUM|INIT|SETTLE] state:null (widget created)");

    // Mark ready after first non-zero canvas size
    const handlePostRender = () => {
      withScene((scene, viewer) => {
        if (viewer.canvas.width > 0 && viewer.canvas.height > 0) {
          setisReady(true);
          scene.postRender.removeEventListener(handlePostRender);
          postRenderHandlerMap.delete(scene);
        }
      });
    };

    // Validate camera position during preUpdate (same strategy as viewer path)
    const handleValidCameraPosition = () => {
      if (shouldSuspendCameraLimitersRef?.current) return;
      if (!home) return;
      withCamera((camera) => {
        const isValidWorldCoordinate = validateWorldCoordinate(
          camera,
          home,
          maxZoom
        );
        if (isValidWorldCoordinate) {
          lastGoodCameraState.current = {
            position: camera.positionWC.clone(),
            direction: camera.directionWC.clone(),
            up: camera.upWC.clone(),
            postionCartographic: camera.positionCartographic.clone(),
          };
        } else if (lastGoodCameraState.current) {
          console.warn(
            "HOOK: [2D3D|CESIUM|CAMERA] invalid camera position, restoring last good state",
            isValidWorldCoordinate,
            camera.position,
            camera.positionCartographic,
            lastGoodCameraState.current
          );
          camera.lookAtTransform(Matrix4.IDENTITY);
          camera.setView({
            destination: lastGoodCameraState.current.position,
            orientation: {
              direction: lastGoodCameraState.current.direction,
              up: lastGoodCameraState.current.up,
            },
          });
        }
      });
    };

    withScene((scene) => {
      scene.preUpdate.addEventListener(handleValidCameraPosition);
      preUpdateHandlerMap.set(scene, handleValidCameraPosition);

      scene.postRender.addEventListener(handlePostRender);
      postRenderHandlerMap.set(scene, handlePostRender);
    });

    return () => {
      // Only cleanup listeners; keep widget for reuse akin to viewer path
      try {
        // no-op
      } catch {}
    };
  }, [
    containerRef,
    widgetRef,
    setisReady,
    withScene,
    withCamera,
    withWidget,
    setInitialCameraSettled,
    shouldSuspendCameraLimitersRef,
    home,
    maxZoom,
  ]);

  // Scene settings and SSCC configuration
  useEffect(() => {
    withScene((scene) => {
      const sscc: ScreenSpaceCameraController =
        scene.screenSpaceCameraController;
      scene.globe.depthTestAgainstTerrain = true;
      scene.globe.translucency.enabled = true;
      scene.globe.translucency.frontFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;
      scene.globe.translucency.backFaceAlpha = isSecondaryStyle ? 1.0 : 0.0;

      sscc.enableCollisionDetection = enableCollisionDetection;
      sscc.minimumZoomDistance = minZoom ?? 1;
      sscc.maximumZoomDistance = maxZoom ?? Infinity;
    });
  }, [withScene, isSecondaryStyle, maxZoom, minZoom, enableCollisionDetection]);

  // Apply initial camera view or home fallback
  useEffect(() => {
    if (!isReady) return;
    setInitialCameraSettled(false);
    if (!initialCameraView) {
      console.info(
        "[CESIUM|INIT|SETTLE] initialCameraView:absent -> applying home fallback"
      );
    } else {
      console.info(
        "[CESIUM|INIT|SETTLE] applying:false (begin applying initial view)"
      );
    }

    const hasHome = !!home && !!homeOffset;
    if (!hasHome) {
      console.warn(
        "HOOK: [2D3D|CESIUM|CAMERA] widget init has no home/homeOffset; applying without validation"
      );
    }

    let alreadySet = false;
    withWidget((w) => {
      alreadySet = initialViewSetMap.has(w);
    });
    if (alreadySet) {
      setInitialCameraSettled(true);
      console.info(
        "[CESIUM|INIT|SETTLE] reuse:true -> state:true (already applied)"
      );
      return;
    }

    let willFlyHome = false;
    const resetToHome = () => {
      if (!hasHome) return;
      withCamera((camera) => {
        camera.lookAt(home, homeOffset);
        willFlyHome = true;
        camera.flyToBoundingSphere(new BoundingSphere(home, 500), {
          duration: 2,
          complete: () => {
            setInitialCameraSettled(true);
            console.info("[CESIUM|INIT|SETTLE] flyHome:complete -> state:true");
          },
        });
      });
    };

    let usedInitial = false;
    if (!isMode2d && initialCameraView) {
      const { position, heading, pitch, fov } = initialCameraView;
      if (position) {
        const restoredHeight = CesiumMath.clamp(
          position?.height || 1000,
          0,
          50000
        );
        position.height = restoredHeight;
        const destination = Cartographic.toCartesian(position);
        const isValidDestination = hasHome
          ? validateWorldCoordinate(destination, home, maxZoom, 0)
          : true;
        withCamera((camera) => {
          if (camera.frustum instanceof PerspectiveFrustum) {
            camera.frustum.fov = fov ?? Math.PI / 4;
          }
          if (isValidDestination) {
            camera.lookAtTransform(Matrix4.IDENTITY);
            camera.setView({
              destination,
              orientation: {
                heading: heading ?? 0,
                pitch: pitch ?? -CesiumMath.PI_OVER_TWO,
              },
            });
            usedInitial = true;
            withWidget((w) => w.scene.requestRender());
          } else {
            console.warn(
              "invalid camera position restored, using default as fallback",
              destination,
              home
            );
          }
        });
      }
    }

    if (!usedInitial && hasHome) {
      resetToHome();
    }

    withScene((scene) => {
      if (!willFlyHome) {
        const markSettled = () => {
          withScene((scene) => {
            setInitialCameraSettled(true);
            console.info(
              "[CESIUM|INIT|SETTLE] postRender -> state:true (applied)"
            );
            scene.postRender.removeEventListener(markSettled);
          });
        };
        scene.postRender.addEventListener(markSettled);
      }
      initialViewSetMap.set(scene, true);
    });
  }, [
    isReady,
    initialCameraView,
    home,
    homeOffset,
    isMode2d,
    maxZoom,
    withWidget,
    withCamera,
    withScene,
    setInitialCameraSettled,
  ]);

  // Resize handling — prefer widget.resize() over manual canvas sizing
  useEffect(() => {
    if (!widgetRef.current || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        widgetRef.current?.resize?.();
      } catch {
        // fallback to manual canvas sizing
        withWidget((w) => {
          w.canvas.width = containerRef.current!.clientWidth;
          w.canvas.height = containerRef.current!.clientHeight;
          (w.canvas.style as CSSStyleDeclaration).width = "100%";
          (w.canvas.style as CSSStyleDeclaration).height = "100%";
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [containerRef, withWidget]);

  // Mode change handler: pause/resume rendering in 2D/3D
  useEffect(() => {
    if (!widgetRef.current) return;
    if (isMode2d !== previousIsMode2d.current) {
      previousIsMode2d.current = isMode2d;
      const v = widgetRef.current as unknown as {
        scene: Scene;
        camera: Camera;
      };
      if (isMode2d) {
        v.scene.requestRenderMode = true;
        try {
          (v.camera as Camera & { cancelFlight?: () => void }).cancelFlight?.();
        } catch {}
        const scene = v.scene as Scene & { tweens?: { removeAll(): void } };
        if (scene.tweens && typeof scene.tweens.removeAll === "function") {
          try {
            scene.tweens.removeAll();
          } catch {}
        }
      } else {
        v.scene.requestRenderMode = false;
        v.scene.requestRender();
      }
    }
    if (isSecondaryStyle !== previousIsSecondaryStyle.current) {
      previousIsSecondaryStyle.current = isSecondaryStyle;
    }
  }, [widgetRef, isMode2d, isSecondaryStyle]);
};

export default useInitialize;
