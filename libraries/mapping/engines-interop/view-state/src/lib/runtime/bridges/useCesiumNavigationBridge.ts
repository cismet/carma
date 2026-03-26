import { useCallback, useContext, useEffect, useMemo } from "react";
import type { SceneLike } from "@carma-mapping/engines/cesium/api";
import type {
  ViewStateNavigationCommitReason,
  ViewStateNavigationManagerContextValue,
  WritePriority,
} from "../../core/types";
import {
  useCesiumRuntimeBridge,
  type CesiumRuntimeBridgeHandle,
} from "./useCesiumRuntimeBridge";
import { ViewStateNavigationManagerContext } from "../providers/navigation/ViewStateNavigationManagerContext";

export const CESIUM_NAVIGATION_BRIDGE_LISTENER = {
  MOVE_END: "moveEnd",
  MORPH_COMPLETE: "morphComplete",
} as const;

export type CesiumNavigationBridgeListener =
  (typeof CESIUM_NAVIGATION_BRIDGE_LISTENER)[keyof typeof CESIUM_NAVIGATION_BRIDGE_LISTENER];

const DEFAULT_CESIUM_NAVIGATION_BRIDGE_LISTENERS = [
  CESIUM_NAVIGATION_BRIDGE_LISTENER.MOVE_END,
  CESIUM_NAVIGATION_BRIDGE_LISTENER.MORPH_COMPLETE,
] as const satisfies readonly CesiumNavigationBridgeListener[];

const normalizeCesiumNavigationBridgeListeners = (
  listeners:
    | CesiumNavigationBridgeListener
    | readonly CesiumNavigationBridgeListener[]
): ReadonlySet<CesiumNavigationBridgeListener> =>
  new Set(Array.isArray(listeners) ? listeners : [listeners]);

export type UseCesiumNavigationBridgeOptions = {
  id: string;
  scene?: SceneLike | null;
  isSyncEnabled?: boolean;
  isCommitEnabled?: boolean;
  pushPriority?: WritePriority;
  replace?: boolean;
  listeners?:
    | CesiumNavigationBridgeListener
    | readonly CesiumNavigationBridgeListener[];
};

export type CesiumNavigationBridgeHandle = CesiumRuntimeBridgeHandle & {
  commitCurrentSceneState: (
    reason: ViewStateNavigationCommitReason,
    options?: { replace?: boolean; force?: boolean }
  ) => boolean;
};

const useViewStateNavigationCommitContext =
  (): ViewStateNavigationManagerContextValue => {
    const ctx = useContext(ViewStateNavigationManagerContext);
    if (!ctx) {
      throw new Error(
        "useCesiumNavigationBridge requires a <ViewStateNavigationManagerProvider> ancestor."
      );
    }
    return ctx;
  };

export const useCesiumNavigationBridge = ({
  id,
  scene = null,
  isSyncEnabled = true,
  isCommitEnabled = true,
  pushPriority = "sync",
  replace = true,
  listeners = DEFAULT_CESIUM_NAVIGATION_BRIDGE_LISTENERS,
}: UseCesiumNavigationBridgeOptions): CesiumNavigationBridgeHandle => {
  const { commitCurrentState } = useViewStateNavigationCommitContext();
  const adapter = useCesiumRuntimeBridge({
    id,
    scene,
    enabled: isSyncEnabled,
    pushPriority,
  });
  const listenerSet = useMemo(
    () => normalizeCesiumNavigationBridgeListeners(listeners),
    [listeners]
  );

  const commitCurrentSceneState = useCallback(
    (
      reason: ViewStateNavigationCommitReason,
      options?: { replace?: boolean; force?: boolean }
    ) => {
      if (!isCommitEnabled) {
        return false;
      }

      adapter.publishCurrentState();
      return commitCurrentState(reason, {
        replace: options?.replace ?? replace,
        force: options?.force,
      });
    },
    [adapter, commitCurrentState, isCommitEnabled, replace]
  );

  useEffect(() => {
    if (!scene || !isSyncEnabled) {
      return;
    }

    const removeListeners: Array<() => void> = [];

    if (listenerSet.has(CESIUM_NAVIGATION_BRIDGE_LISTENER.MOVE_END)) {
      const moveEnd = scene.camera?.moveEnd;
      if (moveEnd) {
        const onMoveEnd = () => {
          commitCurrentSceneState("interaction-settled");
        };
        moveEnd.addEventListener(onMoveEnd);
        removeListeners.push(() => {
          moveEnd.removeEventListener(onMoveEnd);
        });
      }
    }

    if (listenerSet.has(CESIUM_NAVIGATION_BRIDGE_LISTENER.MORPH_COMPLETE)) {
      const morphComplete = scene.morphComplete;
      if (morphComplete) {
        const onMorphComplete = () => {
          commitCurrentSceneState("programmatic-settle");
        };
        morphComplete.addEventListener(onMorphComplete);
        removeListeners.push(() => {
          morphComplete.removeEventListener(onMorphComplete);
        });
      }
    }

    return () => {
      removeListeners.forEach((removeListener) => removeListener());
    };
  }, [commitCurrentSceneState, isSyncEnabled, listenerSet, scene]);

  return useMemo(
    () => ({
      ...adapter,
      commitCurrentSceneState,
    }),
    [adapter, commitCurrentSceneState]
  );
};
