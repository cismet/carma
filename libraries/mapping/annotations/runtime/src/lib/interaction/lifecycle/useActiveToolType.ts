import { useMemo } from "react";

import {
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";
export const useActiveToolType = (
  annotationToolType: AnnotationToolType,
  selectionModeActive: boolean
): AnnotationToolType =>
  useMemo(
    () => (selectionModeActive ? SELECT_TOOL_TYPE : annotationToolType),
    [annotationToolType, selectionModeActive]
  );
