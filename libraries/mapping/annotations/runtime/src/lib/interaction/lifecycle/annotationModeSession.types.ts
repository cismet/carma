import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma/cesium";

export type AnnotationModeSession = {
  toolType: AnnotationToolType;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (id: string, positionECEF: Cartesian3) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<AnnotationToolType, AnnotationModeSession>
>;
