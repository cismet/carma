import { type RefObject, useMemo } from "react";
import { Color, Viewer, Rectangle, Cartographic } from "cesium";
import { merge } from "lodash";

import {
  CesiumErrorHandler,
  type CesiumErrorHandlerOptions,
} from "./CesiumErrorHandler";

import { ElevationControl } from "./extensions/elevationControl";

import useCameraRollSoftLimiter from "./extensions/cameraLimiters/hooks/useCameraRollSoftLimiter";
import useCameraPitchEasingLimiter from "./extensions/cameraLimiters/hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./extensions/cameraLimiters/hooks/useCameraPitchSoftLimiter";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import { useCesiumWhenSuspended } from "./hooks/useCesiumWhenSuspended";
import { useInitCesiumWidget } from "./hooks/useInitCesiumWidget";
import { useTilesetManager } from "./hooks/useTilesetManager";
import { useCesiumContext } from "./hooks/useCesiumContext";
import { useOnSceneChange } from "./hooks/useOnSceneChange";
import { useSceneStyles } from "./hooks/useSceneStyles";
import { StringifiedCameraState } from "./utils/cesiumHashParamsCodec";
import {
  DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  TRANSITION_DELAY,
} from "./viewerDefaults";

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
  containerRef: RefObject<HTMLDivElement>;
  cameraLimiterOptions?: CameraLimiterOptions;
  initialCameraView?: InitialCameraView;
  globeOptions?: GlobeOptions;
  constructorOptions?: Partial<Viewer.ConstructorOptions>;
  onSceneChange?: (params: {
    source: string;
    stringifiedCamera: StringifiedCameraState;
  }) => void;
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
    containerRef,
    onSceneChange,
  } = props;

  const { tilesetsRef } = useCesiumContext();

  const options: Viewer.ConstructorOptions = useMemo(
    () => merge({}, DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS, constructorOptions),
    [constructorOptions]
  );

  useInitCesiumWidget(containerRef, options);
  const { loadingProgress, showSplash } = useTilesetManager(
    Array.from(tilesetsRef.current.values())
  );
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
      {showSplash && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div style={{ textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: "24px", marginBottom: "20px" }}>
              Loading 3D Scene...
            </div>
          </div>
        </div>
      )}
      {!showSplash && loadingProgress < 100 && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "4px",
            zIndex: 999,
          }}
        >
          Loading: {Math.round(loadingProgress)}%
        </div>
      )}
    </>
  );
}

export default CesiumSceneComponent;
