import { useCallback } from "react";

import type {
  AnnotationListType,
  AnnotationsContextType,
} from "../AnnotationsContext";
import type { BaseAnnotationEntry } from "../../types/annotationEntry";

type AnnotationWithId = BaseAnnotationEntry;

type UseMeasurementCollectionSelectorsParams<
  TMode extends string,
  TMeasurement extends AnnotationWithId
> = {
  annotationsByType: (
    type: AnnotationListType<TMode>
  ) => ReadonlyArray<TMeasurement>;
  navigationTypes: ReadonlyArray<AnnotationListType<TMode>>;
};

type AnnotationCollectionSelectors<
  TMode extends string,
  TMeasurement extends AnnotationWithId
> = Pick<
  AnnotationsContextType<TMode, TMeasurement>,
  | "getAnnotationsForNavigation"
  | "getAnnotationIndexByType"
  | "getAnnotationOrderByType"
  | "getNextAnnotationOrderByType"
>;

export const useAnnotationCollectionSelectors = <
  TMode extends string,
  TMeasurement extends AnnotationWithId
>({
  annotationsByType,
  navigationTypes,
}: UseMeasurementCollectionSelectorsParams<
  TMode,
  TMeasurement
>): AnnotationCollectionSelectors<TMode, TMeasurement> => {
  const getAnnotationsForNavigation = useCallback(() => {
    const seenIds = new Set<string>();
    const result: TMeasurement[] = [];

    navigationTypes.forEach((type) => {
      annotationsByType(type).forEach((measurement) => {
        if (seenIds.has(measurement.id)) return;
        seenIds.add(measurement.id);
        result.push(measurement);
      });
    });

    return result;
  }, [annotationsByType, navigationTypes]);

  const getAnnotationIndexByType = useCallback(
    (type: AnnotationListType<TMode>, id: string | null | undefined) => {
      if (!id) return -1;
      return annotationsByType(type).findIndex(
        (measurement) => measurement.id === id
      );
    },
    [annotationsByType]
  );

  const getAnnotationOrderByType = useCallback(
    (type: AnnotationListType<TMode>, id: string | null | undefined) => {
      const index = getAnnotationIndexByType(type, id);
      return index >= 0 ? index + 1 : null;
    },
    [getAnnotationIndexByType]
  );

  const getNextAnnotationOrderByType = useCallback(
    (type: AnnotationListType<TMode>) => annotationsByType(type).length + 1,
    [annotationsByType]
  );

  return {
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  };
};
