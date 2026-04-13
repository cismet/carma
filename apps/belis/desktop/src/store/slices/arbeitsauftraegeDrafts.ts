import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { isFormDirty } from "../../components/ui/featuresForm/formDiffUtils";

export interface AADraftMeta {
  nummer?: string;
  team?: string;
  angelegt_am?: string;
}

export interface APDraftMeta {
  protokollnummer?: string;
  fachobjektType?: string;
  veranlassung?: string;
  headerColor?: string;
  datum?: string;
  shortname?: string;
}

export interface AADraft {
  values: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
  meta?: AADraftMeta;
  updatedAt: number;
}

export interface Aenderung {
  /** Display label, e.g. "Leuchtentyp" */
  field: string;
  /** Old value (formatted for display) */
  alt: string | null;
  /** New value (formatted for display) */
  neu: string;
}

export interface DraftAction {
  /** Action label, e.g. "Leuchtenerneuerung" */
  actionLabel: string;
  /** Target fachobjekt type, e.g. "tdta_leuchten" */
  fachobjektType: string;
  /** Serialized form values from the action modal */
  values: Record<string, unknown>;
  /** Computed old → new changes for display */
  aenderungen: Aenderung[];
  createdAt: number;
}

export interface APDraft {
  values: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
  featureType?: string;
  aaId?: string;
  meta?: APDraftMeta;
  actions?: DraftAction[];
  /** Snapshot of the full server arbeitsprotokoll object at draft creation time */
  serverData?: Record<string, unknown>;
  updatedAt: number;
}

interface ArbeitsauftraegeDraftsState {
  aaDrafts: Record<string, AADraft>;
  apDrafts: Record<string, APDraft>;
  originalValues: Record<string, Record<string, unknown>>;
  /** AP ID → AA ID mapping for APs staged for deletion */
  apDeletions: Record<string, string>;
}

const initialState: ArbeitsauftraegeDraftsState = {
  aaDrafts: {},
  apDrafts: {},
  originalValues: {},
  apDeletions: {},
};

const arbeitsauftraegeDraftsSlice = createSlice({
  name: "arbeitsauftraegeDrafts",
  initialState,
  reducers: {
    setAADraft(
      state,
      action: PayloadAction<{
        id: string;
        values: Record<string, unknown>;
        geometry?: GeoJSON.Geometry;
        meta?: AADraftMeta;
      }>
    ) {
      const { id, values, geometry, meta } = action.payload;
      const key = `aa:${id}`;
      const original = state.originalValues[key];

      // Auto-cleanup when reverted to original
      if (original && !isFormDirty(original, values)) {
        delete state.aaDrafts[id];
        return;
      }

      state.aaDrafts[id] = {
        values,
        geometry: geometry ?? state.aaDrafts[id]?.geometry,
        meta: meta ?? state.aaDrafts[id]?.meta,
        updatedAt: Date.now(),
      };
    },
    setAPDraft(
      state,
      action: PayloadAction<{
        id: string;
        values: Record<string, unknown>;
        geometry?: GeoJSON.Geometry;
        featureType?: string;
        aaId?: string;
        meta?: APDraftMeta;
        serverData?: Record<string, unknown>;
      }>
    ) {
      const { id, values, geometry, featureType, aaId, meta, serverData } =
        action.payload;
      const key = `ap:${id}`;
      const original = state.originalValues[key];

      // Auto-cleanup when reverted to original (but keep if actions exist)
      if (original && !isFormDirty(original, values)) {
        const existingActions = state.apDrafts[id]?.actions;
        if (existingActions && existingActions.length > 0) {
          // Keep draft alive for actions, just update values
          state.apDrafts[id].values = values;
          state.apDrafts[id].updatedAt = Date.now();
          return;
        }
        delete state.apDrafts[id];
        return;
      }

      state.apDrafts[id] = {
        values,
        geometry: geometry ?? state.apDrafts[id]?.geometry,
        featureType: featureType ?? state.apDrafts[id]?.featureType,
        aaId: aaId ?? state.apDrafts[id]?.aaId,
        meta: meta ?? state.apDrafts[id]?.meta,
        actions: state.apDrafts[id]?.actions,
        serverData: serverData ?? state.apDrafts[id]?.serverData,
        updatedAt: Date.now(),
      };
    },
    removeAADraft(state, action: PayloadAction<string>) {
      delete state.aaDrafts[action.payload];
      delete state.originalValues[`aa:${action.payload}`];
    },
    removeAPDraft(state, action: PayloadAction<string>) {
      delete state.apDrafts[action.payload];
      delete state.originalValues[`ap:${action.payload}`];
    },
    clearAllArbeitsauftraegeDrafts(state) {
      state.aaDrafts = {};
      state.apDrafts = {};
      state.originalValues = {};
      state.apDeletions = {};
    },
    markAPForDeletion(
      state,
      action: PayloadAction<{ apId: string; aaId: string }>
    ) {
      state.apDeletions[action.payload.apId] = action.payload.aaId;
    },
    unmarkAPForDeletion(state, action: PayloadAction<string>) {
      delete state.apDeletions[action.payload];
    },
    setAAOriginalValues(
      state,
      action: PayloadAction<{
        id: string;
        values: Record<string, unknown>;
      }>
    ) {
      const key = `aa:${action.payload.id}`;
      state.originalValues[key] = action.payload.values;
      // Clean up orphaned originalValues that have no corresponding draft
      for (const k of Object.keys(state.originalValues)) {
        if (k === key) continue;
        if (k.startsWith("aa:") && !state.aaDrafts[k.slice(3)]) {
          delete state.originalValues[k];
        }
      }
    },
    setAPOriginalValues(
      state,
      action: PayloadAction<{
        id: string;
        values: Record<string, unknown>;
      }>
    ) {
      const key = `ap:${action.payload.id}`;
      state.originalValues[key] = action.payload.values;
      // Clean up orphaned originalValues that have no corresponding draft
      for (const k of Object.keys(state.originalValues)) {
        if (k === key) continue;
        if (k.startsWith("ap:") && !state.apDrafts[k.slice(3)]) {
          delete state.originalValues[k];
        }
      }
    },
    addActionToAPDraft(
      state,
      action: PayloadAction<{
        id: string;
        draftAction: DraftAction;
        serverData?: Record<string, unknown>;
        meta?: APDraftMeta;
      }>
    ) {
      const { id, draftAction, serverData, meta } = action.payload;
      if (!state.apDrafts[id]) {
        state.apDrafts[id] = {
          values: {},
          actions: [],
          serverData,
          meta,
          updatedAt: Date.now(),
        };
      }
      const draft = state.apDrafts[id];
      if (!draft.actions) draft.actions = [];
      draft.actions.push(draftAction);
      if (serverData && !draft.serverData) {
        draft.serverData = serverData;
      }
      if (meta && !draft.meta) {
        draft.meta = meta;
      }
      draft.updatedAt = Date.now();
    },
    removeActionFromAPDraft(
      state,
      action: PayloadAction<{ id: string; actionIndex: number }>
    ) {
      const { id, actionIndex } = action.payload;
      const draft = state.apDrafts[id];
      if (!draft?.actions) return;
      draft.actions.splice(actionIndex, 1);
      draft.updatedAt = Date.now();
      // Clean up draft if no actions and no value changes remain
      if (draft.actions.length === 0) {
        const original = state.originalValues[`ap:${id}`];
        if (original && !isFormDirty(original, draft.values)) {
          delete state.apDrafts[id];
        }
      }
    },
  },
});

export default arbeitsauftraegeDraftsSlice;

export const {
  setAADraft,
  setAPDraft,
  removeAADraft,
  removeAPDraft,
  clearAllArbeitsauftraegeDrafts,
  setAAOriginalValues,
  setAPOriginalValues,
  addActionToAPDraft,
  removeActionFromAPDraft,
  markAPForDeletion,
  unmarkAPForDeletion,
} = arbeitsauftraegeDraftsSlice.actions;

// --- Selectors ---

export const getAADraft = (
  state: RootState,
  id: string | undefined
): AADraft | undefined =>
  id ? state.arbeitsauftraegeDrafts?.aaDrafts[id] : undefined;

export const getAPDraft = (
  state: RootState,
  id: string | undefined
): APDraft | undefined =>
  id ? state.arbeitsauftraegeDrafts?.apDrafts[id] : undefined;

export const getAllAADrafts = (state: RootState): Record<string, AADraft> =>
  state.arbeitsauftraegeDrafts?.aaDrafts ?? {};

export const getAllAPDrafts = (state: RootState): Record<string, APDraft> =>
  state.arbeitsauftraegeDrafts?.apDrafts ?? {};

export const getAADraftCount = (state: RootState): number =>
  Object.keys(state.arbeitsauftraegeDrafts?.aaDrafts ?? {}).length;

export const getAPDraftCount = (state: RootState): number =>
  Object.keys(state.arbeitsauftraegeDrafts?.apDrafts ?? {}).length;

export const getAPDeletionCount = (state: RootState): number =>
  Object.keys(state.arbeitsauftraegeDrafts?.apDeletions ?? {}).length;

export const getTotalDraftCount = (state: RootState): number =>
  getAADraftCount(state) + getAPDraftCount(state) + getAPDeletionCount(state);

export const hasAADraftChanges = (
  state: RootState,
  id: string | undefined
): boolean => {
  if (!id) return false;
  const draft = state.arbeitsauftraegeDrafts?.aaDrafts[id];
  if (!draft) return false;
  const original = state.arbeitsauftraegeDrafts?.originalValues[`aa:${id}`];
  if (!original) return true;
  return isFormDirty(original, draft.values);
};

export const hasAPDraftChanges = (
  state: RootState,
  id: string | undefined
): boolean => {
  if (!id) return false;
  const draft = state.arbeitsauftraegeDrafts?.apDrafts[id];
  if (!draft) return false;
  if (draft.actions && draft.actions.length > 0) return true;
  const original = state.arbeitsauftraegeDrafts?.originalValues[`ap:${id}`];
  if (!original) return true;
  return isFormDirty(original, draft.values);
};

export const getAPDraftActions = (
  state: RootState,
  id: string | undefined
): DraftAction[] =>
  id ? state.arbeitsauftraegeDrafts?.apDrafts[id]?.actions ?? [] : [];

export const getAAOriginalValues = (
  state: RootState,
  id: string | undefined
): Record<string, unknown> | undefined =>
  id ? state.arbeitsauftraegeDrafts?.originalValues[`aa:${id}`] : undefined;

export const getAPOriginalValues = (
  state: RootState,
  id: string | undefined
): Record<string, unknown> | undefined =>
  id ? state.arbeitsauftraegeDrafts?.originalValues[`ap:${id}`] : undefined;

export const getAADraftIds = (state: RootState): string[] =>
  Object.keys(state.arbeitsauftraegeDrafts?.aaDrafts ?? {});

export const getAPDraftIds = (state: RootState): string[] =>
  Object.keys(state.arbeitsauftraegeDrafts?.apDrafts ?? {});

export const getAPDeletions = (
  state: RootState
): Record<string, string> =>
  state.arbeitsauftraegeDrafts?.apDeletions ?? {};

export const isAPMarkedForDeletion = (
  state: RootState,
  apId: string
): boolean => apId in (state.arbeitsauftraegeDrafts?.apDeletions ?? {});

export const getAAIdsWithAPDrafts = (state: RootState): string[] => {
  const apDrafts = state.arbeitsauftraegeDrafts?.apDrafts ?? {};
  const apDeletions = state.arbeitsauftraegeDrafts?.apDeletions ?? {};
  const aaIds = new Set<string>();
  for (const draft of Object.values(apDrafts)) {
    if (draft.aaId) aaIds.add(draft.aaId);
  }
  for (const aaId of Object.values(apDeletions)) {
    aaIds.add(aaId);
  }
  return [...aaIds];
};
