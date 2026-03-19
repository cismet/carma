import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "./annotationLabel";

export type BaseAnnotationEntry<TMode extends string = string> = {
  id: string;
  type: TMode;
  timestamp: number;
  isCandidate?: boolean;
  index?: number;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  temporary?: boolean;
  auxiliaryLabelAnchor?: boolean;
  metadata?: unknown;
  derived?: unknown;
  pointLabelMode?: PointLabelMetricMode;
  labelAnchor?: AnnotationLabelAnchor;
  labelAppearance?: AnnotationLabelAppearance;
};
