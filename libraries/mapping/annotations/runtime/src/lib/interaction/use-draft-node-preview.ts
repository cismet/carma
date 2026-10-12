import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type {
  AnnotationGeographicCoordinate,
  AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";

import { updateNodeCoordinateById, type AnnotationsStore } from "../store";
import {
  areNodeCoordinateOverridesEqual,
  EMPTY_NODE_COORDINATE_OVERRIDES,
  hasNodeCoordinateOverrides,
  type NodeCoordinateOverrides,
} from "../utils/node-coordinate-overrides";
import { POINT_EDITING_GIZMO_DEFAULTS } from "./point-editing-gizmo-defaults";

const cancelDraftFlush = (timeoutRef: MutableRefObject<number | null>) => {
  if (timeoutRef.current !== null && typeof window !== "undefined") {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
};

/**
 * The uncommitted node move of a point edit. The refs hold the latest values
 * for the pointer handlers; the React state follows them through a trailing
 * throttle, so readouts re-render at a few Hz while the pointer moves at frame
 * rate.
 */
export const useDraftNodePreview = ({
  annotationsStore,
  selectedAnnotationIds,
}: {
  annotationsStore: AnnotationsStore;
  selectedAnnotationIds: readonly string[];
}) => {
  const [draftNodeCoordinateOverrides, setDraftNodeCoordinateOverrides] =
    useState<NodeCoordinateOverrides>(EMPTY_NODE_COORDINATE_OVERRIDES);
  const [draftLinkToNodeId, setDraftLinkToNodeId] = useState<string | null>(
    null
  );
  const draftNodeCoordinateOverridesRef = useRef<NodeCoordinateOverrides>(
    EMPTY_NODE_COORDINATE_OVERRIDES
  );
  const draftLinkToNodeIdRef = useRef<string | null>(null);
  const draftFlushTimeoutRef = useRef<number | null>(null);
  const lastDraftFlushAtRef = useRef(0);
  const snappedNodeIdRef = useRef<string | null>(null);
  const draftBaseCoordinateRef = useRef<AnnotationGeographicCoordinate | null>(
    null
  );
  const draftBaseScreenPositionRef = useRef<AnnotationScreenPosition | null>(
    null
  );
  const hoveredReferenceNodeIdRef = useRef<string | null>(null);

  const flushDraftPreviewState = useCallback(() => {
    draftFlushTimeoutRef.current = null;
    lastDraftFlushAtRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
    setDraftLinkToNodeId(() => draftLinkToNodeIdRef.current);
    setDraftNodeCoordinateOverrides((currentDraftNodeCoordinateOverrides) =>
      areNodeCoordinateOverridesEqual(
        currentDraftNodeCoordinateOverrides,
        draftNodeCoordinateOverridesRef.current
      )
        ? currentDraftNodeCoordinateOverrides
        : draftNodeCoordinateOverridesRef.current
    );
  }, []);

  const scheduleDraftPreviewStateFlush = useCallback(() => {
    if (draftFlushTimeoutRef.current !== null) {
      return;
    }

    if (typeof window === "undefined") {
      flushDraftPreviewState();
      return;
    }

    // Trailing throttle: pointer moves within the interval coalesce into one flush.
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const elapsed = now - lastDraftFlushAtRef.current;
    const delay = Math.max(
      0,
      POINT_EDITING_GIZMO_DEFAULTS.draftPreviewFlushIntervalMs - elapsed
    );
    draftFlushTimeoutRef.current = window.setTimeout(
      flushDraftPreviewState,
      delay
    );
  }, [flushDraftPreviewState]);

  const updateDraftPreviewState = useCallback(
    ({
      nextDraftNodeCoordinateOverrides,
      nextDraftLinkToNodeId,
    }: {
      nextDraftNodeCoordinateOverrides: NodeCoordinateOverrides;
      nextDraftLinkToNodeId: string | null;
    }) => {
      const normalizedDraftNodeCoordinateOverrides =
        !hasNodeCoordinateOverrides(nextDraftNodeCoordinateOverrides)
          ? EMPTY_NODE_COORDINATE_OVERRIDES
          : nextDraftNodeCoordinateOverrides;
      const draftNodeCoordinateOverridesChanged =
        !areNodeCoordinateOverridesEqual(
          draftNodeCoordinateOverridesRef.current,
          normalizedDraftNodeCoordinateOverrides
        );
      const draftLinkToNodeIdChanged =
        draftLinkToNodeIdRef.current !== nextDraftLinkToNodeId;

      if (!draftNodeCoordinateOverridesChanged && !draftLinkToNodeIdChanged) {
        return;
      }

      draftNodeCoordinateOverridesRef.current =
        normalizedDraftNodeCoordinateOverrides;
      draftLinkToNodeIdRef.current = nextDraftLinkToNodeId;
      scheduleDraftPreviewStateFlush();
    },
    [scheduleDraftPreviewStateFlush]
  );

  const clearDraftNodeCoordinateOverrides = useCallback(() => {
    cancelDraftFlush(draftFlushTimeoutRef);
    draftNodeCoordinateOverridesRef.current = EMPTY_NODE_COORDINATE_OVERRIDES;
    draftLinkToNodeIdRef.current = null;
    snappedNodeIdRef.current = null;
    draftBaseCoordinateRef.current = null;
    draftBaseScreenPositionRef.current = null;
    hoveredReferenceNodeIdRef.current = null;
    setDraftLinkToNodeId(null);
    setDraftNodeCoordinateOverrides((currentDraftNodeCoordinateOverrides) =>
      !hasNodeCoordinateOverrides(currentDraftNodeCoordinateOverrides)
        ? currentDraftNodeCoordinateOverrides
        : EMPTY_NODE_COORDINATE_OVERRIDES
    );
  }, []);

  const commitDraftNodeCoordinateOverrides = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        clearDraftNodeCoordinateOverrides();
        return;
      }

      const latestDraftNodeCoordinateOverrides =
        draftNodeCoordinateOverridesRef.current;
      const coordinate =
        latestDraftNodeCoordinateOverrides[nodeId] ??
        draftNodeCoordinateOverrides[nodeId];
      if (!coordinate) {
        clearDraftNodeCoordinateOverrides();
        return;
      }

      annotationsStore.dispatch(
        updateNodeCoordinateById({
          nodeId,
          coordinate,
          movedNodeIds: Object.keys(latestDraftNodeCoordinateOverrides),
          linkToNodeId: draftLinkToNodeIdRef.current,
          selectedAnnotationIds,
        })
      );
      clearDraftNodeCoordinateOverrides();
    },
    [
      annotationsStore,
      clearDraftNodeCoordinateOverrides,
      draftNodeCoordinateOverrides,
      selectedAnnotationIds,
    ]
  );

  useEffect(() => () => cancelDraftFlush(draftFlushTimeoutRef), []);

  return {
    draftNodeCoordinateOverrides,
    draftLinkToNodeId,
    snappedNodeIdRef,
    draftBaseCoordinateRef,
    draftBaseScreenPositionRef,
    hoveredReferenceNodeIdRef,
    updateDraftPreviewState,
    clearDraftNodeCoordinateOverrides,
    commitDraftNodeCoordinateOverrides,
  };
};
