import {
  ReactNode,
  type RefObject,
  useMemo,
  useEffect,
  useRef,
  memo,
} from "react";
import type { GlobeConstructorOptionsPrimitive } from "@carma/cesium/types";
import { merge } from "lodash";

import { CesiumErrorHandler } from "./components/CesiumErrorHandler";
import { SceneStyleManager } from "./components/SceneStyleManager";
import { useCesiumWhenSuspended } from "./hooks/scene/use-cesium-when-suspended";
import { useInitCesiumWidget } from "./hooks/scene/use-init-cesium-widget";
import { useCesiumContext } from "./context/hooks/use-cesium-context";
import { useSceneCameraTracking } from "./hooks/scene/use-scene-camera-tracking";
import { DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS } from "./utils/widget-defaults";

// Re-export for backwards compatibility
export type { GlobeConstructorOptionsPrimitive };

export type CameraLimiterOptions = {
  pitchLimiter?: boolean;
  minPitch?: number;
  minPitchRange?: number;
  rollThreshold?: number;
  nadirThreshold?: number;
  minPitchDeg?: number;
  easingRangeDeg?: number;
  easing?: (x: number) => number;
  resetPitchOffsetDeg?: number;
  debug?: boolean;
};

export type CesiumSceneComponentProps = {
  containerRef: RefObject<HTMLDivElement>;
  // Key for forcing remount on error (increment to remount)
  resetKey?: number;
  // Children to render inside the scene
  children?: ReactNode;
  // Note: Scene only mounts when activated - suspension handled by wrapper CSS
  // All initialization data (style, camera) fetched from context refs internally
};

export function CesiumSceneComponent({
  containerRef,
  children,
}: CesiumSceneComponentProps) {
  // Lifecycle tracking
  const mountCountRef = useRef(0);
  const renderCountRef = useRef(0);

  useEffect(() => {
    const currentMount = mountCountRef.current + 1;
    mountCountRef.current = currentMount;
    console.log(`[SCENE] 🟢 MOUNTED (mount #${currentMount})`);

    return () => {
      console.log(`[SCENE] 🔴 UNMOUNTING (was mount #${currentMount})`);
    };
  }, []);

  renderCountRef.current++;
  console.log(
    `[SCENE] RENDER #${renderCountRef.current} (mount #${mountCountRef.current})`
  );

  // Fetch config and style data from context
  const { config, widgetRef } = useCesiumContext();

  const options = useMemo(
    () => merge({}, DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS, config.options),
    [config.options]
  );

  // Extract style configuration for prop passing
  const sceneStyle = config.sceneStyle;

  // Widget initialization: Scene only mounts when active, so init immediately
  useInitCesiumWidget(containerRef, true, options);

  // Camera tracking: Updates refs directly (internal coordination only)
  useSceneCameraTracking();

  // Suspension handling
  useCesiumWhenSuspended();

  // Render scene components:
  // - Error handler intercepts Cesium errors
  // - SceneStyleManager coordinates styles and resource loading (receives style config via props)
  // - User children
  return (
    <>
      <CesiumErrorHandler widgetRef={widgetRef} />
      <SceneStyleManager sceneStyle={sceneStyle} />
      {children}
    </>
  );
}

export default CesiumSceneComponent;
