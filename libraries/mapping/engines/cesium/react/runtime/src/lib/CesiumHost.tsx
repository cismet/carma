import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useMemo,
} from "react";

import {
  Color,
  Rectangle,
  Cartesian3,
  type Cartographic,
  type CesiumWidget,
} from "@carma-cesium";
import { merge } from "lodash";

import {
  type HostElementSize,
  useHostElementSizeRef,
} from "@carma-commons/ui/components";

import {
  CesiumErrorHandler,
  type CesiumErrorHandlerOptions,
} from "./CesiumErrorHandler";
import type { CameraLimiterOptions } from "./camera-limiter-options";
import useCameraPitchEasingLimiter from "./hooks/useCameraPitchEasingLimiter";
import useCameraPitchSoftLimiter from "./hooks/useCameraPitchSoftLimiter";
import useCameraRollSoftLimiter from "./hooks/useCameraRollSoftLimiter";
import { useCesiumGlobe } from "./hooks/useCesiumGlobe";
import useDisableSSCC from "./hooks/useDisableSSCC";
import { useInitializeCesiumWidget } from "./hooks/useInitializeCesiumWidget";
import {
  useOnSceneChange,
  type StringifiedCameraState,
} from "./hooks/useOnSceneChange";
import { useSceneStyles } from "./hooks/useSceneStyles";
import { useTilesets } from "./hooks/useTilesets";
import useTransitionTimeout from "./hooks/useTransitionTimeout";
import {
  DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS,
  type CesiumWidgetConstructorOptions,
} from "./cesiumWidgetDefaults";

export type GlobeOptions = {
  // https://cesium.com/learn/cesiumjs/ref-doc/Globe.html
  baseColor?: Color;
  cartographicLimitRectangle?: Rectangle;
  showGroundAtmosphere?: boolean;
  showSkirts?: boolean;
};

const DEFAULT_GLOBE_OPTIONS: GlobeOptions = {
  baseColor: Color.TRANSPARENT,
  cartographicLimitRectangle: undefined,
  showGroundAtmosphere: false,
  showSkirts: false,
};

const resolveWidgetConstructorOptions = (
  constructorOptions?: CesiumWidgetConstructorOptions
): CesiumWidgetConstructorOptions =>
  merge({}, DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS, constructorOptions);

const DEFAULT_HOST_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

export type InitialCameraView = {
  position?: Cartographic;
  anchor?: Cartographic;
  zoom?: number;
  direction?: Cartesian3;
  up?: Cartesian3;
  fov?: number | null;
  fovLongerEdge?: number | null;
};

type CesiumHostRuntimeProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  hostContainerSize: HostElementSize | null;
  cameraLimiterOptions?: CameraLimiterOptions;
  initialCameraView?: InitialCameraView | null;
  homeValidationCenter?: Cartesian3 | null;
  constructorOptions?: CesiumWidgetConstructorOptions;
  globeOptions?: GlobeOptions;
  // callbacks
  onSceneChange?: (
    e: { hashParams: Record<string, string> },
    runtime?: CesiumWidget,
    cesiumCameraState?: StringifiedCameraState | null,
    isSecondaryStyle?: boolean
  ) => void;
  enableSceneStyles?: boolean;
  // debug/error handling wiring
  errorHandlerOptions?: CesiumErrorHandlerOptions;
};

export type CesiumHostState = {
  element: HTMLDivElement | null;
  size: HostElementSize | null;
  isReady: boolean;
};

export type CesiumHostProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> &
  Omit<CesiumHostRuntimeProps, "containerRef" | "hostContainerSize"> & {
    onHostChange?: (state: CesiumHostState) => void;
  };

const CesiumHostRuntime = (props: CesiumHostRuntimeProps) => {
  const {
    globeOptions = DEFAULT_GLOBE_OPTIONS,
    cameraLimiterOptions,
    initialCameraView,
    homeValidationCenter,
    constructorOptions,
    containerRef,
    hostContainerSize,
    onSceneChange,
    enableSceneStyles = true,
  } = props;

  const options: CesiumWidgetConstructorOptions = useMemo(
    () => resolveWidgetConstructorOptions(constructorOptions),
    [constructorOptions]
  );

  useInitializeCesiumWidget(
    containerRef,
    options,
    initialCameraView,
    homeValidationCenter,
    hostContainerSize
  );
  useCesiumGlobe(globeOptions);

  useTransitionTimeout();

  // camera enhancements
  useDisableSSCC();
  useCameraRollSoftLimiter(cameraLimiterOptions);
  useCameraPitchSoftLimiter(cameraLimiterOptions);
  useCameraPitchEasingLimiter(cameraLimiterOptions);

  // useCesiumWhenHidden hook removed - Cesium is always active now

  useTilesets();
  useSceneStyles(enableSceneStyles);

  // callback
  useOnSceneChange(onSceneChange);

  return (
    <>
      <CesiumErrorHandler {...(props.errorHandlerOptions || {})} />
    </>
  );
};

const CesiumHostComponent = (props: CesiumHostProps) => {
  const {
    cameraLimiterOptions,
    constructorOptions,
    enableSceneStyles,
    errorHandlerOptions,
    globeOptions,
    homeValidationCenter,
    initialCameraView,
    onHostChange,
    onSceneChange,
    style,
    ...hostProps
  } = props;
  const {
    ref: setHostRef,
    elementRef,
    size,
    isReady,
  } = useHostElementSizeRef<HTMLDivElement>();

  useLayoutEffect(() => {
    onHostChange?.({
      element: elementRef.current,
      size,
      isReady,
    });
  }, [elementRef, isReady, onHostChange, size]);

  useLayoutEffect(
    () => () => {
      onHostChange?.({
        element: null,
        size: null,
        isReady: false,
      });
    },
    [onHostChange]
  );

  return (
    <div {...hostProps} ref={setHostRef} style={style ?? DEFAULT_HOST_STYLE}>
      <CesiumHostRuntime
        containerRef={elementRef}
        hostContainerSize={size}
        cameraLimiterOptions={cameraLimiterOptions}
        constructorOptions={constructorOptions}
        enableSceneStyles={enableSceneStyles}
        errorHandlerOptions={errorHandlerOptions}
        globeOptions={globeOptions}
        homeValidationCenter={homeValidationCenter}
        initialCameraView={initialCameraView}
        onSceneChange={onSceneChange}
      />
    </div>
  );
};

export const CesiumHost = CesiumHostComponent;

export default CesiumHost;
