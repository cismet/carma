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
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "./annotationModeSession.types";
import { useDistanceMeasureModeSession } from "./modes/useDistanceMeasureModeSession";
import { useNodeChainMeasureModeSession } from "./modes/useNodeChainMeasureModeSession";

type AnnotationToolSessionState = {
  activeNodeChainAnnotationId: string | null;
  openChainPointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  selectedAnnotationId: string | null;
  distanceRelations: readonly PointDistanceRelation[];
  nodeChainMeasurements: readonly NodeChainAnnotation[];
};

type AnnotationToolSessionActions = {
  requestEnterToolType: (toolType: AnnotationToolType) => void;
  discardActiveMeasurementDraft: (
    activeNodeChainAnnotationId: string | null
  ) => void;
  finishDistanceMeasurementSession: (selectedPointId: string | null) => void;
  finishActivePolylineAnnotation: () => void;
  closeActivePolygonAnnotation: () => void;
  handlePointMeasurePointCreated: (id: string) => void;
  handleDistancePointCreated: (id: string, positionECEF: Cartesian3) => void;
  handleNodeChainPointCreated: (id: string, positionECEF: Cartesian3) => void;
};

const buildSelectToolSession = (
  requestEnterToolType: AnnotationToolSessionActions["requestEnterToolType"]
): AnnotationModeSession => ({
  toolType: SELECT_TOOL_TYPE,
  hasActiveDraft: () => false,
  requestStart: () => {
    requestEnterToolType(SELECT_TOOL_TYPE);
  },
  requestClose: () => {},
  discardDraft: () => {},
});

export const useAnnotationToolSessions = (
  pointMeasureModeSession: AnnotationModeSession,
  labelPlacementModeSession: AnnotationModeSession,
  {
    activeNodeChainAnnotationId,
    openChainPointId,
    selectablePointIds,
    selectedAnnotationId,
    distanceRelations,
    nodeChainMeasurements,
  }: AnnotationToolSessionState,
  {
    requestEnterToolType,
    discardActiveMeasurementDraft,
    finishDistanceMeasurementSession,
    finishActivePolylineAnnotation,
    closeActivePolygonAnnotation,
    handlePointMeasurePointCreated,
    handleDistancePointCreated,
    handleNodeChainPointCreated,
  }: AnnotationToolSessionActions
): AnnotationModeSessionMap => {
  const distanceToolSession = useDistanceMeasureModeSession(
    openChainPointId,
    selectablePointIds,
    selectedAnnotationId,
    distanceRelations,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_DISTANCE);
    },
    finishDistanceMeasurementSession,
    () => {
      discardActiveMeasurementDraft(null);
    },
    handleDistancePointCreated
  );
  const polylineToolSession = useNodeChainMeasureModeSession(
    ANNOTATION_TYPE_POLYLINE,
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_POLYLINE);
    },
    finishActivePolylineAnnotation,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const groundAreaToolSession = useNodeChainMeasureModeSession(
    ANNOTATION_TYPE_AREA_GROUND,
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_GROUND);
    },
    closeActivePolygonAnnotation,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const verticalAreaToolSession = useNodeChainMeasureModeSession(
    ANNOTATION_TYPE_AREA_VERTICAL,
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_VERTICAL);
    },
    closeActivePolygonAnnotation,
    discardActiveMeasurementDraft,
    handleNodeChainPointCreated
  );
  const planarAreaToolSession = useNodeChainMeasureModeSession(
    ANNOTATION_TYPE_AREA_PLANAR,
    activeNodeChainAnnotationId,
    nodeChainMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_PLANAR);
    },
    closeActivePolygonAnnotation,
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
