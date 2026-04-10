import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { RuntimeToolId } from "../types/runtimeTool.types";
import type {
  AnnotationsStoreState,
  RuntimeCoordinate,
  RuntimeAnnotationEntry,
  RuntimeElevationDisplayMode,
  RuntimeEdge,
  RuntimeLabelAppearance,
  RuntimeLinkedNodeGroup,
  RuntimeLinkedNodeGroupId,
  RuntimeNode,
} from "./annotationsStore.types";
import { reconcileLinkedNodeGroups } from "./linkedNodeGroups.helpers";
import type {
  RuntimeDistanceTriangleAnchorCoordinateRole,
  RuntimePointLabelCoordinateSelection,
} from "../render/measurementRenderModels";
export type CreateInitialAnnotationsStoreStateOptions = {
  initialToolType?: RuntimeToolId;
  initialPointTemporaryMode?: boolean;
};

export type AppendAnnotationEntitiesPayload = {
  annotationEntry: RuntimeAnnotationEntry;
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[];
  edges: readonly RuntimeEdge[];
  selectAnnotationId?: string | null;
};

export type SetDraftCoordinatesByToolTypePayload = {
  toolType: RuntimeToolId;
  coordinates: readonly RuntimeCoordinate[];
};

export type SetDraftLinkedNodeGroupIdsByToolTypePayload = {
  toolType: RuntimeToolId;
  linkedNodeGroupIds: readonly (RuntimeLinkedNodeGroupId | null)[];
};

export type SetPendingAnnotationIdByToolTypePayload = {
  toolType: RuntimeToolId;
  annotationId: string | null;
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
  coordinate: RuntimeCoordinate;
  selectedMeasurementIds?: readonly string[];
};

export type SetAnnotationTemporaryByIdPayload = {
  annotationId: string;
  temporary: boolean;
};

export type UpdateAnnotationEntryByIdPayload = {
  annotationId: string;
  displayName?: string;
  shortLabel?: string;
  hidden?: boolean;
  locked?: boolean;
  labelAppearance?: RuntimeLabelAppearance;
  elevationDisplayMode?: RuntimeElevationDisplayMode;
  distanceAnchorCoordinateSelection?: RuntimePointLabelCoordinateSelection;
  distanceTriangleAnchorCoordinateRole?: RuntimeDistanceTriangleAnchorCoordinateRole;
};

export type SetElevationReferenceAnnotationIdPayload = string | null;
export type SetNextShortLabelCounterByToolTypePayload = {
  toolType: string;
  nextCounter: number;
};

const UNSET_TOOL_TYPE = "__unset__" as RuntimeToolId;
const EARTH_RADIUS_METERS = 6_378_137;
const LINKED_NODE_GROUP_DETACH_EPSILON_METERS = 0.1;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const resolveCoordinateDistanceMeters = (
  left: RuntimeCoordinate,
  right: RuntimeCoordinate
) => {
  const deltaLatitudeRad = toRadians(right.latitude - left.latitude);
  const deltaLongitudeRad = toRadians(right.longitude - left.longitude);
  const meanLatitudeRad = toRadians((left.latitude + right.latitude) / 2);
  const horizontalEastMeters =
    deltaLongitudeRad * Math.cos(meanLatitudeRad) * EARTH_RADIUS_METERS;
  const horizontalNorthMeters = deltaLatitudeRad * EARTH_RADIUS_METERS;
  const deltaAltitudeMeters = right.altitude - left.altitude;

  return Math.hypot(
    horizontalEastMeters,
    horizontalNorthMeters,
    deltaAltitudeMeters
  );
};

const resolveDetachedLinkedNodeGroupId = ({
  movedNodeIds,
  existingLinkedNodeGroups,
  excludedGroupIds = [],
}: {
  movedNodeIds: readonly string[];
  existingLinkedNodeGroups: readonly RuntimeLinkedNodeGroup[];
  excludedGroupIds?: readonly string[];
}) => {
  const existingLinkedNodeGroupIdSet = new Set(
    existingLinkedNodeGroups.map((linkedNodeGroup) => linkedNodeGroup.id)
  );
  excludedGroupIds.forEach((excludedGroupId) => {
    existingLinkedNodeGroupIdSet.delete(excludedGroupId);
  });

  const baseLinkedNodeGroupId = `linked-node-group-${[...movedNodeIds]
    .sort()
    .join("-")}`;
  if (!existingLinkedNodeGroupIdSet.has(baseLinkedNodeGroupId)) {
    return baseLinkedNodeGroupId;
  }

  let suffix = 2;
  while (
    existingLinkedNodeGroupIdSet.has(`${baseLinkedNodeGroupId}-${suffix}`)
  ) {
    suffix += 1;
  }

  return `${baseLinkedNodeGroupId}-${suffix}`;
};

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
    draftState: {
      draftCoordinatesByToolType: {},
      draftLinkedNodeGroupIdsByToolType: {},
      pendingAnnotationIdByToolType: {},
    },
  };
};

const annotationsSlice = createSlice({
  name: "annotationsV2",
  initialState: createInitialAnnotationsStoreState(),
  reducers: {
    replaceState: (_, action: PayloadAction<AnnotationsStoreState>) =>
      action.payload,
    setAnnotationToolType: (state, action: PayloadAction<RuntimeToolId>) => {
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
      action.payload.linkedNodeGroups.forEach((incomingLinkedNodeGroup) => {
        const existingLinkedNodeGroup = state.linkedNodeGroups.find(
          (linkedNodeGroup) => linkedNodeGroup.id === incomingLinkedNodeGroup.id
        );
        if (!existingLinkedNodeGroup) {
          state.linkedNodeGroups.push({
            id: incomingLinkedNodeGroup.id,
            nodeIds: [...incomingLinkedNodeGroup.nodeIds],
          });
          return;
        }

        existingLinkedNodeGroup.nodeIds = Array.from(
          new Set([
            ...existingLinkedNodeGroup.nodeIds,
            ...incomingLinkedNodeGroup.nodeIds,
          ])
        );
      });
      state.edges.push(...action.payload.edges);
      state.annotationEntries.push({
        ...action.payload.annotationEntry,
        nodeIds: [...action.payload.annotationEntry.nodeIds],
        edgeIds: [...action.payload.annotationEntry.edgeIds],
      });
      state.linkedNodeGroups = reconcileLinkedNodeGroups({
        nodes: state.nodes,
        linkedNodeGroups: state.linkedNodeGroups,
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
      Object.keys(state.draftState.pendingAnnotationIdByToolType).forEach(
        (toolType) => {
          if (
            state.draftState.pendingAnnotationIdByToolType[
              toolType as RuntimeToolId
            ] === annotationId
          ) {
            delete state.draftState.pendingAnnotationIdByToolType[
              toolType as RuntimeToolId
            ];
          }
        }
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
      state.linkedNodeGroups = reconcileLinkedNodeGroups({
        nodes: state.nodes,
        linkedNodeGroups: state.linkedNodeGroups,
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
      Object.keys(state.draftState.pendingAnnotationIdByToolType).forEach(
        (toolType) => {
          if (
            annotationIdSet.has(
              state.draftState.pendingAnnotationIdByToolType[
                toolType as RuntimeToolId
              ] ?? ""
            )
          ) {
            delete state.draftState.pendingAnnotationIdByToolType[
              toolType as RuntimeToolId
            ];
          }
        }
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
      state.linkedNodeGroups = reconcileLinkedNodeGroups({
        nodes: state.nodes,
        linkedNodeGroups: state.linkedNodeGroups,
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
      const { nodeId, coordinate, selectedMeasurementIds = [] } = action.payload;
      const targetNode = state.nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return;
      }

      const targetLinkedNodeGroup =
        state.linkedNodeGroups.find((linkedNodeGroup) =>
          linkedNodeGroup.nodeIds.includes(nodeId)
        ) ?? null;
      const linkedNodeGroupNodeIds = targetLinkedNodeGroup?.nodeIds ?? [nodeId];
      const selectedMeasurementIdSet = new Set(
        selectedMeasurementIds.filter(Boolean)
      );
      const selectedNodeIdSet = new Set(
        state.annotationEntries
          .filter((annotationEntry) =>
            selectedMeasurementIdSet.has(annotationEntry.id)
          )
          .flatMap((annotationEntry) => annotationEntry.nodeIds)
      );
      const selectedLinkedNodeIds = linkedNodeGroupNodeIds.filter(
        (linkedNodeId) => selectedNodeIdSet.has(linkedNodeId)
      );
      const scopedMovedNodeIds =
        selectedLinkedNodeIds.length > 0
          ? selectedLinkedNodeIds
          : [...linkedNodeGroupNodeIds];
      const lockedNodeIdSet = new Set(
        state.annotationEntries
          .filter((annotationEntry) => annotationEntry.locked)
          .flatMap((annotationEntry) => annotationEntry.nodeIds)
      );
      const movedNodeIds = scopedMovedNodeIds.filter(
        (movedNodeId) => !lockedNodeIdSet.has(movedNodeId)
      );
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

      if (
        !targetLinkedNodeGroup ||
        movedNodeIds.length === 0 ||
        movedNodeIds.length === targetLinkedNodeGroup.nodeIds.length
      ) {
        return;
      }

      const untouchedNodes = state.nodes.filter(
        (node) =>
          targetLinkedNodeGroup.nodeIds.includes(node.id) &&
          !movedNodeIdSet.has(node.id)
      );
      const shouldDetachMovedNodes = untouchedNodes.some(
        (untouchedNode) =>
          resolveCoordinateDistanceMeters(
            untouchedNode.coordinate,
            coordinate
          ) > LINKED_NODE_GROUP_DETACH_EPSILON_METERS
      );
      if (!shouldDetachMovedNodes) {
        return;
      }

      targetLinkedNodeGroup.nodeIds = targetLinkedNodeGroup.nodeIds.filter(
        (linkedNodeId) => !movedNodeIdSet.has(linkedNodeId)
      );
      state.linkedNodeGroups.push({
        id: resolveDetachedLinkedNodeGroupId({
          movedNodeIds,
          existingLinkedNodeGroups: state.linkedNodeGroups,
          excludedGroupIds: [targetLinkedNodeGroup.id],
        }),
        nodeIds: [...movedNodeIds],
      });
      state.linkedNodeGroups = reconcileLinkedNodeGroups({
        nodes: state.nodes,
        linkedNodeGroups: state.linkedNodeGroups,
      });
    },
    setAnnotationTemporaryById: (
      state,
      action: PayloadAction<SetAnnotationTemporaryByIdPayload>
    ) => {
      const { annotationId, temporary } = action.payload;
      const targetEntry = state.annotationEntries.find(
        (entry) => entry.id === annotationId
      );
      if (!targetEntry) {
        return;
      }
      targetEntry.temporary = temporary;
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
    finalizeTemporaryAnnotationsByToolType: (
      state,
      action: PayloadAction<RuntimeAnnotationEntry["toolType"]>
    ) => {
      const toolType = action.payload;
      state.annotationEntries.forEach((entry) => {
        if (entry.toolType === toolType && entry.temporary) {
          entry.temporary = false;
        }
      });
    },
    clearTemporaryAnnotationsByToolType: (
      state,
      action: PayloadAction<RuntimeAnnotationEntry["toolType"]>
    ) => {
      const toolType = action.payload;
      const temporaryEntryIdSet = new Set(
        state.annotationEntries
          .filter((entry) => entry.toolType === toolType && entry.temporary)
          .map((entry) => entry.id)
      );
      if (temporaryEntryIdSet.size === 0) {
        return;
      }

      state.annotationEntries = state.annotationEntries.filter(
        (entry) => !temporaryEntryIdSet.has(entry.id)
      );

      const usedNodeIds = new Set(
        state.annotationEntries.flatMap((entry) => entry.nodeIds)
      );
      const usedEdgeIds = new Set(
        state.annotationEntries.flatMap((entry) => entry.edgeIds)
      );
      state.nodes = state.nodes.filter((node) => usedNodeIds.has(node.id));
      state.linkedNodeGroups = reconcileLinkedNodeGroups({
        nodes: state.nodes,
        linkedNodeGroups: state.linkedNodeGroups,
      });
      state.edges = state.edges.filter((edge) => usedEdgeIds.has(edge.id));

      const nextSelectedAnnotationIds =
        state.selectionState.selectedAnnotationIds.filter(
          (annotationId) => !temporaryEntryIdSet.has(annotationId)
        );
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationIds;
      state.infoBoxState.activeAnnotationId =
        nextSelectedAnnotationIds[nextSelectedAnnotationIds.length - 1] ?? null;
    },
    setDraftCoordinatesByToolType: (
      state,
      action: PayloadAction<SetDraftCoordinatesByToolTypePayload>
    ) => {
      state.draftState.draftCoordinatesByToolType[action.payload.toolType] = [
        ...action.payload.coordinates,
      ];
    },
    setDraftLinkedNodeGroupIdsByToolType: (
      state,
      action: PayloadAction<SetDraftLinkedNodeGroupIdsByToolTypePayload>
    ) => {
      state.draftState.draftLinkedNodeGroupIdsByToolType[
        action.payload.toolType
      ] = [...action.payload.linkedNodeGroupIds];
    },
    clearDraftCoordinatesByToolType: (
      state,
      action: PayloadAction<RuntimeToolId>
    ) => {
      delete state.draftState.draftCoordinatesByToolType[action.payload];
      delete state.draftState.draftLinkedNodeGroupIdsByToolType[
        action.payload
      ];
    },
    setPendingAnnotationIdByToolType: (
      state,
      action: PayloadAction<SetPendingAnnotationIdByToolTypePayload>
    ) => {
      state.draftState.pendingAnnotationIdByToolType[action.payload.toolType] =
        action.payload.annotationId;
    },
  },
});

export const {
  appendAnnotationEntities,
  clearTemporaryAnnotationsByToolType,
  clearDraftCoordinatesByToolType,
  finalizeTemporaryAnnotationsByToolType,
  removeAnnotationById,
  removeAnnotationsByIds,
  setAnnotationTemporaryById,
  setElevationReferenceAnnotationId,
  setNextShortLabelCounterByToolType,
  setPointTemporaryMode,
  updateNodeCoordinateById,
  updateAnnotationEntryById,
  replaceState,
  setAnnotationToolType,
  setDraftCoordinatesByToolType,
  setDraftLinkedNodeGroupIdsByToolType,
  setPendingAnnotationIdByToolType,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
} = annotationsSlice.actions;

export const createAnnotationsStore = (initialState: AnnotationsStoreState) =>
  configureStore({
    reducer: annotationsSlice.reducer,
    preloadedState: initialState,
  });

export type AnnotationsStore = ReturnType<typeof createAnnotationsStore>;
