import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react";
import { HASH_CLEAR_KEY_SET, useHashState } from "@carma-providers/hash-state";
import {
  type HashZoomConvention,
  readViewStateFromSceneState,
} from "@carma-mapping/engines-interop/view-sync";
import { createCesiumSceneStateHashSyncController } from "./createCesiumSceneStateHashSyncController";
import { createCesiumViewStateHashCodec } from "./createCesiumViewStateHashCodec";
import { useCesiumSceneStateStoreOptional } from "./useCesiumSceneState";
import type { SceneLike, SceneState } from "./types";

const toUniqueKeys = (keys: readonly string[]): string[] =>
  Array.from(new Set(keys.filter((key) => key.length > 0)));

export type CesiumSceneStateHashSyncProps = {
  enabled?: boolean;
  scene?: SceneLike | null;
  extraHashParams?: Record<string, unknown>;
  clearKeys?: string[];
  replace?: boolean;
  label?: string;
  minUpdateIntervalMs?: number;
  defaultFovDeg?: number;
  zoomConvention?: HashZoomConvention;
  minEnabledDurationMs?: number;
  minStableSamples?: number;
};

export type CesiumSceneStateHashSyncHandle = {
  publishNow: () => boolean;
};

export const CesiumSceneStateHashSync = forwardRef<
  CesiumSceneStateHashSyncHandle,
  CesiumSceneStateHashSyncProps
>(function CesiumSceneStateHashSync(
  {
    enabled = true,
    scene = null,
    extraHashParams,
    clearKeys,
    replace = true,
    label = "SceneState:camera",
    minUpdateIntervalMs = 100,
    defaultFovDeg,
    zoomConvention,
    minEnabledDurationMs = 350,
    minStableSamples = 3,
  }: CesiumSceneStateHashSyncProps,
  ref
) {
  const store = useCesiumSceneStateStoreOptional();
  const { updateHash } = useHashState();

  const resolvedClearKeys = useMemo(
    () =>
      toUniqueKeys([
        ...Object.keys(extraHashParams ?? {}),
        ...(clearKeys ?? []),
      ]),
    [clearKeys, extraHashParams]
  );

  const writeCameraHash = useCallback(
    (params: Record<string, unknown>, replaceHash: boolean) => {
      updateHash(params, {
        clearKeySetIds: [HASH_CLEAR_KEY_SET.SCENE_VIEW_STATE],
        clearKeys: resolvedClearKeys,
        label,
        replace: replaceHash,
      });
    },
    [label, resolvedClearKeys, updateHash]
  );

  const codec = useMemo(
    () =>
      createCesiumViewStateHashCodec({
        ...(Number.isFinite(defaultFovDeg) ? { defaultFovDeg } : {}),
        ...(zoomConvention ? { zoomConvention } : {}),
      }),
    [defaultFovDeg, zoomConvention]
  );

  const readHashParams = useCallback(
    (sceneState: SceneState | null | undefined) => {
      const viewState = readViewStateFromSceneState(
        sceneState as unknown as Parameters<
          typeof readViewStateFromSceneState
        >[0],
        scene as unknown as Parameters<typeof readViewStateFromSceneState>[1]
      );
      if (!viewState) {
        return null;
      }

      return {
        ...(codec.encode(viewState) ?? {}),
        ...(extraHashParams ?? {}),
      };
    },
    [codec, extraHashParams, scene]
  );

  const controller = useMemo(
    () =>
      createCesiumSceneStateHashSyncController({
        replace,
        minUpdateIntervalMs,
        minEnabledDurationMs,
        minStableSamples,
        readHashParams,
        writeCameraHash,
      }),
    [
      minEnabledDurationMs,
      minStableSamples,
      minUpdateIntervalMs,
      readHashParams,
      replace,
      writeCameraHash,
    ]
  );

  useEffect(() => {
    controller.reset();
  }, [controller, enabled]);

  useEffect(() => {
    if (!enabled || !store) {
      return;
    }

    const syncPendingHash = () => {
      controller.onSceneStateChange(store.getSnapshot());
    };

    syncPendingHash();
    return store.subscribe(syncPendingHash);
  }, [controller, enabled, store]);

  const publishNow = useCallback(() => {
    if (!store) {
      return false;
    }

    return controller.publishSceneState(
      store.refresh() ?? store.getSnapshot(),
      {
        force: true,
      }
    );
  }, [controller, store]);

  useImperativeHandle(
    ref,
    () => ({
      publishNow,
    }),
    [publishNow]
  );

  useEffect(() => {
    if (!enabled || !store) {
      return;
    }

    const removeListeners: Array<() => void> = [];
    const onInteractionSettled = () => {
      controller.flushPendingHash(store.refresh() ?? store.getSnapshot());
    };

    const moveEnd = scene?.camera?.moveEnd;
    if (moveEnd) {
      moveEnd.addEventListener(onInteractionSettled);
      removeListeners.push(() => {
        moveEnd.removeEventListener(onInteractionSettled);
      });
    }

    const morphComplete = scene?.morphComplete;
    if (morphComplete) {
      morphComplete.addEventListener(onInteractionSettled);
      removeListeners.push(() => {
        morphComplete.removeEventListener(onInteractionSettled);
      });
    }

    return () => {
      removeListeners.forEach((removeListener) => removeListener());
    };
  }, [
    controller,
    enabled,
    scene?.camera?.moveEnd,
    scene?.morphComplete,
    store,
  ]);

  return null;
});
