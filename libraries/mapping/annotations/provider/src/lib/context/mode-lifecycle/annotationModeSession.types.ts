import type { AnnotationToolType } from "@carma-mapping/annotations/core";

export type AnnotationModeSession = {
  toolType: AnnotationToolType;
  hasActiveDraft: () => boolean;
  requestStart: () => void;
  requestClose: () => void;
  discardDraft: () => void;
};

export type AnnotationModeSessionMap = Partial<
  Record<AnnotationToolType, AnnotationModeSession>
>;
