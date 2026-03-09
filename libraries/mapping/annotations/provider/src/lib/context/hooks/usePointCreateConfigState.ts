import { type Dispatch, type SetStateAction, useEffect, useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationCollection,
  type AnnotationLabelAnchor,
  type AnnotationLabelAppearance,
  type AnnotationMode,
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
  markCreatedPointsAsDistanceAdhoc: boolean;
};

type BuildActivePointCreateConfigParams = {
  annotationMode: AnnotationMode;
  isPointMeasureCreateModeActive: boolean;
  isPointMeasureLabelModeActive: boolean;
  temporaryMode: boolean;
  pointVerticalOffsetMeters: number;
  lastCustomLabelOnCreate?: string;
  isPolylineCandidateMode: boolean;
  polylineVerticalOffsetMeters: number;
};

const buildActivePointCreateConfig = ({
  annotationMode,
  isPointMeasureCreateModeActive,
  isPointMeasureLabelModeActive,
  temporaryMode,
  pointVerticalOffsetMeters,
  lastCustomLabelOnCreate,
  isPolylineCandidateMode,
  polylineVerticalOffsetMeters,
}: BuildActivePointCreateConfigParams): ActivePointCreateConfig | null => {
  if (annotationMode === ANNOTATION_TYPE_POINT) {
    return {
      temporaryMode: isPointMeasureCreateModeActive ? temporaryMode : false,
      verticalOffsetMeters: isPointMeasureCreateModeActive
        ? pointVerticalOffsetMeters
        : 0,
      nameOnCreate: isPointMeasureLabelModeActive
        ? lastCustomLabelOnCreate
        : undefined,
      labelOnCreate: isPointMeasureLabelModeActive
        ? ("none" as const)
        : ("elevation" as const),
      hiddenOnCreate: isPointMeasureLabelModeActive,
      auxiliaryOnCreate: isPointMeasureLabelModeActive,
      labelAnchorOnCreate: (pointId: string): AnnotationLabelAnchor => ({
        anchorPointId: pointId,
        collapseToCompact: false,
      }),
      labelAppearanceOnCreate: isPointMeasureLabelModeActive
        ? {
            fontSizePx: PURE_LABEL_DEFAULT_FONT_SIZE_PX,
            backgroundColor: PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
            textColor: PURE_LABEL_DEFAULT_TEXT_COLOR,
          }
        : undefined,
      useTemporaryForCreatedPoints: isPointMeasureCreateModeActive,
      markCreatedPointsAsDistanceAdhoc: false,
    };
  }

  if (annotationMode === ANNOTATION_TYPE_DISTANCE) {
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
      markCreatedPointsAsDistanceAdhoc: true,
    };
  }

  if (annotationMode === ANNOTATION_TYPE_POLYLINE) {
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
      markCreatedPointsAsDistanceAdhoc: false,
    };
  }

  return null;
};

type UsePointCreateConfigStateParams = {
  annotationMode: AnnotationMode;
  pointLabelOnCreate: boolean;
  labelInputPromptPointId: string | null;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
  annotations: AnnotationCollection;
  temporaryMode: boolean;
  pointVerticalOffsetMeters: number;
  lastCustomLabelOnCreate?: string;
  isPolylineCandidateMode: boolean;
  polylineVerticalOffsetMeters: number;
};

type UsePointCreateConfigStateResult = {
  isPointMeasureLabelModeActive: boolean;
  isPointMeasureLabelInputPending: boolean;
  isPointMeasureCreateModeActive: boolean;
  pointQueryToolActive: boolean;
  activePointCreateConfig: ActivePointCreateConfig | null;
};

export const usePointCreateConfigState = ({
  annotationMode,
  pointLabelOnCreate,
  labelInputPromptPointId,
  setLabelInputPromptPointId,
  annotations,
  temporaryMode,
  pointVerticalOffsetMeters,
  lastCustomLabelOnCreate,
  isPolylineCandidateMode,
  polylineVerticalOffsetMeters,
}: UsePointCreateConfigStateParams): UsePointCreateConfigStateResult => {
  const isPointMeasureLabelModeActive =
    pointLabelOnCreate && annotationMode === ANNOTATION_TYPE_POINT;
  const isPointMeasureLabelInputPending =
    isPointMeasureLabelModeActive && labelInputPromptPointId !== null;
  const isPointMeasureCreateModeActive =
    !pointLabelOnCreate && annotationMode === ANNOTATION_TYPE_POINT;
  const pointQueryToolActive =
    !isPointMeasureLabelInputPending &&
    (annotationMode === ANNOTATION_TYPE_DISTANCE ||
      annotationMode === ANNOTATION_TYPE_POLYLINE ||
      annotationMode === ANNOTATION_TYPE_POINT);

  const activePointCreateConfig = useMemo(
    () =>
      buildActivePointCreateConfig({
        annotationMode,
        isPointMeasureCreateModeActive,
        isPointMeasureLabelModeActive,
        temporaryMode,
        pointVerticalOffsetMeters,
        lastCustomLabelOnCreate,
        isPolylineCandidateMode,
        polylineVerticalOffsetMeters,
      }),
    [
      annotationMode,
      isPointMeasureCreateModeActive,
      isPointMeasureLabelModeActive,
      temporaryMode,
      pointVerticalOffsetMeters,
      lastCustomLabelOnCreate,
      isPolylineCandidateMode,
      polylineVerticalOffsetMeters,
    ]
  );

  useEffect(() => {
    if (annotationMode !== ANNOTATION_TYPE_POINT) {
      setLabelInputPromptPointId(null);
      return;
    }
    if (!pointLabelOnCreate) {
      setLabelInputPromptPointId(null);
    }
  }, [annotationMode, pointLabelOnCreate, setLabelInputPromptPointId]);

  useEffect(() => {
    if (!labelInputPromptPointId) return;
    const hasPromptMeasurement = annotations.some(
      (measurement) => measurement.id === labelInputPromptPointId
    );
    if (!hasPromptMeasurement) {
      setLabelInputPromptPointId(null);
    }
  }, [labelInputPromptPointId, annotations, setLabelInputPromptPointId]);

  return {
    isPointMeasureLabelModeActive,
    isPointMeasureLabelInputPending,
    isPointMeasureCreateModeActive,
    pointQueryToolActive,
    activePointCreateConfig,
  };
};
