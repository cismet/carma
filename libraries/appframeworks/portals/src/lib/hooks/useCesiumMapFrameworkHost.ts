import { useCallback, useEffect, useRef, useState } from "react";

import type { CesiumTerrainProvider } from "@carma-cesium";
import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import {
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import {
  type CesiumNavigationBridgeHandle,
  useCesiumNavigationBridge,
} from "@carma-mapping/engines-interop/view-state";
import {
  type CesiumHostState,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/react/runtime";

export type CesiumMapFrameworkTerrainProviders = {
  TERRAIN: CesiumTerrainProvider | null;
  SURFACE: CesiumTerrainProvider | null;
};

export type UseCesiumMapFrameworkHostOptions = {
  /** View-adapter id for the navigation bridge (per app). */
  viewAdapterId: string;
  /** Leaflet map accessor (e.g. TopicMapContext.routedMapRef). */
  getLeafletMap: () => LeafletMap | null | undefined;
  /** Terrain/surface provider mapping registered with the switcher. */
  getCesiumTerrainProviders: () => CesiumMapFrameworkTerrainProviders;
  /** When false, never auto-mount Cesium and reject ensure-ready. Default true. */
  allow3d?: boolean;
  /** ANDed into the nav-bridge commit gate (e.g. !isTransitioning). Default true. */
  isCommitEnabled?: boolean;
  /** App staging awaited before 2D->3D (memoize). Default undefined = no-op. */
  onBeforeTransitionToCesium?: () => void | Promise<void>;
  /** App teardown awaited before 3D->2D (memoize). Default undefined = no-op. */
  onBeforeTransitionToLeaflet?: () => void | Promise<void>;
};

export type CesiumMapFrameworkHost = CesiumNavigationBridgeHandle & {
  shouldMountCesium: boolean;
  handleCesiumHostChange: (state: CesiumHostState) => void;
  isCesiumRuntimeReady: boolean;
};

/**
 * Wires a Cesium runtime into the 2D/3D MapFrameworkSwitcher: registers the
 * leaflet/cesium refs, lazily mounts Cesium, gates the 2D->3D transition on
 * runtime readiness, binds the navigation bridge, and owns the switcher
 * transition callbacks. App-specific staging is passed via options; returns the
 * bridge handle plus what the layout needs to mount <CesiumHost>.
 */
export const useCesiumMapFrameworkHost = ({
  viewAdapterId,
  getLeafletMap,
  getCesiumTerrainProviders,
  allow3d = true,
  isCommitEnabled = true,
  onBeforeTransitionToCesium,
  onBeforeTransitionToLeaflet,
}: UseCesiumMapFrameworkHostOptions): CesiumMapFrameworkHost => {
  const { getScene, isRuntimeReady, initialViewApplied } = useCesiumContext();
  const cesiumScene = getScene();
  const { isCesium, registerCallbacks } = useMapFrameworkSwitcherContext();

  // Container as deduped state so readiness can gate on it.
  const [cesiumContainerElement, setCesiumContainerElement] =
    useState<HTMLElement | null>(null);
  const [shouldMountCesium, setShouldMountCesium] = useState(false);
  const cesiumReadyPromiseRef = useRef<Promise<void> | null>(null);
  const cesiumReadyResolversRef = useRef<Array<() => void>>([]);

  const handleCesiumHostChange = useCallback(({ element }: CesiumHostState) => {
    setCesiumContainerElement((previous) =>
      previous === element ? previous : element
    );
  }, []);

  // Container is implied by isRuntimeReady; kept to match geoportal's tested gate.
  const isCesiumRuntimeReady = Boolean(
    cesiumScene && isRuntimeReady && cesiumContainerElement
  );

  const getCesiumContainer = useCallback(
    () => cesiumContainerElement,
    [cesiumContainerElement]
  );

  useRegisterMapFramework({
    getLeafletMap,
    getCesiumScene: getScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
  });

  useEffect(() => {
    if (!allow3d) return;
    if (isCesium && !shouldMountCesium) {
      setShouldMountCesium(true);
    }
  }, [allow3d, isCesium, shouldMountCesium]);

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
    if (!allow3d) {
      return Promise.reject(new Error("3D is disabled for the current app."));
    }

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
  }, [allow3d, isCesiumRuntimeReady]);

  const bridge = useCesiumNavigationBridge({
    id: viewAdapterId,
    scene: cesiumScene,
    isSyncEnabled: Boolean(cesiumScene),
    isCommitEnabled: isCesium && initialViewApplied && isCommitEnabled,
  });
  const { commitCurrentSceneState } = bridge;

  // Host owns all switcher transition callbacks. force:true on the post-transition
  // commit bypasses suppressCommitsUntilInteraction.
  useEffect(() => {
    registerCallbacks({
      onEnsureCesiumReady: allow3d ? ensureCesiumReadyForTransition : undefined,
      onAfterTransitionToCesium: () => {
        commitCurrentSceneState("transition-complete", { force: true });
      },
      onBeforeTransitionToCesium,
      onBeforeTransitionToLeaflet,
    });
  }, [
    allow3d,
    commitCurrentSceneState,
    ensureCesiumReadyForTransition,
    onBeforeTransitionToCesium,
    onBeforeTransitionToLeaflet,
    registerCallbacks,
  ]);

  return {
    ...bridge,
    shouldMountCesium,
    handleCesiumHostChange,
    isCesiumRuntimeReady,
  };
};
