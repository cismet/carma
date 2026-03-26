import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneLike } from "@carma-mapping/engines/cesium/api";

type FrameworkSwitcherCallbacks = {
  onEnsureCesiumReady?: () => Promise<void> | void;
};

type RegisterFrameworkSwitcherCallbacks = (
  callbacks: Partial<FrameworkSwitcherCallbacks>
) => void;

type UseFloodingmapDeferredCesiumRuntimeOptions = {
  isCesium: boolean;
  isViewerReady: boolean;
  scene: SceneLike | null;
  registerCallbacks: RegisterFrameworkSwitcherCallbacks;
};

export const useFloodingmapDeferredCesiumRuntime = (
  options: UseFloodingmapDeferredCesiumRuntimeOptions
) => {
  const { isCesium, isViewerReady, scene, registerCallbacks } = options;

  const container3dMapRef = useRef<HTMLDivElement>(null);
  const [cesiumContainerElement, setCesiumContainerElement] =
    useState<HTMLDivElement | null>(null);
  const [shouldMountCesium, setShouldMountCesium] = useState(false);
  const cesiumReadyPromiseRef = useRef<Promise<void> | null>(null);
  const cesiumReadyResolversRef = useRef<Array<() => void>>([]);

  const handleCesiumContainerRef = useCallback((node: HTMLDivElement | null) => {
    container3dMapRef.current = node;
    setCesiumContainerElement(node);
  }, []);

  const getCesiumContainer = useCallback(
    () => container3dMapRef.current,
    [container3dMapRef]
  );

  const isCesiumRuntimeReady = Boolean(
    scene && cesiumContainerElement && isViewerReady
  );

  useEffect(() => {
    if (isCesium && !shouldMountCesium) {
      setShouldMountCesium(true);
    }
  }, [isCesium, shouldMountCesium]);

  useEffect(() => {
    if (!isCesiumRuntimeReady) {
      return;
    }

    const resolvers = cesiumReadyResolversRef.current;
    if (resolvers.length === 0) {
      cesiumReadyPromiseRef.current = null;
      return;
    }

    cesiumReadyResolversRef.current = [];
    cesiumReadyPromiseRef.current = null;
    resolvers.forEach((resolve) => resolve());
  }, [isCesiumRuntimeReady]);

  const ensureCesiumReadyForTransition = useCallback(() => {
    if (isCesiumRuntimeReady) {
      return Promise.resolve();
    }

    setShouldMountCesium(true);

    if (cesiumReadyPromiseRef.current) {
      return cesiumReadyPromiseRef.current;
    }

    cesiumReadyPromiseRef.current = new Promise<void>((resolve) => {
      cesiumReadyResolversRef.current.push(resolve);
    });

    return cesiumReadyPromiseRef.current;
  }, [isCesiumRuntimeReady]);

  useEffect(() => {
    registerCallbacks({
      onEnsureCesiumReady: ensureCesiumReadyForTransition,
    });
  }, [ensureCesiumReadyForTransition, registerCallbacks]);

  return {
    container3dMapRef,
    getCesiumContainer,
    handleCesiumContainerRef,
    shouldMountCesium,
  };
};
