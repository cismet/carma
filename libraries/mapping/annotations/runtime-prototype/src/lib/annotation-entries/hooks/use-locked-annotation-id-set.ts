import { useMemo } from "react";

type LockableAnnotationLike = {
  id: string;
  locked?: boolean;
};

export const useLockedAnnotationIdSet = (
  annotations: readonly LockableAnnotationLike[]
) =>
  useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach((annotation) => {
      if (annotation.locked) {
        ids.add(annotation.id);
      }
    });
    return ids;
  }, [annotations]);
