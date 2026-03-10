import { useEffect, useState } from "react";

import {
  ANNOTATION_TYPE_POINT,
  getLastCustomPointAnnotationName,
  type AnnotationCollection,
  type AnnotationMode,
} from "@carma-mapping/annotations/core";

type AnnotationCreateDefaultsState = Partial<Record<AnnotationMode, string>>;

const buildInitialAnnotationCreateDefaults = (
  annotations: AnnotationCollection
): AnnotationCreateDefaultsState => {
  const lastCustomPointAnnotationName =
    getLastCustomPointAnnotationName(annotations);

  return lastCustomPointAnnotationName
    ? {
        [ANNOTATION_TYPE_POINT]: lastCustomPointAnnotationName,
      }
    : {};
};

export const useAnnotationCreateDefaults = (
  annotations: AnnotationCollection
) => {
  const [lastCustomAnnotationNameByType, setLastCustomAnnotationNameByType] =
    useState<AnnotationCreateDefaultsState>(() =>
      buildInitialAnnotationCreateDefaults(annotations)
    );

  const latestCustomPointAnnotationName =
    getLastCustomPointAnnotationName(annotations);

  useEffect(
    function effectStoreLastCustomPointAnnotationName() {
      if (!latestCustomPointAnnotationName) {
        return;
      }

      setLastCustomAnnotationNameByType((previousDefaults) =>
        previousDefaults[ANNOTATION_TYPE_POINT] ===
        latestCustomPointAnnotationName
          ? previousDefaults
          : {
              ...previousDefaults,
              [ANNOTATION_TYPE_POINT]: latestCustomPointAnnotationName,
            }
      );
    },
    [latestCustomPointAnnotationName]
  );

  return {
    lastCustomAnnotationNameByType,
    lastCustomPointAnnotationName:
      lastCustomAnnotationNameByType[ANNOTATION_TYPE_POINT],
  } as const;
};
