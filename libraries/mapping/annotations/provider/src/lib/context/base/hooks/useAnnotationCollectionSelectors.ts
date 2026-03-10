import { useCallback } from "react";

import type { BaseAnnotationEntry } from "@carma-mapping/annotations/core";

type AnnotationWithId = BaseAnnotationEntry;

type UseMeasurementCollectionSelectorsParams<
  TMode extends string,
  TMeasurement extends AnnotationWithId,
  TListType extends string
> = {
  annotationsByType: (type: TListType) => ReadonlyArray<TMeasurement>;
  navigationTypes: ReadonlyArray<TListType>;
};

type AnnotationCollectionSelectors<
  TMode extends string,
  TMeasurement extends AnnotationWithId,
  TListType extends string
> = {
  getAnnotationsForNavigation: () => TMeasurement[];
  getAnnotationIndexByType: (
    type: TListType,
    id: string | null | undefined
  ) => number;
  getAnnotationOrderByType: (
    type: TListType,
    id: string | null | undefined
  ) => number | null;
  getNextAnnotationOrderByType: (type: TListType) => number;
};

export const useAnnotationCollectionSelectors = <
  TMode extends string,
  TMeasurement extends AnnotationWithId,
  TListType extends string = TMode
>({
  annotationsByType,
  navigationTypes,
}: UseMeasurementCollectionSelectorsParams<
  TMode,
  TMeasurement,
  TListType
>): AnnotationCollectionSelectors<TMode, TMeasurement, TListType> => {
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
    (type: TListType, id: string | null | undefined) => {
      if (!id) return -1;
      return annotationsByType(type).findIndex(
        (measurement) => measurement.id === id
      );
    },
    [annotationsByType]
  );

  const getAnnotationOrderByType = useCallback(
    (type: TListType, id: string | null | undefined) => {
      const index = getAnnotationIndexByType(type, id);
      return index >= 0 ? index + 1 : null;
    },
    [getAnnotationIndexByType]
  );

  const getNextAnnotationOrderByType = useCallback(
    (type: TListType) => annotationsByType(type).length + 1,
    [annotationsByType]
  );

  return {
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  };
};
