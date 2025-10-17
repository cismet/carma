import { type RefObject, useMemo, useRef } from "react";
import { Color, CesiumWidget, Rectangle, Camera } from "cesium";
import { merge } from "lodash";

import { type CesiumErrorHandlerOptions } from "./components/CesiumErrorHandler";

import { useDisableSSCC } from "./hooks/useDisableSSCC";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useCesiumWhenSuspended } from "./hooks/useCesiumWhenSuspended";
import { useInitCesiumWidget } from "./hooks/useInitCesiumWidget";
import { useTilesetManager } from "./hooks/useTilesetManager";
import { useImageryManager } from "./hooks/useImageryManager";
import { useTerrainManager } from "./hooks/useTerrainManager";
import { useShadows } from "./hooks/useShadows";
import { useCesiumContext } from "./hooks/useCesiumContext";
import {
  DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS,
  TRANSITION_DELAY,
} from "./widgetDefaults";
import { TilesetProgressBars } from "./components/TilesetProgressBars";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color;
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

export type InitialCameraView = {
  heading?: number;
  pitch?: number;
  fov?: number;
};

export type CesiumSceneComponentProps = {
  containerRef?: RefObject<HTMLDivElement>; // Optional - will create internal ref if not provided
  cameraLimiterOptions?: CameraLimiterOptions;
  initialCameraView?: InitialCameraView;
  globeOptions?: GlobeOptions;
  constructorOptions?: Partial<ConstructorParameters<typeof CesiumWidget>[1]>;
  onSceneChange?: (params: { source: string; camera: Camera }) => void;
  enableSceneStyles?: boolean;
  elevationControl?: {
    enabled: boolean;
    defaultScale?: "absolute" | "terrain";
  };
  errorHandlerOptions?: CesiumErrorHandlerOptions;
};

export function CesiumSceneComponent(props: CesiumSceneComponentProps) {
  const {
    globeOptions = {
      baseColor: Color.TRANSPARENT,
      cartographicLimitRectangle: undefined,
      showGroundAtmosphere: false,
      showSkirts: false,
    },
    cameraLimiterOptions,
    initialCameraView,
    constructorOptions,
    containerRef: externalContainerRef,
    onSceneChange,
  } = props;

  // Create internal ref if none provided
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;

  const { config } = useCesiumContext();

  // Extract TilesetConfigs from TilesetRecords
  const tilesetConfigs = useMemo(() => {
    if (!config?.tilesets) return [];
    return config.tilesets.map((t) => t.config);
  }, [config]);

  // Extract imagery and terrain provider records
  const imageryProviders = useMemo(
    () => config?.imageryProviders || [],
    [config]
  );
  const terrainProviders = useMemo(
    () => config?.terrainProviders || [],
    [config]
  );

  const options = useMemo(
    () => merge({}, DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS, constructorOptions),
    [constructorOptions]
  );

  useInitCesiumWidget(containerRef, options);
  const { tilesetProgress } = useTilesetManager(tilesetConfigs);
  useImageryManager(imageryProviders);
  useTerrainManager(terrainProviders);
  useCesiumGlobe(globeOptions); // Enable and style the globe
  useShadows(); // Configure shadow settings
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
      <TilesetProgressBars tilesets={tilesetProgress} />
    </>
  );
}

export default CesiumSceneComponent;
