import { useMemo } from "react";

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
  type PlanarMeasurementGroup,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "./annotationModeSession.types";
import { useDistanceMeasureModeSession } from "./modes/useDistanceMeasureModeSession";
import { usePlanarMeasureModeSession } from "./modes/usePlanarMeasureModeSession";

type AnnotationToolSessionState = {
  activePlanarMeasurementId: string | null;
  openChainPointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  selectedAnnotationId: string | null;
  distanceRelations: readonly PointDistanceRelation[];
  planarMeasurements: readonly PlanarMeasurementGroup[];
};

type AnnotationToolSessionActions = {
  requestEnterToolType: (toolType: AnnotationToolType) => void;
  discardActiveMeasurementDraft: (
    activePlanarMeasurementId: string | null
  ) => void;
  finishDistanceMeasurementSession: (selectedPointId: string | null) => void;
  finishActivePlanarPolylineGroup: () => void;
  closeActivePlanarPolygonGroup: () => void;
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
    activePlanarMeasurementId,
    openChainPointId,
    selectablePointIds,
    selectedAnnotationId,
    distanceRelations,
    planarMeasurements,
  }: AnnotationToolSessionState,
  {
    requestEnterToolType,
    discardActiveMeasurementDraft,
    finishDistanceMeasurementSession,
    finishActivePlanarPolylineGroup,
    closeActivePlanarPolygonGroup,
  }: AnnotationToolSessionActions
): AnnotationModeSessionMap => {
  const distanceToolSession = useDistanceMeasureModeSession(
    openChainPointId,
    selectablePointIds,
    selectedAnnotationId,
    distanceRelations,
    planarMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_DISTANCE);
    },
    finishDistanceMeasurementSession,
    () => {
      discardActiveMeasurementDraft(null);
    }
  );
  const polylineToolSession = usePlanarMeasureModeSession(
    ANNOTATION_TYPE_POLYLINE,
    activePlanarMeasurementId,
    planarMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_POLYLINE);
    },
    finishActivePlanarPolylineGroup,
    discardActiveMeasurementDraft
  );
  const groundAreaToolSession = usePlanarMeasureModeSession(
    ANNOTATION_TYPE_AREA_GROUND,
    activePlanarMeasurementId,
    planarMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_GROUND);
    },
    closeActivePlanarPolygonGroup,
    discardActiveMeasurementDraft
  );
  const verticalAreaToolSession = usePlanarMeasureModeSession(
    ANNOTATION_TYPE_AREA_VERTICAL,
    activePlanarMeasurementId,
    planarMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_VERTICAL);
    },
    closeActivePlanarPolygonGroup,
    discardActiveMeasurementDraft
  );
  const planarAreaToolSession = usePlanarMeasureModeSession(
    ANNOTATION_TYPE_AREA_PLANAR,
    activePlanarMeasurementId,
    planarMeasurements,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_AREA_PLANAR);
    },
    closeActivePlanarPolygonGroup,
    discardActiveMeasurementDraft
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
