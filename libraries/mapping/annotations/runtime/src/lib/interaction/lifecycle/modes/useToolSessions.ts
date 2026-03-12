import { useMemo } from "react";
import { Cartesian3 } from "@carma/cesium";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "../annotationModeSession.types";
import { useDistanceMeasureModeSession } from "./useDistanceMeasureModeSession";
import { usePolylineModeSession } from "./usePolylineModeSession";
import { useGroundAreaModeSession } from "./useGroundAreaModeSession";
import { useVerticalAreaModeSession } from "./useVerticalAreaModeSession";
import { usePlanarAreaModeSession } from "./usePlanarAreaModeSession";

type AnnotationToolSessionState = {
  activeNodeChainAnnotationId: string | null;
  nodeChainMeasurements: readonly NodeChainAnnotation[];
};

type AnnotationToolSessionActions = {
  requestEnterToolType: (toolType: AnnotationToolType) => void;
  discardActiveMeasurementDraft: (
    activeNodeChainAnnotationId: string | null
  ) => void;
  finishActivePolylineMeasurement: () => void;
  finishActivePolygonMeasurement: () => void;
  handleNodeChainPointCreated: (id: string, positionECEF: Cartesian3) => void;
};

const buildSelectToolSession = (
  requestEnterToolType: AnnotationToolSessionActions["requestEnterToolType"]
): AnnotationModeSession => ({
  toolType: SELECT_TOOL_TYPE,
  requestStart: () => {
    requestEnterToolType(SELECT_TOOL_TYPE);
  },
  requestFinish: () => false,
  discardDraft: () => {},
});

export const useToolSessions = (
  pointMeasureModeSession: AnnotationModeSession,
  labelPlacementModeSession: AnnotationModeSession,
  {
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
  }: AnnotationToolSessionState,
  {
    requestEnterToolType,
    discardActiveMeasurementDraft,
    finishActivePolylineMeasurement,
    finishActivePolygonMeasurement,
    handleNodeChainPointCreated,
  }: AnnotationToolSessionActions
): AnnotationModeSessionMap => {
  const distanceToolSession = useDistanceMeasureModeSession(
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_DISTANCE);
    },
    finishActivePolylineMeasurement,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const polylineToolSession = usePolylineModeSession(
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_POLYLINE);
    },
    finishActivePolylineMeasurement,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const groundAreaToolSession = useGroundAreaModeSession(
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_GROUND);
    },
    finishActivePolygonMeasurement,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const verticalAreaToolSession = useVerticalAreaModeSession(
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_VERTICAL);
    },
    finishActivePolygonMeasurement,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const planarAreaToolSession = usePlanarAreaModeSession(
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_PLANAR);
    },
    finishActivePolygonMeasurement,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );

  return useMemo(
    () => ({
      [SELECT_TOOL_TYPE]: buildSelectToolSession(requestEnterToolType),
      [ANNOTATION_TYPE_POINT]: pointMeasureModeSession,
      [ANNOTATION_TYPE_LABEL]: labelPlacementModeSession,
      [ANNOTATION_TYPE_DISTANCE]: distanceToolSession,
      [ANNOTATION_TYPE_POLYLINE]: polylineToolSession,
      [ANNOTATION_TYPE_AREA_GROUND]: groundAreaToolSession,
      [ANNOTATION_TYPE_AREA_VERTICAL]: verticalAreaToolSession,
      [ANNOTATION_TYPE_AREA_PLANAR]: planarAreaToolSession,
    }),
    [
      distanceToolSession,
      groundAreaToolSession,
      labelPlacementModeSession,
      planarAreaToolSession,
      pointMeasureModeSession,
      polylineToolSession,
      requestEnterToolType,
      verticalAreaToolSession,
    ]
  );
};
