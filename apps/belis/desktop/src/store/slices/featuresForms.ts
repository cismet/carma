import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { isFormDirty } from "../../components/ui/featuresForm/formDiffUtils";
import type { DokumentItem } from "../../components/ui/DocumentPreview";

export interface DraftFile {
  id: string;
  fileName: string;
  originalFileName: string;
  base64Data: string;
  mimeType: string;
  size: number;
}

export interface Draft {
  featureType: string;
  values: Record<string, unknown>;
  files?: DraftFile[];
  removedDocumentKeys?: string[];
  existingDocuments?: DokumentItem[];
  featureDbId?: number;
  feature?: any;
  updatedAt: number;
}

interface FeaturesFormsState {
  drafts: Record<string, Draft>;
  originalValues: Record<string, Record<string, unknown>>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  globalEditMode: boolean;
}

const initialState: FeaturesFormsState = {
  drafts: {},
  originalValues: {},
  loading: {},
  errors: {},
  globalEditMode: false,
};

const featuresFormsSlice = createSlice({
  name: "featuresForms",
  initialState,
  reducers: {
    setDraft(
      state,
      action: PayloadAction<{
        featureId: string;
        featureType: string;
        values: Record<string, unknown>;
        feature?: any;
      }>
    ) {
      const { featureId, featureType, values, feature } = action.payload;
      const existing = state.drafts[featureId];
      const hasFiles = existing?.files && existing.files.length > 0;
      const hasRemovedKeys =
        existing?.removedDocumentKeys &&
        existing.removedDocumentKeys.length > 0;
      const original = state.originalValues[featureId];

      // Clean up draft when values reverted to original and no files/removed keys
      if (
        original &&
        !hasFiles &&
        !hasRemovedKeys &&
        !isFormDirty(original, values)
      ) {
        delete state.drafts[featureId];
        return;
      }

      state.drafts[featureId] = {
        featureType,
        values,
        files: existing?.files ?? [],
        removedDocumentKeys: existing?.removedDocumentKeys,
        feature: feature ?? existing?.feature,
        updatedAt: Date.now(),
      };
    },
    removeDraft(state, action: PayloadAction<string>) {
      delete state.drafts[action.payload];
    },
    clearAllDrafts(state) {
      state.drafts = {};
      state.originalValues = {};
    },
    setFormLoading(
      state,
      action: PayloadAction<{ featureId: string; loading: boolean }>
    ) {
      const { featureId, loading } = action.payload;
      state.loading[featureId] = loading;
    },
    setFormError(
      state,
      action: PayloadAction<{ featureId: string; error: string | null }>
    ) {
      const { featureId, error } = action.payload;
      state.errors[featureId] = error;
    },
    clearFormError(state, action: PayloadAction<string>) {
      delete state.errors[action.payload];
    },
    setOriginalValues(
      state,
      action: PayloadAction<{
        featureId: string;
        values: Record<string, unknown>;
      }>
    ) {
      const { featureId, values } = action.payload;
      state.originalValues[featureId] = values;
      // Clean up orphaned originalValues that have no corresponding draft
      for (const id of Object.keys(state.originalValues)) {
        if (id !== featureId && !state.drafts[id]) {
          delete state.originalValues[id];
        }
      }
    },
    setDraftFiles(
      state,
      action: PayloadAction<{
        featureId: string;
        featureType: string;
        files: DraftFile[];
        feature?: any;
      }>
    ) {
      const { featureId, featureType, files, feature } = action.payload;
      const existing = state.drafts[featureId];
      if (existing) {
        existing.files = files;
        existing.feature = feature ?? existing.feature;
        existing.updatedAt = Date.now();
        // Clean up ghost draft when files emptied, no form values, and no removed keys
        if (
          files.length === 0 &&
          Object.keys(existing.values).length === 0 &&
          (!existing.removedDocumentKeys ||
            existing.removedDocumentKeys.length === 0)
        ) {
          delete state.drafts[featureId];
        }
      } else if (files.length > 0) {
        state.drafts[featureId] = {
          featureType,
          values: {},
          files,
          feature,
          updatedAt: Date.now(),
        };
      }
    },
    setDraftDocumentsInfo(
      state,
      action: PayloadAction<{
        featureId: string;
        existingDocuments: DokumentItem[];
        featureDbId: number;
      }>
    ) {
      const { featureId, existingDocuments, featureDbId } = action.payload;
      const existing = state.drafts[featureId];
      if (existing) {
        existing.existingDocuments = existingDocuments;
        existing.featureDbId = featureDbId;
      }
    },
    setGlobalEditMode(state, action: PayloadAction<boolean>) {
      state.globalEditMode = action.payload;
    },
    toggleGlobalEditMode(state) {
      state.globalEditMode = !state.globalEditMode;
    },
    setRemovedDocumentKeys(
      state,
      action: PayloadAction<{
        featureId: string;
        featureType: string;
        keys: string[];
        feature?: any;
      }>
    ) {
      const { featureId, featureType, keys, feature } = action.payload;
      const existing = state.drafts[featureId];
      if (existing) {
        existing.removedDocumentKeys = keys;
        existing.feature = feature ?? existing.feature;
        existing.updatedAt = Date.now();
        // Clean up ghost draft when no removed keys, no form values, and no files
        if (
          keys.length === 0 &&
          Object.keys(existing.values).length === 0 &&
          (!existing.files || existing.files.length === 0)
        ) {
          delete state.drafts[featureId];
        }
      } else if (keys.length > 0) {
        state.drafts[featureId] = {
          featureType,
          values: {},
          removedDocumentKeys: keys,
          feature,
          updatedAt: Date.now(),
        };
      }
    },
  },
});

export default featuresFormsSlice;

export const {
  setDraft,
  removeDraft,
  clearAllDrafts,
  setFormLoading,
  setFormError,
  clearFormError,
  setOriginalValues,
  setDraftFiles,
  setDraftDocumentsInfo,
  setRemovedDocumentKeys,
  setGlobalEditMode,
  toggleGlobalEditMode,
} = featuresFormsSlice.actions;

// Selectors
export const getDraft = (state: RootState, featureId: string | undefined) =>
  featureId ? state.featuresForms?.drafts[featureId] : undefined;

export const hasDraft = (state: RootState, featureId: string | undefined) =>
  featureId ? featureId in (state.featuresForms?.drafts ?? {}) : false;

export const getAllDraftIds = (state: RootState) =>
  Object.keys(state.featuresForms?.drafts ?? {});

export const getFormLoading = (
  state: RootState,
  featureId: string | undefined
) => (featureId ? state.featuresForms?.loading[featureId] ?? false : false);

export const getFormError = (
  state: RootState,
  featureId: string | undefined
) => (featureId ? state.featuresForms?.errors[featureId] ?? null : null);

export const getOriginalValues = (
  state: RootState,
  featureId: string | undefined
): Record<string, unknown> | undefined =>
  featureId ? state.featuresForms?.originalValues[featureId] : undefined;

export const getDraftFiles = (
  state: RootState,
  featureId: string | undefined
): DraftFile[] =>
  featureId ? state.featuresForms?.drafts[featureId]?.files ?? [] : [];

export const getRemovedDocumentKeys = (
  state: RootState,
  featureId: string | undefined
): string[] =>
  featureId
    ? state.featuresForms?.drafts[featureId]?.removedDocumentKeys ?? []
    : [];

export const getDraftExistingDocuments = (
  state: RootState,
  featureId: string | undefined
): DokumentItem[] =>
  featureId
    ? state.featuresForms?.drafts[featureId]?.existingDocuments ?? []
    : [];

export const getAllDrafts = (state: RootState): Record<string, Draft> =>
  state.featuresForms?.drafts ?? {};

// Check if a specific draft has actual changes compared to its original values
export const hasDraftChanges = (
  state: RootState,
  featureId: string | undefined
): boolean => {
  if (!featureId) return false;
  const draft = state.featuresForms?.drafts[featureId];
  if (!draft) return false;
  if (draft.files && draft.files.length > 0) return true;
  if (draft.removedDocumentKeys && draft.removedDocumentKeys.length > 0)
    return true;
  const original = state.featuresForms?.originalValues[featureId];
  if (!original) return true;
  return isFormDirty(original, draft.values);
};

// Check if any draft across all features has actual changes
export const hasAnyDraftChanges = (state: RootState): boolean => {
  const drafts = state.featuresForms?.drafts ?? {};
  const originals = state.featuresForms?.originalValues ?? {};
  return Object.entries(drafts).some(([id, draft]) =>
    isFormDirty(originals[id], draft.values)
  );
};

// Get all draft features with their featureType (form key).
// The featureType is always reliably set when the draft is created;
// the stored feature's carmaInfo.sourceLayer may be stale or missing.
export const getAllDraftFeatures = (state: RootState) => {
  const drafts = state.featuresForms?.drafts ?? {};
  return Object.entries(drafts)
    .filter(([, draft]) => draft.feature != null)
    .map(([, draft]) => ({ featureType: draft.featureType, feature: draft.feature }));
};

// Get count of drafts that have a stored feature
export const getGlobalEditMode = (state: RootState): boolean =>
  state.featuresForms?.globalEditMode ?? false;

export const getDraftFeaturesCount = (state: RootState) =>
  Object.values(state.featuresForms?.drafts ?? {}).filter((d) => d.feature != null).length;

// Get all feature IDs that have actual changes (not just drafts)
export const getChangedDraftIds = (state: RootState): string[] => {
  const drafts = state.featuresForms?.drafts ?? {};
  const originals = state.featuresForms?.originalValues ?? {};
  return Object.entries(drafts)
    .filter(([id, draft]) => isFormDirty(originals[id], draft.values))
    .map(([id]) => id);
};
