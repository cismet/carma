import { useCallback, useEffect, useRef } from "react";

import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import {
  areOverlayVisibilitySceneSnapshotsEqual,
  captureOverlayVisibilitySceneSnapshot,
  getSceneFrameKey,
  type OverlayVisibilitySceneSnapshot,
  type OverlayVisibilityState,
} from "./overlay-visibility.shared";

type OverlayStateCache<TState> = {
  frameKey: number | null;
  sceneSnapshot: OverlayVisibilitySceneSnapshot | null;
  statesById: Map<string, TState>;
};

export type OverlayStateComputeContext<TState> = {
  previousStatesById: ReadonlyMap<string, TState>;
  isCameraMoving: boolean;
};

/**
 * Per-frame cache of overlay visibility states, recomputed only when the scene
 * snapshot changes, while a live drag is active, or on the frame it settles.
 */
export const useOverlayStateCache = <TState extends OverlayVisibilityState>({
  engine,
  liveAnchors,
  updatePositions,
  computeStates,
  createEmptyState,
}: {
  engine: AnnotationEngine | null;
  liveAnchors: LiveAnnotationAnchors;
  updatePositions: () => void;
  computeStates: (
    context: OverlayStateComputeContext<TState>
  ) => Map<string, TState>;
  createEmptyState: () => TState;
}) => {
  const cacheRef = useRef<OverlayStateCache<TState>>({
    frameKey: null,
    sceneSnapshot: null,
    statesById: new Map(),
  });
  const isCameraMovingRef = useRef(false);
  const hadLiveAnchorsRef = useRef(false);

  const invalidate = useCallback((clearStates = false) => {
    cacheRef.current = {
      frameKey: null,
      sceneSnapshot: null,
      statesById: clearStates ? new Map() : cacheRef.current.statesById,
    };
  }, []);

  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) {
      isCameraMovingRef.current = false;
      return;
    }

    const removeCameraMoveListeners = engine.subscribeCameraMove({
      onMoveStart: () => {
        isCameraMovingRef.current = true;
        invalidate();
      },
      onMoveEnd: () => {
        isCameraMovingRef.current = false;
        invalidate();
        updatePositions();
        engine.requestRender();
      },
    });

    return () => {
      isCameraMovingRef.current = false;
      removeCameraMoveListeners();
    };
  }, [engine, invalidate, updatePositions]);

  const resolveState = useCallback(
    (id: string) => {
      const frameKey = getSceneFrameKey(engine);
      if (cacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot = captureOverlayVisibilitySceneSnapshot(engine);
        // Live drag anchors move the node while the camera is static (equal
        // snapshot), so force a recompute then or the overlay freezes. Also
        // force it on the settle frame (anchors just cleared) so the committed
        // position replaces the last live one without a camera move.
        const liveAnchorsActive = liveAnchors.size > 0;
        const justSettled = hadLiveAnchorsRef.current && !liveAnchorsActive;
        hadLiveAnchorsRef.current = liveAnchorsActive;
        const shouldRecomputeStates =
          liveAnchorsActive ||
          justSettled ||
          !areOverlayVisibilitySceneSnapshotsEqual(
            cacheRef.current.sceneSnapshot,
            sceneSnapshot
          );

        cacheRef.current = {
          frameKey,
          sceneSnapshot,
          statesById: shouldRecomputeStates
            ? computeStates({
                previousStatesById: cacheRef.current.statesById,
                isCameraMoving: isCameraMovingRef.current,
              })
            : cacheRef.current.statesById,
        };
      }

      return cacheRef.current.statesById.get(id) ?? createEmptyState();
    },
    [computeStates, createEmptyState, engine, liveAnchors]
  );

  const readCachedState = useCallback(
    (id: string) => cacheRef.current.statesById.get(id),
    []
  );

  return { resolveState, readCachedState, invalidate };
};
