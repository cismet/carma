import { useCallback, useEffect, useMemo, useRef } from "react";
import { type Scene } from "@carma-cesium";
import {
  SCENE_VIEW_STATE_THREE_D_ONLY_HASH_PARAMS,
  useHashState,
} from "@carma-providers/hash-state";

import { useViewStateNavigationContext } from "../providers/navigation/useViewStateNavigationContext";
import type {
  ViewStateNavigationCommitReason,
  WritePriority,
} from "../../core/types";
import { useCesiumRuntimeBridge } from "./useCesiumRuntimeBridge";
import type { SubscribedRuntimeBridgeHandle } from "./useSubscribedRuntimeBridge";
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
  scene?: Scene | null;
  isSyncEnabled?: boolean;
  isCommitEnabled?: boolean;
  pushPriority?: WritePriority;
  replace?: boolean;
  listeners?:
    | CesiumNavigationBridgeListener
    | readonly CesiumNavigationBridgeListener[];
};

export type CesiumNavigationBridgeHandle = SubscribedRuntimeBridgeHandle & {
  commitCurrentSceneState: (
    reason: ViewStateNavigationCommitReason,
    options?: { replace?: boolean; force?: boolean }
  ) => boolean;
  suppressCommitsUntilInteraction: () => void;
  reduceToTopDownView: () => void;
};

export const useCesiumNavigationBridge = ({
  id,
  scene = null,
  isSyncEnabled = true,
  isCommitEnabled = true,
  pushPriority = "sync",
  replace = false,
  listeners = DEFAULT_CESIUM_NAVIGATION_BRIDGE_LISTENERS,
}: UseCesiumNavigationBridgeOptions): CesiumNavigationBridgeHandle => {
  const { commitCurrentState } = useViewStateNavigationContext();
  const { updateHashState } = useHashState();
  const releaseSuppression = useCallback(() => {
    suppressCommitUntilInteractionRef.current = false;
  }, []);
  const adapter = useCesiumRuntimeBridge({
    id,
    scene,
    enabled: isSyncEnabled,
    pushPriority,
    onInteraction: releaseSuppression,
  });
  const listenerSet = useMemo(
    () => normalizeCesiumNavigationBridgeListeners(listeners),
    [listeners]
  );
  const suppressCommitUntilInteractionRef = useRef(false);

  const suppressCommitsUntilInteraction = useCallback(() => {
    suppressCommitUntilInteractionRef.current = true;
  }, []);

  const commitCurrentSceneState = useCallback(
    (
      reason: ViewStateNavigationCommitReason,
      options?: { replace?: boolean; force?: boolean }
    ) => {
      if (!isCommitEnabled) {
        return false;
      }

      adapter.publishCurrentState();
      if (!options?.force && suppressCommitUntilInteractionRef.current) {
        return false;
      }

      return commitCurrentState(reason, {
        replace: options?.replace ?? replace,
        force: options?.force,
      });
    },
    [adapter, commitCurrentState, isCommitEnabled, replace]
  );

  // Handover to 2D: drop this writer's 3D-only hash keys (altitude/bearing/pitch/
  // roll/fov), leaving the shared lat/lng/zoom — a plain top-down view.
  const reduceToTopDownView = useCallback(() => {
    updateHashState(
      {},
      {
        clearStateKeys: SCENE_VIEW_STATE_THREE_D_ONLY_HASH_PARAMS,
        label: `${id}:reduceToTopDownView`,
        replace: true,
      }
    );
  }, [updateHashState, id]);

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
      suppressCommitsUntilInteraction,
      reduceToTopDownView,
    }),
    [
      adapter,
      commitCurrentSceneState,
      suppressCommitsUntilInteraction,
      reduceToTopDownView,
    ]
  );
};
