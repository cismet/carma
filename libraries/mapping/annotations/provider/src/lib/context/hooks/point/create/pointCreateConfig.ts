import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationLabelAnchor,
  type AnnotationLabelAppearance,
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
  type PointLabelMetricMode,
} from "@carma-mapping/annotations/core";

export const PURE_LABEL_DEFAULT_FONT_SIZE_PX = 12;
export const PURE_LABEL_DEFAULT_BACKGROUND_COLOR = "rgba(200, 200, 200, 0.7)";
export const PURE_LABEL_DEFAULT_TEXT_COLOR = "#000000";

export type ActivePointCreateConfig = {
  temporaryMode: boolean;
  verticalOffsetMeters: number;
  nameOnCreate: string | undefined;
  labelOnCreate: PointLabelMetricMode | undefined;
  hiddenOnCreate: boolean;
  auxiliaryOnCreate: boolean;
  labelAnchorOnCreate?: (pointId: string) => AnnotationLabelAnchor;
  labelAppearanceOnCreate?: AnnotationLabelAppearance;
  useTemporaryForCreatedPoints: boolean;
};

type BuildActivePointCreateConfigParams = {
  activeToolType: AnnotationToolType;
  temporaryMode: boolean;
  pointVerticalOffsetMeters: number;
  lastCustomPointAnnotationName?: string;
  isPolylineCandidateMode: boolean;
  polylineVerticalOffsetMeters: number;
};

export const buildActivePointCreateConfig = ({
  activeToolType,
  temporaryMode,
  pointVerticalOffsetMeters,
  lastCustomPointAnnotationName,
  isPolylineCandidateMode,
  polylineVerticalOffsetMeters,
}: BuildActivePointCreateConfigParams): ActivePointCreateConfig | null => {
  if (activeToolType === ANNOTATION_TYPE_POINT) {
    return {
      temporaryMode,
      verticalOffsetMeters: pointVerticalOffsetMeters,
      nameOnCreate: undefined,
      labelOnCreate: "elevation" as const,
      hiddenOnCreate: false,
      auxiliaryOnCreate: false,
      labelAnchorOnCreate: (pointId: string): AnnotationLabelAnchor => ({
        anchorPointId: pointId,
        collapseToCompact: false,
      }),
      labelAppearanceOnCreate: undefined,
      useTemporaryForCreatedPoints: true,
    };
  }

  if (activeToolType === ANNOTATION_TYPE_LABEL) {
    return {
      temporaryMode: false,
      verticalOffsetMeters: 0,
      nameOnCreate: lastCustomPointAnnotationName,
      labelOnCreate: "none" as const,
      hiddenOnCreate: true,
      auxiliaryOnCreate: true,
      labelAnchorOnCreate: (pointId: string): AnnotationLabelAnchor => ({
        anchorPointId: pointId,
        collapseToCompact: false,
      }),
      labelAppearanceOnCreate: {
        fontSizePx: PURE_LABEL_DEFAULT_FONT_SIZE_PX,
        backgroundColor: PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
        textColor: PURE_LABEL_DEFAULT_TEXT_COLOR,
      },
      useTemporaryForCreatedPoints: false,
    };
  }

  if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
    return {
      temporaryMode: false,
      verticalOffsetMeters: 0,
      nameOnCreate: undefined,
      labelOnCreate: undefined,
      hiddenOnCreate: false,
      auxiliaryOnCreate: false,
      labelAnchorOnCreate: undefined,
      labelAppearanceOnCreate: undefined,
      useTemporaryForCreatedPoints: true,
    };
  }

  if (
    activeToolType === ANNOTATION_TYPE_POLYLINE ||
    activeToolType === ANNOTATION_TYPE_AREA_GROUND ||
    activeToolType === ANNOTATION_TYPE_AREA_VERTICAL ||
    activeToolType === ANNOTATION_TYPE_AREA_PLANAR
  ) {
    return {
      temporaryMode: false,
      verticalOffsetMeters: isPolylineCandidateMode
        ? polylineVerticalOffsetMeters
        : 0,
      nameOnCreate: undefined,
      labelOnCreate: undefined,
      hiddenOnCreate: false,
      auxiliaryOnCreate: false,
      labelAnchorOnCreate: (pointId: string): AnnotationLabelAnchor => ({
        anchorPointId: pointId,
        collapseToCompact: false,
      }),
      labelAppearanceOnCreate: undefined,
      useTemporaryForCreatedPoints: true,
    };
  }

  if (activeToolType === SELECT_TOOL_TYPE) {
    return null;
  }

  return null;
};
