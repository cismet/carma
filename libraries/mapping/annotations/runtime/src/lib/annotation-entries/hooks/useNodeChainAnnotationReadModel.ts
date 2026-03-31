import { useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  buildDerivedPolylinePaths,
  type DerivedPolylinePath,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import { useAnnotationsStore, useStoreSelector } from "../../store";
export const useNodeChainAnnotations = (): NodeChainAnnotation[] => {
  const annotationsStore = useAnnotationsStore("useNodeChainAnnotations");

  return useStoreSelector(
    annotationsStore,
    (state) => state.nodeChainAnnotations
  );
};

export type AnnotationNodeChainReadModel = {
  nodeChainAnnotations: NodeChainAnnotation[];
  polylineAnnotations: NodeChainAnnotation[];
  groundPolygons: NodeChainAnnotation[];
  planarPolygons: NodeChainAnnotation[];
  verticalPolygons: NodeChainAnnotation[];
  polylinePaths: DerivedPolylinePath[];
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
};

export const useNodeChainAnnotationReadModel =
  (): AnnotationNodeChainReadModel => {
    const annotationsStore = useAnnotationsStore(
      "useNodeChainAnnotationReadModel"
    );
    const nodeChainAnnotations = useStoreSelector(
      annotationsStore,
      (state) => state.nodeChainAnnotations
    );
    const activeNodeChainAnnotationId = useStoreSelector(
      annotationsStore,
      (state) => state.activeNodeChainAnnotationId
    );
    const annotationEntries = useStoreSelector(
      annotationsStore,
      (state) => state.annotationEntries
    );
    const selectedAnnotationIds = useStoreSelector(
      annotationsStore,
      (state) => state.selectionState.selectedAnnotationIds
    );
    const defaultPolylineVerticalOffsetMeters = useStoreSelector(
      annotationsStore,
      (state) => state.settingsState.polyline.defaultVerticalOffsetMeters
    );

    const nodeChainAnnotationsByType = useMemo(() => {
      const byType = new Map<string, NodeChainAnnotation[]>();
      byType.set(ANNOTATION_TYPE_POLYLINE, []);
      byType.set(ANNOTATION_TYPE_AREA_GROUND, []);
      byType.set(ANNOTATION_TYPE_AREA_PLANAR, []);
      byType.set(ANNOTATION_TYPE_AREA_VERTICAL, []);

      nodeChainAnnotations.forEach((measurement) => {
        const typedBucket = byType.get(measurement.type);
        if (typedBucket) {
          typedBucket.push(measurement);
        }
      });

      return byType;
    }, [nodeChainAnnotations]);
    const polylinePaths = useMemo(
      () =>
        buildDerivedPolylinePaths({
          annotations: annotationEntries,
          nodeChainAnnotations,
          defaultVerticalOffsetMeters: defaultPolylineVerticalOffsetMeters,
          useOffsetAnchors: true,
        }),
      [
        annotationEntries,
        defaultPolylineVerticalOffsetMeters,
        nodeChainAnnotations,
      ]
    );
    const focusedNodeChainAnnotationId = useMemo(() => {
      for (
        let index = selectedAnnotationIds.length - 1;
        index >= 0;
        index -= 1
      ) {
        const selectedAnnotationId = selectedAnnotationIds[index];
        if (!selectedAnnotationId) {
          continue;
        }

        const focusedNodeChainAnnotation =
          nodeChainAnnotations.find(
            (measurement) =>
              measurement.type !== ANNOTATION_TYPE_DISTANCE &&
              measurement.nodeIds.includes(selectedAnnotationId)
          ) ?? null;
        if (focusedNodeChainAnnotation) {
          return focusedNodeChainAnnotation.id;
        }
      }

      return activeNodeChainAnnotationId;
    }, [
      activeNodeChainAnnotationId,
      nodeChainAnnotations,
      selectedAnnotationIds,
    ]);

    return useMemo(
      () => ({
        nodeChainAnnotations,
        polylineAnnotations:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_POLYLINE) ?? [],
        groundPolygons:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_AREA_GROUND) ?? [],
        planarPolygons:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_AREA_PLANAR) ?? [],
        verticalPolygons:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_AREA_VERTICAL) ?? [],
        polylinePaths,
        focusedNodeChainAnnotationId,
        activeNodeChainAnnotationId,
      }),
      [
        activeNodeChainAnnotationId,
        focusedNodeChainAnnotationId,
        nodeChainAnnotationsByType,
        nodeChainAnnotations,
        polylinePaths,
      ]
    );
  };
