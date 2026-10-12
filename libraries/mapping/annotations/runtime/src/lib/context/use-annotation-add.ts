import { useCallback, type MutableRefObject } from "react";

import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import type { AnnotationEngine } from "../engine";
import type { AnnotationToolRegistry } from "../registry";
import {
  appendAnnotationEntities,
  buildMeasurementEntities,
  type AddAnnotationOptions,
  type AnnotationGeographicCoordinate,
  type AnnotationNodeLinkId,
  type AnnotationsStore,
  type StoredAnnotation,
} from "../store";
import { resolveAnnotationAddOptions } from "./annotation-add-options";

export type AddAnnotation = (
  toolType: StoredAnnotation["toolType"],
  coordinates: readonly AnnotationGeographicCoordinate[],
  options?: AddAnnotationOptions,
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
  sourceToolId?: AnnotationToolId
) => StoredAnnotation;

type UseAnnotationAddOptions = {
  engine: AnnotationEngine | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  measurementSequenceRef: MutableRefObject<number>;
  nodeSequenceRef: MutableRefObject<number>;
  edgeSequenceRef: MutableRefObject<number>;
};

export const useAnnotationAdd = ({
  engine,
  registry,
  annotationsStore,
  measurementSequenceRef,
  nodeSequenceRef,
  edgeSequenceRef,
}: UseAnnotationAddOptions) =>
  useCallback<AddAnnotation>(
    (toolType, coordinates, options, linkedNodeGroupIds, sourceToolId) => {
      const { annotationEntry, nodes, linkedNodeGroups, edges } =
        buildMeasurementEntities({
          toolType,
          coordinates,
          options: resolveAnnotationAddOptions({
            registry,
            engine,
            annotationEntries: annotationsStore.getState().annotationEntries,
            toolType,
            coordinates,
            options,
            linkedNodeGroupIds,
            sourceToolId,
          }),
          linkedNodeGroupIds,
          measurementSequenceRef,
          nodeSequenceRef,
          edgeSequenceRef,
        });

      annotationsStore.dispatch(
        appendAnnotationEntities({
          annotationEntry,
          nodes,
          linkedNodeGroups,
          edges,
          selectAnnotationId: annotationEntry.id,
        })
      );
      return annotationEntry;
    },
    [
      annotationsStore,
      registry,
      engine,
      measurementSequenceRef,
      nodeSequenceRef,
      edgeSequenceRef,
    ]
  );
