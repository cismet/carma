import { type RefObject, useMemo, useRef } from "react";
import { Color, Rectangle, Camera } from "@carma/cesium";
import { merge } from "lodash";

import { type CesiumErrorHandlerOptions } from "./components/CesiumErrorHandler";

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
import {
  DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS,
  TRANSITION_DELAY,
} from "./utils/widget-defaults";
// DISABLED: TilesetProgressBars temporarily disabled
// import { TilesetProgressBars } from "./components/TilesetProgressBars";
import type { ColorRgbaArray } from "./types/config/scene-style";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color | ColorRgbaArray;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
};

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
  containerRef?: RefObject<HTMLDivElement>; // Optional - will create internal ref if not provided

  // Event callbacks
  onCameraChanged?: (params: { source: string; camera: Camera }) => void;

  // Runtime options (not in config)
  errorHandlerOptions?: CesiumErrorHandlerOptions;

  // Key for forcing remount on error (increment to remount)
  resetKey?: number;
};

export function CesiumSceneComponent(props: CesiumSceneComponentProps) {
  const { containerRef: externalContainerRef, onCameraChanged } = props;

  // Create internal ref if none provided
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;

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
  const { tilesetProgress } = useTilesetManager(tilesets);
  useImageryManager(imagery);
  useTerrainManager(terrain);

  // Scene appearance hooks (initial values, applySceneStyle overrides on style switch)
  useCesiumGlobe({});
  useShadows(false);
  useBackgroundColor(undefined);
  useCesiumWhenSuspended(TRANSITION_DELAY);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />
      {/* DISABLED: TilesetProgressBars temporarily disabled */}
      {/* <TilesetProgressBars tilesets={tilesetProgress} /> */}
    </>
  );
}

export default CesiumSceneComponent;
