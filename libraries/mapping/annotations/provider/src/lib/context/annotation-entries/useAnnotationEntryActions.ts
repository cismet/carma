import { useCallback, type Dispatch, type SetStateAction } from "react";

import type {
  AnnotationCollection,
  AnnotationEntry,
} from "@carma-mapping/annotations/core";

import type { AnnotationCreatePayload } from "./annotationCreatePayload";

type UseAnnotationEntryActionsParams = {
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
};

export const useAnnotationEntryActions = ({
  setAnnotations,
}: UseAnnotationEntryActionsParams) => {
  const addAnnotation = useCallback(
    (payload: AnnotationCreatePayload<AnnotationEntry>): string => {
      const generatedId =
        payload.id?.trim() ||
        `${payload.type}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
      const nextMeasurement: AnnotationEntry = {
        ...payload,
        id: generatedId,
        timestamp: payload.timestamp ?? Date.now(),
      };
      setAnnotations((prev) => [...prev, nextMeasurement]);
      return generatedId;
    },
    [setAnnotations]
  );

  const updateAnnotationById = useCallback(
    (id: string, patch: Partial<AnnotationEntry>) => {
      if (!id) return;
      setAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (measurement.id !== id) return measurement;
          hasChanged = true;
          return {
            ...measurement,
            ...patch,
            id: measurement.id,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  return {
    addAnnotation,
    updateAnnotationById,
  };
};
