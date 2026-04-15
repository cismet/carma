import { useMemo } from "react";
import {
  type AnnotationToolType,
  type NodeChainAnnotation,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "../annotation-mode-session.types";
import { useDistanceMeasureModeSession } from "./use-distance-measure-mode-session";
import { useGroundAreaModeSession } from "./use-ground-area-mode-session";
import { usePlanarAreaModeSession } from "./use-planar-area-mode-session";
import { usePolylineModeSession } from "./use-polyline-mode-session";
import { useVerticalAreaModeSession } from "./use-vertical-area-mode-session";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  SELECT: SELECT_TOOL_TYPE,
} = ANNOTATION_TOOL_TYPES;

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
