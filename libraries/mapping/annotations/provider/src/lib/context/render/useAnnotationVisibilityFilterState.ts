import { useState } from "react";

import type { AnnotationMode } from "@carma-mapping/annotations/core";

export const useAnnotationVisibilityFilterState = () => {
  const [hideAnnotationsOfType, setHideAnnotationsOfType] = useState<
    Set<AnnotationMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<Set<AnnotationMode>>(
    new Set()
  );

  return {
    hideAnnotationsOfType,
    setHideAnnotationsOfType,
    hideLabelsOfType,
    setHideLabelsOfType,
  };
};
