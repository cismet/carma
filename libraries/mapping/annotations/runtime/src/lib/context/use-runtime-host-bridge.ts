import {
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import {
  setAnnotationToolType,
  setSelectedAnnotationId,
  type AnnotationGeographicCoordinate,
  type AnnotationsStore,
} from "../store";
import {
  NOOP_RUNTIME_LIFECYCLE_HOST_API,
  type RuntimeLifecycleHostApi,
} from "./lifecycle-host-api";

type UseRuntimeHostBridgeOptions = {
  annotationsStore: AnnotationsStore;
  setActiveEditedNodeId: Dispatch<SetStateAction<string | null>>;
};

/**
 * Wires the services to the authoring host: the lifecycle API it binds, the
 * preview-snap click handler of the visual host and the hovered point-query
 * node both hosts share.
 */
export const useRuntimeHostBridge = ({
  annotationsStore,
  setActiveEditedNodeId,
}: UseRuntimeHostBridgeOptions) => {
  const lifecycleHostApiRef = useRef<RuntimeLifecycleHostApi>(
    NOOP_RUNTIME_LIFECYCLE_HOST_API
  );
  const previewSnapTargetNodeClickRef = useRef<(nodeId: string) => boolean>(
    () => false
  );
  const hoveredPointQueryNodeIdRef = useRef<string | null>(null);

  // Single funnel for every tool change (direct, mode lifecycle, keyboard
  // cancel). A mode change resets the focus, so the info box falls back to the
  // new mode's own instruction instead of still showing the previously focused
  // measurement. The edit gizmo closes with the selection (deselect effect in
  // usePointEditingGizmo). Re-selecting the active tool is a no-op, so leaving
  // edit mode with Escape keeps the measurement selected.
  const setActiveToolTypeInStore = useCallback(
    (toolType: AnnotationToolId) => {
      const previousToolType = annotationsStore.getState().annotationToolType;
      annotationsStore.dispatch(setAnnotationToolType(toolType));
      if (previousToolType === toolType) {
        return;
      }

      setActiveEditedNodeId(null);
      annotationsStore.dispatch(setSelectedAnnotationId(null));
    },
    [annotationsStore, setActiveEditedNodeId]
  );

  const setActiveToolType = useCallback(
    (toolType: AnnotationToolId) => {
      if (lifecycleHostApiRef.current === NOOP_RUNTIME_LIFECYCLE_HOST_API) {
        setActiveToolTypeInStore(toolType);
        return;
      }

      lifecycleHostApiRef.current.requestModeChange(toolType);
    },
    [setActiveToolTypeInStore]
  );

  const bindLifecycleHostApi = useCallback((api: RuntimeLifecycleHostApi) => {
    lifecycleHostApiRef.current = api;
  }, []);
  const lifecycleRequests = useMemo<RuntimeLifecycleHostApi>(
    () => ({
      requestModeChange: (toolType) =>
        lifecycleHostApiRef.current.requestModeChange(toolType),
      requestActivateTool: (toolType) =>
        lifecycleHostApiRef.current.requestActivateTool(toolType),
      requestFinishMeasurement: () =>
        lifecycleHostApiRef.current.requestFinishMeasurement(),
      requestPointAt: (coordinate: AnnotationGeographicCoordinate) =>
        lifecycleHostApiRef.current.requestPointAt(coordinate),
    }),
    []
  );

  const bindPreviewSnapTargetNodeClick = useCallback(
    (handler: (nodeId: string) => boolean) => {
      previewSnapTargetNodeClickRef.current = handler;
      return () => {
        if (previewSnapTargetNodeClickRef.current === handler) {
          previewSnapTargetNodeClickRef.current = () => false;
        }
      };
    },
    []
  );
  const handlePreviewSnapTargetNodeClick = useCallback(
    (nodeId: string) => previewSnapTargetNodeClickRef.current(nodeId),
    []
  );

  const setHoveredPointQueryNodeId = useCallback((nodeId: string | null) => {
    hoveredPointQueryNodeIdRef.current = nodeId;
  }, []);
  const getHoveredPointQueryNodeId = useCallback(
    () => hoveredPointQueryNodeIdRef.current,
    []
  );

  return {
    setActiveToolTypeInStore,
    setActiveToolType,
    bindLifecycleHostApi,
    lifecycleRequests,
    bindPreviewSnapTargetNodeClick,
    handlePreviewSnapTargetNodeClick,
    setHoveredPointQueryNodeId,
    getHoveredPointQueryNodeId,
  };
};
