import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  withDistanceRelationEdgeId,
  buildPointGeometryRows,
  buildGeometryEdgeTable,
  buildPolygonGroupVertexTable,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationPersistenceEnvelopeV2,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

const PERSISTENCE_RESTORE_DELAY_MS = 250;

type UseAnnotationPersistenceSyncParams = {
  initialPersistenceState?: AnnotationPersistenceEnvelopeV2 | null;
  onPersistenceStateChange?: (state: AnnotationPersistenceEnvelopeV2) => void;
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
};

export const useAnnotationPersistenceSync = ({
  initialPersistenceState,
  onPersistenceStateChange,
  annotations,
  distanceRelations,
  nodeChainAnnotations,
  setAnnotations,
  setDistanceRelations,
  setNodeChainAnnotations,
}: UseAnnotationPersistenceSyncParams) => {
  const geometryPointsTable = useMemo(
    () => buildPointGeometryRows(annotations.filter(isPointAnnotationEntry)),
    [annotations]
  );
  const geometryEdgesTable = useMemo(
    () => buildGeometryEdgeTable(distanceRelations, nodeChainAnnotations),
    [distanceRelations, nodeChainAnnotations]
  );
  const planarPolygonGroupVerticesTable = useMemo(
    () => buildPolygonGroupVertexTable(nodeChainAnnotations),
    [nodeChainAnnotations]
  );

  const hasAppliedInitialPersistenceStateRef = useRef(false);
  const lastSavedPersistenceStateRef = useRef<string | null>(null);

  useEffect(
    function effectApplyInitialPersistenceState() {
      if (hasAppliedInitialPersistenceStateRef.current) {
        return;
      }

      if (initialPersistenceState) {
        setTimeout(() => {
          setAnnotations(initialPersistenceState.tables.annotations);
          setDistanceRelations(
            initialPersistenceState.tables.distanceRelations.map(
              withDistanceRelationEdgeId
            )
          );
          setNodeChainAnnotations(
            initialPersistenceState.tables.nodeChainAnnotations
          );
        }, PERSISTENCE_RESTORE_DELAY_MS);
      }

      hasAppliedInitialPersistenceStateRef.current = true;
    },
    [
      initialPersistenceState,
      setAnnotations,
      setDistanceRelations,
      setNodeChainAnnotations,
    ]
  );

  useEffect(
    function effectEmitPersistenceStateChanges() {
      if (
        !onPersistenceStateChange ||
        !hasAppliedInitialPersistenceStateRef.current
      ) {
        return;
      }

      const persistenceState: AnnotationPersistenceEnvelopeV2 = {
        version: 2,
        geometry: {
          points: geometryPointsTable,
          edges: geometryEdgesTable,
        },
        tables: {
          annotations,
          distanceRelations: distanceRelations.map(withDistanceRelationEdgeId),
          nodeChainAnnotations,
          planarPolygonGroupVertices: planarPolygonGroupVerticesTable,
        },
      };

      const serialized = JSON.stringify(persistenceState);
      if (serialized === lastSavedPersistenceStateRef.current) {
        return;
      }

      onPersistenceStateChange(persistenceState);
      lastSavedPersistenceStateRef.current = serialized;
    },
    [
      annotations,
      distanceRelations,
      geometryEdgesTable,
      geometryPointsTable,
      nodeChainAnnotations,
      onPersistenceStateChange,
      planarPolygonGroupVerticesTable,
    ]
  );
};
