import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma/cesium";

export type AnnotationModeSession = {
  toolType: AnnotationToolType;
  hasActiveDraft: () => boolean;
  requestStart: () => void;
  requestClose: () => void;
  discardDraft: () => void;
  onNodeCreated?: (id: string, positionECEF: Cartesian3) => void;
};

export type AnnotationModeSessionMap = Partial<
  Record<AnnotationToolType, AnnotationModeSession>
>;
