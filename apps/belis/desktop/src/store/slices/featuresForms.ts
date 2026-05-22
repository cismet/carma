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
  fetchedData?: Record<string, unknown>;
  isCreation?: boolean;
  geometry?: GeoJSON.Geometry;
  geometryKey?: string;
  // Original WGS84 point from the picked Standort, kept lossless for the
  // sibling `geometry` SaveObject parameter sent when saving a new Leuchte
  // bound to an existing Standort. Unset for measurement-derived geometries.
  geometryWgs84?: { type: "Point"; coordinates: [number, number] };
  // Geometry key seeded at creation (e.g. linked Standort for a new Leuchte).
  // Frozen — used to highlight Neue Geometrien green while still in sync.
  prefillGeometryKey?: string;
  // Label captured at "+ Leuchte" click time for the linked Standort
  // (e.g. "Standort 4"). Stored at the top level — not on `feature.properties` —
  // so downstream writers that replace `feature.properties` wholesale can't
  // wipe it.
  linkedStandortLabel?: string;
  // Label of the measurement a creation draft was built from (e.g. "P4").
  // The measurement is deleted from the store the moment it's assigned, so
  // its dropdown option is gone — this stashed label lets the Neue Geometrien
  // selector still show a human label. Mirrors `linkedStandortLabel`.
  measurementLabel?: string;
  updatedAt: number;
}

export const isCreationDraftKey = (featureId: string): boolean =>
  featureId.startsWith("create:");

// A request to focus a specific form tab of an open draft, raised when the
// user clicks a nested row in the "Entwürfe" sidebar (the Standort parent or
// one of its Leuchten children). `nonce` makes each request distinct so the
// form re-applies it even when the same tab is requested twice in a row.
export interface TabFocusRequest {
  draftKey: string;
  tabKey: string;
  nonce: number;
}

interface FeaturesFormsState {
  drafts: Record<string, Draft>;
  originalValues: Record<string, Record<string, unknown>>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  globalEditMode: boolean;
  tabFocusRequest: TabFocusRequest | null;
}

const initialState: FeaturesFormsState = {
  drafts: {},
  originalValues: {},
  loading: {},
  errors: {},
  globalEditMode: false,
  tabFocusRequest: null,
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
        fetchedData?: Record<string, unknown>;
        isCreation?: boolean;
        geometry?: GeoJSON.Geometry;
        geometryKey?: string;
        geometryWgs84?: { type: "Point"; coordinates: [number, number] };
        prefillGeometryKey?: string;
        linkedStandortLabel?: string;
        measurementLabel?: string;
      }>
    ) {
      const {
        featureId,
        featureType,
        values,
        feature,
        fetchedData,
        isCreation,
        geometry,
        geometryKey,
        geometryWgs84,
        prefillGeometryKey,
        linkedStandortLabel,
        measurementLabel,
      } = action.payload;
      const existing = state.drafts[featureId];
      const hasFiles = existing?.files && existing.files.length > 0;
      const hasRemovedKeys =
        existing?.removedDocumentKeys &&
        existing.removedDocumentKeys.length > 0;
      const creationDraft = existing?.isCreation ?? isCreation;

      if (creationDraft && existing) {
        const allEmpty = Object.values(values).every(
          (v) => v === null || v === undefined || v === ""
        );
        if (allEmpty && !hasFiles && !hasRemovedKeys && !geometry) {
          delete state.drafts[featureId];
          return;
        }
      } else {
        const original = state.originalValues[featureId];
        if (
          original &&
          !hasFiles &&
          !hasRemovedKeys &&
          !isFormDirty(original, values)
        ) {
          delete state.drafts[featureId];
          return;
        }
      }

      state.drafts[featureId] = {
        featureType,
        values,
        files: existing?.files ?? [],
        removedDocumentKeys: existing?.removedDocumentKeys,
        feature: feature ?? existing?.feature,
        fetchedData: fetchedData ?? existing?.fetchedData,
        isCreation: creationDraft,
        geometry: geometry ?? existing?.geometry,
        geometryKey: geometryKey ?? existing?.geometryKey,
        // Use explicit-key semantics (not `??`) so a geometry switch that
        // omits the new field can clear stale Standort coords on a draft
        // that was switched to a measurement-derived geometry.
        geometryWgs84:
          "geometryWgs84" in action.payload
            ? geometryWgs84
            : existing?.geometryWgs84,
        prefillGeometryKey:
          existing?.prefillGeometryKey ?? prefillGeometryKey,
        linkedStandortLabel:
          linkedStandortLabel ?? existing?.linkedStandortLabel,
        measurementLabel:
          measurementLabel ?? existing?.measurementLabel,
        updatedAt: Date.now(),
      };
    },
    removeDraft(state, action: PayloadAction<string>) {
      delete state.drafts[action.payload];
    },
    // Explicitly clear the geometry of a creation draft (the only way to
    // unset; setDraft uses `geometry ?? existing.geometry` and can't clear).
    clearDraftGeometry(
      state,
      action: PayloadAction<{
        featureId: string;
        feature?: any;
        fetchedData?: Record<string, unknown>;
      }>
    ) {
      const { featureId, feature, fetchedData } = action.payload;
      const d = state.drafts[featureId];
      if (!d) return;
      d.geometry = undefined;
      d.geometryKey = undefined;
      d.geometryWgs84 = undefined;
      d.linkedStandortLabel = undefined;
      d.measurementLabel = undefined;
      if (feature !== undefined) d.feature = feature;
      if (fetchedData !== undefined) d.fetchedData = fetchedData;
      d.updatedAt = Date.now();
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
        fetchedData?: Record<string, unknown>;
      }>
    ) {
      const { featureId, featureType, files, feature, fetchedData } =
        action.payload;
      const existing = state.drafts[featureId];
      if (existing) {
        existing.files = files;
        existing.feature = feature ?? existing.feature;
        existing.fetchedData = fetchedData ?? existing.fetchedData;
        existing.updatedAt = Date.now();
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
          fetchedData,
          isCreation: isCreationDraftKey(featureId) ? true : undefined,
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
    // Ask the open draft's form to switch to `tabKey`. The bumped `nonce` lets
    // FeatureFormLayout treat every dispatch as a fresh request.
    requestDraftTabFocus(
      state,
      action: PayloadAction<{ draftKey: string; tabKey: string }>
    ) {
      state.tabFocusRequest = {
        draftKey: action.payload.draftKey,
        tabKey: action.payload.tabKey,
        nonce: (state.tabFocusRequest?.nonce ?? 0) + 1,
      };
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
        fetchedData?: Record<string, unknown>;
      }>
    ) {
      const { featureId, featureType, keys, feature, fetchedData } =
        action.payload;
      const existing = state.drafts[featureId];
      if (existing) {
        existing.removedDocumentKeys = keys;
        existing.feature = feature ?? existing.feature;
        existing.fetchedData = fetchedData ?? existing.fetchedData;
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
          fetchedData,
          isCreation: isCreationDraftKey(featureId) ? true : undefined,
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
  clearDraftGeometry,
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
  requestDraftTabFocus,
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

export const getFormError = (state: RootState, featureId: string | undefined) =>
  featureId ? state.featuresForms?.errors[featureId] ?? null : null;

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
    .map(([, draft]) => ({
      featureType: draft.featureType,
      feature: draft.feature,
    }));
};

// Get count of drafts that have a stored feature
export const getGlobalEditMode = (state: RootState): boolean =>
  state.featuresForms?.globalEditMode ?? false;

export const getDraftFeaturesCount = (state: RootState) =>
  Object.values(state.featuresForms?.drafts ?? {}).filter(
    (d) => d.feature != null
  ).length;

// Get cached fetched data from a draft (avoids re-fetching on draft re-selection)
export const getDraftFetchedData = (
  state: RootState,
  featureId: string | undefined
): Record<string, unknown> | undefined =>
  featureId ? state.featuresForms?.drafts[featureId]?.fetchedData : undefined;

// Get all feature IDs that have actual changes (not just drafts)
export const getChangedDraftIds = (state: RootState): string[] => {
  const drafts = state.featuresForms?.drafts ?? {};
  const originals = state.featuresForms?.originalValues ?? {};
  return Object.entries(drafts)
    .filter(([id, draft]) => isFormDirty(originals[id], draft.values))
    .map(([id]) => id);
};

export const getCreationDrafts = (state: RootState): Draft[] =>
  Object.values(state.featuresForms?.drafts ?? {}).filter(
    (d) => d.isCreation === true
  );

export const getCreationDraftsByType = (
  state: RootState,
  featureType: string
): { featureId: string; draft: Draft }[] => {
  const drafts = state.featuresForms?.drafts ?? {};
  return Object.entries(drafts)
    .filter(([, d]) => d.isCreation === true && d.featureType === featureType)
    .map(([featureId, draft]) => ({ featureId, draft }));
};

export const getTabFocusRequest = (
  state: RootState
): TabFocusRequest | null => state.featuresForms?.tabFocusRequest ?? null;

export const getCreationDraftsCount = (state: RootState): number =>
  Object.values(state.featuresForms?.drafts ?? {}).filter(
    (d) => d.isCreation === true
  ).length;
