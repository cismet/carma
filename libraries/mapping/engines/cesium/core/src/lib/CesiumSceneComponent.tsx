import { ReactNode, type RefObject, useMemo, useRef } from "react";
import type { Camera } from "@carma/cesium";
import type { GlobeConstructorOptionsPrimitive } from "@carma/cesium/types";
import { merge } from "lodash";

import { CesiumErrorHandler } from "./components/CesiumErrorHandler";
import { useCesiumGlobe } from "./hooks/scene/use-cesium-globe";
import { useCesiumWhenSuspended } from "./hooks/scene/use-cesium-when-suspended";
import { useInitCesiumWidget } from "./hooks/scene/use-init-cesium-widget";
import { useSceneStyleResources } from "./hooks/scene/use-scene-style-resources";
import { useTilesetManager } from "./hooks/resources/tilesets/use-tileset-manager";
import { useImageryManager } from "./hooks/resources/imagery/use-imagery-manager";
import { useTerrainManager } from "./hooks/resources/terrain/use-terrain-manager";
import { useShadows } from "./hooks/scene/use-shadows";
import { useBackgroundColor } from "./hooks/scene/use-background-color";
import { useCesiumContext } from "./context/hooks/use-cesium-context";
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
  // Event callbacks
  onCameraChanged?: (params: { source: string; camera: Camera }) => void;
  // Key for forcing remount on error (increment to remount)
  resetKey?: number;
  // Children to render inside the scene
  children?: ReactNode;
};

export function CesiumSceneComponent({
  containerRef,
  children,
}: CesiumSceneComponentProps) {
  const { config } = useCesiumContext();

  const options = useMemo(
    () => merge({}, DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS, config.options),
    [config.options]
  );

  useInitCesiumWidget(containerRef, options);

  // Extract ALL available resource sources from config
  const { tilesets, terrain, imagery } = useSceneStyleResources(config);

  console.log("[SCENE] Extracted resources:", {
    tilesets: tilesets.map((t) => t.id),
    terrain: terrain.map((t) => t.id),
    imagery: imagery.map((i) => i.id),
  });

  // Managers receive all sources and handle activation based on style events
  useTilesetManager(tilesets); // Emits SceneResourcesReady via event bus
  useImageryManager(imagery);
  useTerrainManager(terrain);

  // Scene appearance hooks (initial values, applySceneStyle overrides on style switch)
  useCesiumGlobe({});
  useShadows();
  useBackgroundColor(); // No args - backgroundColor comes from style events
  useCesiumWhenSuspended();

  // Render error handler to intercept Cesium errors
  return (
    <>
      <CesiumErrorHandler />
      {children}
    </>
  );
}

export default CesiumSceneComponent;
