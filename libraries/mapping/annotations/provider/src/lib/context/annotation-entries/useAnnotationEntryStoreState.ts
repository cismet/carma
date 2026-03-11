import { useCallback, type Dispatch, type SetStateAction } from "react";

import { Cartesian3 } from "@carma/cesium";
import { useStoreSelector } from "@carma-commons/react-store";
import type {
  AnnotationCollection,
  NodeChainAnnotation,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type { AnnotationsStore } from "../store";

const resolveSetStateAction = <TValue>(
  action: SetStateAction<TValue>,
  previousValue: TValue
): TValue =>
  typeof action === "function"
    ? (action as (previousValue: TValue) => TValue)(previousValue)
    : action;

export const useAnnotationEntryStoreState = (
  annotationsStore: AnnotationsStore
) => {
  const annotations = useStoreSelector(
    annotationsStore,
    (state) => state.annotationEntries
  );
  const distanceRelations = useStoreSelector(
    annotationsStore,
    (state) => state.distanceRelations
  );
  const nodeChainAnnotations = useStoreSelector(
    annotationsStore,
    (state) => state.nodeChainAnnotations
  );
  const referencePoint = useStoreSelector(
    annotationsStore,
    (state) => state.referencePoint
  );
  const annotationToolType = useStoreSelector(
    annotationsStore,
    (state) => state.annotationToolType
  );
  const showLabels = useStoreSelector(
    annotationsStore,
    (state) => state.showLabels
  );
  const occlusionChecksEnabled = useStoreSelector(
    annotationsStore,
    (state) => state.occlusionChecksEnabled
  );

  const setAnnotations = useCallback<
    Dispatch<SetStateAction<AnnotationCollection>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextAnnotations = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.annotationEntries
        );

        return Object.is(nextAnnotations, previousStoreState.annotationEntries)
          ? previousStoreState
          : {
              ...previousStoreState,
              annotationEntries: nextAnnotations,
            };
      });
    },
    [annotationsStore]
  );

  const setDistanceRelations = useCallback<
    Dispatch<SetStateAction<PointDistanceRelation[]>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextDistanceRelations = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.distanceRelations
        );

        return Object.is(
          nextDistanceRelations,
          previousStoreState.distanceRelations
        )
          ? previousStoreState
          : {
              ...previousStoreState,
              distanceRelations: nextDistanceRelations,
            };
      });
    },
    [annotationsStore]
  );

  const setNodeChainAnnotations = useCallback<
    Dispatch<SetStateAction<NodeChainAnnotation[]>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextNodeChainAnnotations = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.nodeChainAnnotations
        );

        return Object.is(
          nextNodeChainAnnotations,
          previousStoreState.nodeChainAnnotations
        )
          ? previousStoreState
          : {
              ...previousStoreState,
              nodeChainAnnotations: nextNodeChainAnnotations,
            };
      });
    },
    [annotationsStore]
  );

  const setReferencePoint = useCallback<
    Dispatch<SetStateAction<Cartesian3 | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextReferencePoint = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.referencePoint
        );

        return Object.is(nextReferencePoint, previousStoreState.referencePoint)
          ? previousStoreState
          : {
              ...previousStoreState,
              referencePoint: nextReferencePoint,
            };
      });
    },
    [annotationsStore]
  );

  return {
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    referencePoint,
    annotationToolType,
    showLabels,
    occlusionChecksEnabled,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    setReferencePoint,
  };
};

export type AnnotationEntryStoreState = ReturnType<
  typeof useAnnotationEntryStoreState
>;
