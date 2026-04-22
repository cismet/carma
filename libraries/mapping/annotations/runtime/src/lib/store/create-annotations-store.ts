import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type {
  AnnotationsStoreState,
  CesiumGeographicCoordinate,
  StoredAnnotation,
  AnnotationElevationDisplayMode,
  AnnotationEdge,
  AnnotationLabelAppearance,
  AnnotationNodeLink,
  AnnotationNodeId,
  AnnotationNode,
} from "./annotations-store.types";
import type { AnnotationToolId } from "../registry/annotation-tool-id";
import {
  reconcileNodeLinks,
  resolveNextNodeLinksForNodeMove,
} from "./node-links.helpers";
import { readMaxNumericSuffix } from "./annotation-entity-builder.helpers";
import type {
  RuntimeDistanceTriangleAnchorCoordinateRole,
  RuntimePointLabelCoordinateSelection,
} from "../render/measurement-render-models";
import { resolveAnnotationNodeMoveScope } from "./node-move-scope.helpers";
export type CreateInitialAnnotationsStoreStateOptions = {
  initialToolType?: AnnotationToolId;
  initialPointTemporaryMode?: boolean;
};

export type AppendAnnotationEntitiesPayload = {
  annotationEntry: StoredAnnotation;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  edges: readonly AnnotationEdge[];
  selectAnnotationId?: string | null;
};

export type RemoveAnnotationByIdPayload = {
  annotationId: string;
  nextSelectedAnnotationId?: string | null;
};

export type RemoveAnnotationsByIdsPayload = {
  annotationIds: readonly string[];
  nextSelectedAnnotationId?: string | null;
};

export type SetSelectedAnnotationIdsPayload = readonly string[];

export type UpdateNodeCoordinateByIdPayload = {
  nodeId: string;
  coordinate: CesiumGeographicCoordinate;
  selectedMeasurementIds?: readonly string[];
  movedNodeIds?: readonly AnnotationNodeId[];
  linkToNodeId?: AnnotationNodeId | null;
};

export type InsertNodeIntoMeasurementEdgePayload = {
  measurementId: string;
  startNodeId: string;
  endNodeId: string;
  coordinate: CesiumGeographicCoordinate;
};

export type UpdateAnnotationEntryByIdPayload = {
  annotationId: string;
  displayName?: string;
  shortLabel?: string;
  hidden?: boolean;
  locked?: boolean;
  labelAppearance?: AnnotationLabelAppearance;
  elevationDisplayMode?: AnnotationElevationDisplayMode;
  distanceAnchorCoordinateSelection?: RuntimePointLabelCoordinateSelection;
  distanceTriangleAnchorCoordinateRole?: RuntimeDistanceTriangleAnchorCoordinateRole;
};

export type SetElevationReferenceAnnotationIdPayload = string | null;
export type SetNextShortLabelCounterByToolTypePayload = {
  toolType: string;
  nextCounter: number;
};

const UNSET_TOOL_TYPE = "__unset__" as AnnotationToolId;
export const createInitialAnnotationsStoreState = (
  options: CreateInitialAnnotationsStoreStateOptions = {}
): AnnotationsStoreState => {
  const {
    initialToolType = UNSET_TOOL_TYPE,
    initialPointTemporaryMode = false,
  } = options;

  return {
    annotationToolType: initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
    },
    annotationEntries: [],
    nodes: [],
    linkedNodeGroups: [],
    edges: [],
    infoBoxState: {
      activeAnnotationId: null,
    },
    settingsState: {
      pointTemporaryMode: initialPointTemporaryMode,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  };
};

const annotationsSlice = createSlice({
  name: "annotationsRuntime",
  initialState: createInitialAnnotationsStoreState(),
  reducers: {
    replaceState: (_, action: PayloadAction<AnnotationsStoreState>) =>
      action.payload,
    setAnnotationToolType: (
      state,
      action: PayloadAction<AnnotationToolId>
    ) => {
      state.annotationToolType = action.payload;
    },
    setPointTemporaryMode: (state, action: PayloadAction<boolean>) => {
      state.settingsState.pointTemporaryMode = action.payload;
    },
    setElevationReferenceAnnotationId: (
      state,
      action: PayloadAction<SetElevationReferenceAnnotationIdPayload>
    ) => {
      state.settingsState.elevationReferenceAnnotationId = action.payload;
    },
    setNextShortLabelCounterByToolType: (
      state,
      action: PayloadAction<SetNextShortLabelCounterByToolTypePayload>
    ) => {
      state.settingsState.nextShortLabelCounterByToolType = {
        ...state.settingsState.nextShortLabelCounterByToolType,
        [action.payload.toolType]: Math.max(1, action.payload.nextCounter),
      };
    },
    setSelectedAnnotationId: (state, action: PayloadAction<string | null>) => {
      const nextSelectedAnnotationId = action.payload;
      const previousSelectedAnnotationId =
        state.selectionState.selectedAnnotationIds[
          state.selectionState.selectedAnnotationIds.length - 1
        ] ?? null;

      state.selectionState.previousSelectedAnnotationId =
        previousSelectedAnnotationId;
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationId
        ? [nextSelectedAnnotationId]
        : [];
      state.infoBoxState.activeAnnotationId = nextSelectedAnnotationId;
    },
    setSelectedAnnotationIds: (
      state,
      action: PayloadAction<SetSelectedAnnotationIdsPayload>
    ) => {
      const nextSelectedAnnotationIds = Array.from(
        new Set(action.payload.filter(Boolean))
      );
      const previousSelectedAnnotationId =
        state.selectionState.selectedAnnotationIds[
          state.selectionState.selectedAnnotationIds.length - 1
        ] ?? null;

      state.selectionState.previousSelectedAnnotationId =
        previousSelectedAnnotationId;
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationIds;
      state.infoBoxState.activeAnnotationId =
        nextSelectedAnnotationIds[nextSelectedAnnotationIds.length - 1] ?? null;
    },
    appendAnnotationEntities: (
      state,
      action: PayloadAction<AppendAnnotationEntitiesPayload>
    ) => {
      state.nodes.push(...action.payload.nodes);
      action.payload.linkedNodeGroups.forEach((incomingNodeLink) => {
        const existingNodeLink = state.linkedNodeGroups.find(
          (nodeLink) => nodeLink.id === incomingNodeLink.id
        );
        if (!existingNodeLink) {
          state.linkedNodeGroups.push({
            id: incomingNodeLink.id,
            nodeIds: [...incomingNodeLink.nodeIds],
          });
          return;
        }

        existingNodeLink.nodeIds = Array.from(
          new Set([...existingNodeLink.nodeIds, ...incomingNodeLink.nodeIds])
        );
      });
      state.edges.push(...action.payload.edges);
      state.annotationEntries.push({
        ...action.payload.annotationEntry,
        nodeIds: [...action.payload.annotationEntry.nodeIds],
        edgeIds: [...action.payload.annotationEntry.edgeIds],
      });
      state.linkedNodeGroups = reconcileNodeLinks({
        nodes: state.nodes,
        nodeLinks: state.linkedNodeGroups,
      });

      if (action.payload.selectAnnotationId !== undefined) {
        const previousSelectedAnnotationId =
          state.selectionState.selectedAnnotationIds[
            state.selectionState.selectedAnnotationIds.length - 1
          ] ?? null;
        state.selectionState.previousSelectedAnnotationId =
          previousSelectedAnnotationId;
        state.selectionState.selectedAnnotationIds = action.payload
          .selectAnnotationId
          ? [action.payload.selectAnnotationId]
          : [];
        state.infoBoxState.activeAnnotationId =
          action.payload.selectAnnotationId ?? null;
      }
    },
    removeAnnotationById: (
      state,
      action: PayloadAction<RemoveAnnotationByIdPayload>
    ) => {
      const { annotationId, nextSelectedAnnotationId } = action.payload;
      const previousSelectionId =
        state.selectionState.selectedAnnotationIds[
          state.selectionState.selectedAnnotationIds.length - 1
        ] ?? null;
      const hasTarget = state.annotationEntries.some(
        (annotationEntry) => annotationEntry.id === annotationId
      );
      if (!hasTarget) {
        return;
      }

      state.annotationEntries = state.annotationEntries.filter(
        (annotationEntry) => annotationEntry.id !== annotationId
      );

      const usedNodeIds = new Set(
        state.annotationEntries.flatMap(
          (annotationEntry) => annotationEntry.nodeIds
        )
      );
      const usedEdgeIds = new Set(
        state.annotationEntries.flatMap(
          (annotationEntry) => annotationEntry.edgeIds
        )
      );

      state.nodes = state.nodes.filter((node) => usedNodeIds.has(node.id));
      state.linkedNodeGroups = reconcileNodeLinks({
        nodes: state.nodes,
        nodeLinks: state.linkedNodeGroups,
      });
      state.edges = state.edges.filter((edge) => usedEdgeIds.has(edge.id));

      state.selectionState.previousSelectedAnnotationId = previousSelectionId;
      if (state.settingsState.elevationReferenceAnnotationId === annotationId) {
        state.settingsState.elevationReferenceAnnotationId = null;
      }

      if (nextSelectedAnnotationId !== undefined) {
        state.selectionState.selectedAnnotationIds = nextSelectedAnnotationId
          ? [nextSelectedAnnotationId]
          : [];
        state.infoBoxState.activeAnnotationId =
          nextSelectedAnnotationId ?? null;
        return;
      }

      const nextSelectedAnnotationIds =
        state.selectionState.selectedAnnotationIds.filter(
          (selectedAnnotationId) => selectedAnnotationId !== annotationId
        );
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationIds;
      state.infoBoxState.activeAnnotationId =
        nextSelectedAnnotationIds[nextSelectedAnnotationIds.length - 1] ?? null;
    },
    removeAnnotationsByIds: (
      state,
      action: PayloadAction<RemoveAnnotationsByIdsPayload>
    ) => {
      const annotationIdSet = new Set(action.payload.annotationIds);
      if (annotationIdSet.size === 0) {
        return;
      }

      const previousSelectionId =
        state.selectionState.selectedAnnotationIds[
          state.selectionState.selectedAnnotationIds.length - 1
        ] ?? null;
      const hasAnyTarget = state.annotationEntries.some((annotationEntry) =>
        annotationIdSet.has(annotationEntry.id)
      );
      if (!hasAnyTarget) {
        return;
      }

      state.annotationEntries = state.annotationEntries.filter(
        (annotationEntry) => !annotationIdSet.has(annotationEntry.id)
      );

      const usedNodeIds = new Set(
        state.annotationEntries.flatMap(
          (annotationEntry) => annotationEntry.nodeIds
        )
      );
      const usedEdgeIds = new Set(
        state.annotationEntries.flatMap(
          (annotationEntry) => annotationEntry.edgeIds
        )
      );

      state.nodes = state.nodes.filter((node) => usedNodeIds.has(node.id));
      state.linkedNodeGroups = reconcileNodeLinks({
        nodes: state.nodes,
        nodeLinks: state.linkedNodeGroups,
      });
      state.edges = state.edges.filter((edge) => usedEdgeIds.has(edge.id));
      state.selectionState.previousSelectedAnnotationId = previousSelectionId;
      if (
        state.settingsState.elevationReferenceAnnotationId &&
        annotationIdSet.has(state.settingsState.elevationReferenceAnnotationId)
      ) {
        state.settingsState.elevationReferenceAnnotationId = null;
      }

      if (action.payload.nextSelectedAnnotationId !== undefined) {
        state.selectionState.selectedAnnotationIds = action.payload
          .nextSelectedAnnotationId
          ? [action.payload.nextSelectedAnnotationId]
          : [];
        state.infoBoxState.activeAnnotationId =
          action.payload.nextSelectedAnnotationId ?? null;
        return;
      }

      const nextSelectedAnnotationIds =
        state.selectionState.selectedAnnotationIds.filter(
          (annotationId) => !annotationIdSet.has(annotationId)
        );
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationIds;
      state.infoBoxState.activeAnnotationId =
        nextSelectedAnnotationIds[nextSelectedAnnotationIds.length - 1] ?? null;
    },
    updateNodeCoordinateById: (
      state,
      action: PayloadAction<UpdateNodeCoordinateByIdPayload>
    ) => {
      const {
        nodeId,
        coordinate,
        selectedMeasurementIds = [],
        movedNodeIds: preferredMovedNodeIds,
        linkToNodeId,
      } = action.payload;
      const { targetNode, movedNodeIds } = resolveAnnotationNodeMoveScope({
        nodeId,
        nodes: state.nodes,
        linkedNodeGroups: state.linkedNodeGroups,
        annotationEntries: state.annotationEntries,
        selectedMeasurementIds,
        preferredMovedNodeIds,
      });
      if (!targetNode) {
        return;
      }

      const movedNodeIdSet = new Set(movedNodeIds);

      if (movedNodeIds.length === 0) {
        return;
      }

      state.nodes.forEach((node) => {
        if (!movedNodeIdSet.has(node.id)) {
          return;
        }

        node.coordinate = coordinate;
      });

      state.linkedNodeGroups = resolveNextNodeLinksForNodeMove({
        nodes: state.nodes,
        nodeLinks: state.linkedNodeGroups,
        nodeId: targetNode.id,
        movedNodeIds,
        linkToNodeId,
      });
    },
    insertNodeIntoMeasurementEdge: (
      state,
      action: PayloadAction<InsertNodeIntoMeasurementEdgePayload>
    ) => {
      const { measurementId, startNodeId, endNodeId, coordinate } =
        action.payload;
      const measurement = state.annotationEntries.find(
        (entry) => entry.id === measurementId
      );
      if (!measurement) {
        return;
      }

      const targetNodePairIndex = measurement.nodeIds.findIndex(
        (nodeId, index) =>
          nodeId === startNodeId && measurement.nodeIds[index + 1] === endNodeId
      );
      const insertNodeIndex =
        targetNodePairIndex >= 0
          ? targetNodePairIndex + 1
          : measurement.closed &&
            measurement.nodeIds.length >= 3 &&
            measurement.nodeIds[measurement.nodeIds.length - 1] ===
              startNodeId &&
            measurement.nodeIds[0] === endNodeId
          ? measurement.nodeIds.length
          : -1;

      if (insertNodeIndex < 0) {
        return;
      }

      const edgeById = new Map(state.edges.map((edge) => [edge.id, edge]));
      const targetEdgeIdIndex = measurement.edgeIds.findIndex((edgeId) => {
        const edge = edgeById.get(edgeId);
        return (
          edge?.startNodeId === startNodeId && edge.endNodeId === endNodeId
        );
      });
      const targetEdgeId =
        targetEdgeIdIndex >= 0 ? measurement.edgeIds[targetEdgeIdIndex] : null;
      const targetEdge = targetEdgeId ? edgeById.get(targetEdgeId) : undefined;

      if (!targetEdge || targetEdgeIdIndex < 0) {
        return;
      }

      const nextNodeId = `node-${
        readMaxNumericSuffix(state.nodes.map((node) => node.id)) + 1
      }`;
      const nextEdgeId = `edge-${
        readMaxNumericSuffix(state.edges.map((edge) => edge.id)) + 1
      }`;

      state.nodes.push({
        id: nextNodeId,
        coordinate,
      });
      state.linkedNodeGroups = reconcileNodeLinks({
        nodes: state.nodes,
        nodeLinks: [
          ...state.linkedNodeGroups,
          {
            id: nextNodeId,
            nodeIds: [nextNodeId],
          },
        ],
      });

      targetEdge.endNodeId = nextNodeId;

      const nextEdge = {
        id: nextEdgeId,
        startNodeId: nextNodeId,
        endNodeId,
      };
      const targetEdgeStateIndex = state.edges.findIndex(
        (edge) => edge.id === targetEdgeId
      );
      if (targetEdgeStateIndex >= 0) {
        state.edges.splice(targetEdgeStateIndex + 1, 0, nextEdge);
      } else {
        state.edges.push(nextEdge);
      }

      measurement.nodeIds = [
        ...measurement.nodeIds.slice(0, insertNodeIndex),
        nextNodeId,
        ...measurement.nodeIds.slice(insertNodeIndex),
      ];
      measurement.edgeIds = [
        ...measurement.edgeIds.slice(0, targetEdgeIdIndex + 1),
        nextEdgeId,
        ...measurement.edgeIds.slice(targetEdgeIdIndex + 1),
      ];
    },
    updateAnnotationEntryById: (
      state,
      action: PayloadAction<UpdateAnnotationEntryByIdPayload>
    ) => {
      const {
        annotationId,
        displayName,
        shortLabel,
        hidden,
        locked,
        labelAppearance,
        elevationDisplayMode,
        distanceAnchorCoordinateSelection,
        distanceTriangleAnchorCoordinateRole,
      } = action.payload;
      const targetEntry = state.annotationEntries.find(
        (entry) => entry.id === annotationId
      );
      if (!targetEntry) {
        return;
      }

      if (displayName !== undefined) {
        targetEntry.displayName = displayName;
      }

      if (shortLabel !== undefined) {
        targetEntry.shortLabel = shortLabel;
      }

      if (hidden !== undefined) {
        targetEntry.hidden = hidden;
      }

      if (locked !== undefined) {
        targetEntry.locked = locked;
      }

      if (labelAppearance !== undefined) {
        targetEntry.labelAppearance = {
          ...(targetEntry.labelAppearance ?? {}),
          ...labelAppearance,
        };
      }

      if (elevationDisplayMode !== undefined) {
        targetEntry.elevationDisplayMode = elevationDisplayMode;
      }

      if (distanceAnchorCoordinateSelection !== undefined) {
        targetEntry.distanceAnchorCoordinateSelection =
          distanceAnchorCoordinateSelection;
      }

      if (distanceTriangleAnchorCoordinateRole !== undefined) {
        targetEntry.distanceTriangleAnchorCoordinateRole =
          distanceTriangleAnchorCoordinateRole;
      }
    },
  },
});

export const {
  appendAnnotationEntities,
  removeAnnotationById,
  removeAnnotationsByIds,
  setElevationReferenceAnnotationId,
  setNextShortLabelCounterByToolType,
  setPointTemporaryMode,
  insertNodeIntoMeasurementEdge,
  updateNodeCoordinateById,
  updateAnnotationEntryById,
  replaceState,
  setAnnotationToolType,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
} = annotationsSlice.actions;

export const createAnnotationsStore = (initialState: AnnotationsStoreState) =>
  configureStore({
    reducer: annotationsSlice.reducer,
    preloadedState: initialState,
  });

export type AnnotationsStore = ReturnType<typeof createAnnotationsStore>;
