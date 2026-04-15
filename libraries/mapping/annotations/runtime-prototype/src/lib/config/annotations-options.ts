import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type {
  AnnotationPersistenceEnvelope,
  AnnotationToolType,
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
import type { PointLabelLayoutConfigOverrides } from "@carma-providers/label-overlay";
const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;

export type AnnotationsOptions = {
  distance?: {
    stickyToFirstPoint?: boolean;
    creationLineVisibility?: Partial<Record<ReferenceLineLabelKind, boolean>>;
    defaultLabelVisibilityByKind?: DistanceRelationLabelVisibilityByKind;
    defaultDirectLineLabelMode?: DirectLineLabelMode;
  };
  pointQueries?: {
    enabled?: boolean;
    radius?: number;
    verticalOffsetMeters?: number;
    heightOffset?: number;
    temporaryMode?: boolean;
  };
  cartographicCRS?: "string";
  initialToolType?: AnnotationToolType;
  initialPersistenceState?: AnnotationPersistenceEnvelope | null;
  onPersistenceStateChange?: (state: AnnotationPersistenceEnvelope) => void;
  labels?: PointLabelLayoutConfigOverrides;
  moveGizmo?: {
    markerSizeScale?: number;
    labelDistanceScale?: number;
  };
};

export const defaultOptions: AnnotationsOptions = {
  initialToolType: ANNOTATION_TYPE_POINT,
};

export const defaultPointQueryOptions: NonNullable<
  AnnotationsOptions["pointQueries"]
> = {
  enabled: true,
  radius: 1,
  verticalOffsetMeters: 0,
  heightOffset: 1.5,
  temporaryMode: false,
};

export const defaultMoveGizmoOptions: NonNullable<
  AnnotationsOptions["moveGizmo"]
> = {
  markerSizeScale: 1,
  labelDistanceScale: 1,
};
