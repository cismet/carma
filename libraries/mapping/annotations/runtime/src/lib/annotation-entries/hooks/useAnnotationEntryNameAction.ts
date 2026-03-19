import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AnnotationCollection } from "@carma-mapping/annotations/core";

export const useAnnotationEntryNameAction = (
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>
) =>
  useCallback(
    (id: string, name: string) => {
      const trimmedName = name.trim();
      setAnnotations((previousAnnotations) => {
        let hasChanges = false;
        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (annotation.id !== id) {
            return annotation;
          }

          const currentName = annotation.name ?? "";
          if (currentName === trimmedName) {
            return annotation;
          }

          hasChanges = true;
          return {
            ...annotation,
            name: trimmedName,
          };
        });
        return hasChanges ? nextAnnotations : previousAnnotations;
      });
    },
    [setAnnotations]
  );
