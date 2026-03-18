import { useCallback, useEffect, useMemo, useRef } from "react";
import { HASH_CLEAR_KEY_SET, useHashState } from "@carma-providers/hash-state";
import {
  readHashParamsFromSceneViewState,
  readSceneViewStateFromSceneState,
} from "@carma-mapping/engines-interop";

import { useCesiumSceneStateOptional } from "./useCesiumSceneState";

const toUniqueKeys = (keys: readonly string[]): string[] =>
  Array.from(new Set(keys.filter((key) => key.length > 0)));

const nowMs = (): number => Date.now();

export type CesiumSceneStateHashSyncProps = {
  enabled?: boolean;
  extraHashParams?: Record<string, unknown>;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  fallbackHeightM?: number;
  minUpdateIntervalMs?: number;
};

export const CesiumSceneStateHashSync = ({
  enabled = true,
  extraHashParams,
  clearKeys,
  replace = true,
  label = "SceneState:camera",
  fallbackHeightM = 200,
  minUpdateIntervalMs = 100,
}: CesiumSceneStateHashSyncProps) => {
  const sceneState = useCesiumSceneStateOptional();
  const { updateHash } = useHashState();
  const lastUpdateTsRef = useRef<number>(0);

  const resolvedClearKeys = useMemo(
    () =>
      toUniqueKeys([
        ...Object.keys(extraHashParams ?? {}),
        ...(clearKeys ?? []),
      ]),
    [clearKeys, extraHashParams]
  );

  const writeCameraHash = useCallback(
    (replaceHash: boolean) => {
      const viewStateFromSceneState = readSceneViewStateFromSceneState(
        sceneState,
        {
          fallbackHeightM,
        }
      );

      const viewState = viewStateFromSceneState;
      if (!viewState) {
        return;
      }

      const params: Record<string, unknown> = {
        ...(readHashParamsFromSceneViewState(viewState) ?? {}),
        ...(extraHashParams ?? {}),
      };

      updateHash(params, {
        clearKeySetIds: [HASH_CLEAR_KEY_SET.SCENE_VIEW_STATE],
        clearKeys: resolvedClearKeys,
        label,
        replace: replaceHash,
      });
    },
    [
      extraHashParams,
      fallbackHeightM,
      label,
      resolvedClearKeys,
      sceneState,
      updateHash,
    ]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!sceneState) {
      return;
    }

    const now = nowMs();
    if (now - lastUpdateTsRef.current < minUpdateIntervalMs) {
      return;
    }
    lastUpdateTsRef.current = now;
    writeCameraHash(replace);
  }, [enabled, minUpdateIntervalMs, replace, sceneState, writeCameraHash]);

  return null;
};
