import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "../types/annotation-label";
import {
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  isAreaToolType,
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "../types/annotation-types";
export const PURE_LABEL_DEFAULT_FONT_SIZE_PX = 12;
export const PURE_LABEL_DEFAULT_BACKGROUND_COLOR = "rgba(200, 200, 200, 0.7)";
export const PURE_LABEL_DEFAULT_TEXT_COLOR = "#000000";
export const PURE_LABEL_DEFAULTS = {
  fontSizePx: PURE_LABEL_DEFAULT_FONT_SIZE_PX,
  backgroundColor: PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
  textColor: PURE_LABEL_DEFAULT_TEXT_COLOR,
} as const;

export type ActivePointCreateConfig = {
  mode:
    | "point-measure"
    | "label-placement"
    | "distance-measure"
    | "node-chain-measure";
  createdPointType:
    | typeof ANNOTATION_TYPE_POINT
    | typeof ANNOTATION_TYPE_DISTANCE;
  preferGlobeAnchorForVerticalOffset: boolean;
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
      mode: "point-measure",
      createdPointType: ANNOTATION_TYPE_POINT,
      preferGlobeAnchorForVerticalOffset: true,
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
      mode: "label-placement",
      createdPointType: ANNOTATION_TYPE_POINT,
      preferGlobeAnchorForVerticalOffset: false,
      temporaryMode: false,
      verticalOffsetMeters: 0,
      nameOnCreate: lastCustomPointAnnotationName,
      labelOnCreate: "none" as const,
      hiddenOnCreate: false,
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
      mode: "distance-measure",
      createdPointType: ANNOTATION_TYPE_DISTANCE,
      preferGlobeAnchorForVerticalOffset: false,
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
    isAreaToolType(activeToolType)
  ) {
    return {
      mode: "node-chain-measure",
      createdPointType: ANNOTATION_TYPE_DISTANCE,
      preferGlobeAnchorForVerticalOffset: false,
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
