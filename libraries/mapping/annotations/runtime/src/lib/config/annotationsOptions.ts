import { ANNOTATION_TYPE_POINT } from "@carma-mapping/annotations/core";
import type {
  AnnotationPersistenceEnvelopeV2,
  AnnotationToolType,
  DirectLineLabelMode,
  DistanceRelationLabelVisibilityByKind,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
import type { PointLabelLayoutConfigOverrides } from "@carma-providers/label-overlay";

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
  initialPersistenceState?: AnnotationPersistenceEnvelopeV2 | null;
  onPersistenceStateChange?: (state: AnnotationPersistenceEnvelopeV2) => void;
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
