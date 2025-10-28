import React, { useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import type {
  CesiumTerrainProvider,
  ImageryLayer,
  Viewer,
  Cesium3DTileset,
  Scene,
  Model,
} from "cesium";

import { CesiumContext, type CesiumContextType } from "./CesiumContext";

// DISABLED: Provider loaders for minimal mode
// import {
//   useImageryProviderLoader,
//   useImageryLayer,
//   useTerrainProviderLoader,
//   useSurfaceProviderLoader,
//   useModelsLoader,
// } from "./hooks/useCesiumProviderLoaders";

import type { AnimationMap } from "@carma/types";
import type { CesiumConfig } from "../../types/cesium-snapshot-types";

import { initAnimationMap } from "../../utils/animationMap";
import { sceneRequestRender } from "../../utils/sceneRequestRender";

export const CesiumContextProvider = ({
  children,
  config,
}: {
  children: ReactNode;
  config: CesiumConfig;
}): React.ReactElement => {
  const {
    models,
    tilesets,
    homePosition,
    homeOffset,
    cameraController,
    sceneStyles,
  } = config;
  // Use refs for Cesium instances to prevent re-renders
  const widgetRef = useRef<Viewer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const animationMapRef = useRef<AnimationMap | null>(initAnimationMap());

  // Provider refs - use Maps for arbitrary numbers of providers per type
  const terrainProvidersRef = useRef<Map<string, CesiumTerrainProvider>>(
    new Map()
  );
  const imageryLayersRef = useRef<Map<string, ImageryLayer>>(new Map());
  const tilesetsRef = useRef<Map<string, Cesium3DTileset>>(new Map());
  const modelsRef = useRef<Map<string, Model>>(new Map());

  // State refs
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);
  const isSuspendedRef = useRef(false); // Start in 3D mode
  const isAnimatingRef = useRef(false);
  const suspendSSCCRef = useRef(false);
  const transitionStateRef = useRef<string | null>(null);

  // Camera controller settings from config
  const minZoomDistanceRef = useRef(cameraController?.minimumZoomDistance ?? 1);
  const maxZoomDistanceRef = useRef(
    cameraController?.maximumZoomDistance ?? Infinity
  );
  const enableCollisionDetectionRef = useRef(
    cameraController?.enableCollisionDetection ?? false
  );

  const initialStyle =
    Array.isArray(sceneStyles) && sceneStyles.length > 0
      ? sceneStyles[0].id
      : undefined;
  const currentSceneStyleRef = useRef<string | undefined>(initialStyle);

  // Home position from config
  const homePositionRef = useRef<{ x: number; y: number; z: number } | null>(
    homePosition ?? null
  );
  const homeOffsetRef = useRef<{ x: number; y: number; z: number } | null>(
    homeOffset ?? null
  );

  const dataSourcesRef = useRef<Record<string, any> | null>(null);


 // ALL PROVIDER LOADERS DISABLED for minimal mode
  // useImageryProviderLoader({ providerConfig, imageryLayerRef, isValidViewer });
  // useImageryLayer({ isViewerReady, sceneRef, imageryLayerRef });
  // useTerrainProviderLoader({
  //   providerConfig,
  //   terrainProviderRef,
  // });
  // useSurfaceProviderLoader({
  //   providerConfig,
  //   surfaceProviderRef,
  // });
  // useModelsLoader({
  //   models,
  //   sceneRef,
  // });

  const requestRender = useCallback(() => {
    sceneRef.current && sceneRequestRender(sceneRef.current);
  }, [sceneRef]);

  const contextValue = useMemo<CesiumContextType>(
    () => ({
      widgetRef,
      sceneRef,
      terrainProvidersRef,
      imageryLayersRef,
      tilesetsRef,
      modelsRef,
      isSuspendedRef,
      homePositionRef,
      minZoomDistanceRef,
      maxZoomDistanceRef,
      enableCollisionDetectionRef,
      currentSceneStyleRef,
      isAnimatingRef,
      transitionStateRef,
      suspendSSCCRef,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      requestRender,
      animationMapRef,
    }),
    [requestRender]
  );

  console.debug("CesiumContextProvider Changed/Rendered");

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
