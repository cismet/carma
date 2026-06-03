import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { isFormDirtyManaged } from "../../components/ui/featuresForm/formDiffUtils";
import type { DokumentItem } from "../../components/ui/DocumentPreview";

export interface DraftFile {
  id: string;
  fileName: string;
  originalFileName: string;
  base64Data: string;
  mimeType: string;
  size: number;
}

// Numeric DB ids of original (vector-tile) features that should be hidden
// from the regular Fachobjekte layers while a creation draft is open — keyed
// by MapLibre source-layer (e.g. "standorte", "leuchten").
export type HiddenOriginalIds = Partial<Record<string, number[]>>;

// Slim projection of an existing Leuchte on the parent Standort of a "+ Leuchte
// zu Standort N" creation draft. Captured from the server-side mast fetch
// (`tdta_standort_mast_by_id`) so the Entwürfe sidebar can render one row per
// bestand Leuchte under the draft cluster, and clicking a row focuses the
// matching read-only tab in LeuchteForm. `tabKey` is the single source of
// truth shared with the form to keep the two views aligned.
export interface BestandLeuchteEntry {
  id: number;
  tabKey: string;
  leuchtennummer?: number | string;
  leuchtentyp?: string;
  fabrikat?: string;
  lfd_nummer?: number | string;
  strasse?: string;
}

export interface Draft {
  featureType: string;
  values: Record<string, unknown>;
  files?: DraftFile[];
  removedDocumentKeys?: string[];
  existingDocuments?: DokumentItem[];
  featureDbId?: number;
  // Id of the existing feature's `geom` record, captured at draft-open time.
  // The geometry-edit save updates this same geom row in place (preserving the
  // feature's identity) instead of POSTing a new feature — see saveFeatureDraft.
  featureGeomId?: number;
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
  // Stashed as a fallback for the edge case where the user deletes the
  // underlying measurement via terra-draw while it's attached — the
  // measurement is normally kept in the measurements slice while attached
  // (just hidden from terra-draw), so the dropdown sources its label from
  // there. Mirrors `linkedStandortLabel`.
  measurementLabel?: string;
  // Original Fachobjekt ids (by source-layer) to suppress on the regular
  // vector-tile layers while this draft exists — e.g. the parent Standort id
  // captured at "+ Leuchte zu Standort N" time. On discard the ids vanish
  // with the draft; on save they are promoted to
  // `permanentlyHiddenOriginalIds` so the saved feature in the brandnew layer
  // takes over without flicker.
  hiddenOriginalIds?: HiddenOriginalIds;
  // Existing siblings on the parent Standort, mirrored here from the LeuchteForm
  // mast fetch so the Entwürfe sidebar can list them under this draft.
  bestandLeuchten?: BestandLeuchteEntry[];
  // Count of Bestand Leuchten on the parent Standort. Seeded at draft-open time
  // from the Standort tile's `leuchten_count` (authoritative server-side count)
  // and refreshed by setDraftBestandLeuchten once the mast fetch's deduped
  // array is in. Drives the brandnew icon's dot count so a "+ Leuchte zu
  // Standort N" draft renders with `bestand + 1 + extras` dots.
  bestandLeuchtenCount?: number;
  // "Leitung verlängern" flow: marks an extension draft (still rendered through
  // the creation-draft path, so `isCreation` is also true). Carries the source
  // Leitung's id and its original LineString in EPSG:25832 so the geometry
  // selector can recompute the merged line on every pick / clear.
  // isExtension?: boolean;
  // extendingLeitungId?: number;
  // // Id of the existing Leitung's `geom` record. Carried on the draft so the
  // // save flow can update the same geom row (preserving the Leitung's id)
  // // instead of POSTing a brand-new feature with id: -1.
  // extendingGeomId?: number;
  // originalGeometryEpsg25832?: GeoJSON.Geometry;
  updatedAt: number;
}

// Synthetic-draft key check. Matches both plain creation drafts (`create:…`)
// and "Leitung verlängern" extension drafts (`extend:leitung:…`) — both are
// synthetic, have no real DB record to fetch, and should follow the
// creation-draft code paths (synthetic fetchedData, parent-selection capture,
// info-box override). Real Fachobjekt selections use numeric ids.
export const isCreationDraftKey = (featureId: string): boolean =>
  featureId.startsWith("create:");
// featureId.startsWith("create:") || featureId.startsWith("extend:");

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
  // Source-layer keyed Set-like list of original Fachobjekt ids that must
  // stay hidden from the regular vector tiles even after the draft that
  // referenced them is gone (i.e. the draft was saved, not discarded). Cleared
  // explicitly via clearPermanentlyHiddenOriginalIds.
  permanentlyHiddenOriginalIds: HiddenOriginalIds;
  // Source-layer keyed ids of geometry-edited features whose *brandnew FC*
  // copy must stay hidden in the gap between a save and the next brandnew poll
  // refresh. Unlike `permanentlyHiddenOriginalIds` (which hides only vector
  // tiles), this hides the brandnew layer copy at the now-stale OLD position
  // until the refetched FC carries the new geometry — then it is cleared. Not
  // persisted (see store persist whitelist) since it only bridges a brief gap.
  brandnewSuppressedEditIds: HiddenOriginalIds;
}

const initialState: FeaturesFormsState = {
  drafts: {},
  originalValues: {},
  loading: {},
  errors: {},
  globalEditMode: false,
  tabFocusRequest: null,
  permanentlyHiddenOriginalIds: {},
  brandnewSuppressedEditIds: {},
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
        featureGeomId?: number;
        geometry?: GeoJSON.Geometry;
        geometryKey?: string;
        geometryWgs84?: { type: "Point"; coordinates: [number, number] };
        prefillGeometryKey?: string;
        linkedStandortLabel?: string;
        measurementLabel?: string;
        hiddenOriginalIds?: HiddenOriginalIds;
        bestandLeuchtenCount?: number;
        // isExtension?: boolean;
        // extendingLeitungId?: number;
        // extendingGeomId?: number;
        // originalGeometryEpsg25832?: GeoJSON.Geometry;
      }>
    ) {
      const {
        featureId,
        featureType,
        values,
        feature,
        fetchedData,
        isCreation,
        featureGeomId,
        geometry,
        geometryKey,
        geometryWgs84,
        prefillGeometryKey,
        linkedStandortLabel,
        measurementLabel,
        hiddenOriginalIds,
        bestandLeuchtenCount,
        // isExtension,
        // extendingLeitungId,
        // extendingGeomId,
        // originalGeometryEpsg25832,
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
        // A geometry-only edit (picked a measurement, no field changes) must
        // keep the draft alive — otherwise the form-dirty check below would
        // delete the draft we just created to hold the new geometry. The
        // selected key differs from the feature's own ("current.") geometry.
        const effectiveGeometryKey = geometryKey ?? existing?.geometryKey;
        const hasGeometryChange =
          !!effectiveGeometryKey &&
          !effectiveGeometryKey.startsWith("current.");
        if (
          original &&
          !hasFiles &&
          !hasRemovedKeys &&
          !hasGeometryChange &&
          !isFormDirtyManaged(original, values)
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
        // Captured once at draft-open and frozen — later setDraft calls (form
        // edits) must not clear the geom-row id the in-place save needs.
        featureGeomId: existing?.featureGeomId ?? featureGeomId,
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
        // Captured at draft-open time and frozen — later setDraft calls
        // (e.g. form edits) must not overwrite or clear this.
        hiddenOriginalIds:
          existing?.hiddenOriginalIds ?? hiddenOriginalIds,
        // Preserved across setDraft replacements; updated only via
        // setDraftBestandLeuchten when the parent mast fetch resolves.
        bestandLeuchten: existing?.bestandLeuchten,
        // Seeded by useCreateFeatureDraft from the linked Standort tile's
        // `leuchten_count`; refreshed by setDraftBestandLeuchten once the
        // mast fetch resolves. Preserved across later setDraft calls (form
        // edits) so the icon stays correct.
        bestandLeuchtenCount:
          existing?.bestandLeuchtenCount ?? bestandLeuchtenCount,
        // Frozen at extension-draft creation; later setDraft calls (geometry
        // change, form edits) must not overwrite or clear these.
        // isExtension: existing?.isExtension ?? isExtension,
        // extendingLeitungId:
        //   existing?.extendingLeitungId ?? extendingLeitungId,
        // extendingGeomId: existing?.extendingGeomId ?? extendingGeomId,
        // originalGeometryEpsg25832:
        //   existing?.originalGeometryEpsg25832 ?? originalGeometryEpsg25832,
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
    // Move a draft's `hiddenOriginalIds` into the persistent
    // `permanentlyHiddenOriginalIds` set. Dispatched right before removeDraft
    // in save flows so the saved feature stays hidden in the regular layers
    // until the brandnew tile (or the user explicitly unhides) replaces it.
    promoteDraftHiddenToPermanent(state, action: PayloadAction<string>) {
      const featureId = action.payload;
      const draft = state.drafts[featureId];
      const addPermanent = (sourceLayer: string, idList: number[]) => {
        if (!sourceLayer || idList.length === 0) return;
        const existing = state.permanentlyHiddenOriginalIds[sourceLayer] ?? [];
        const merged = new Set<number>(existing);
        for (const id of idList) merged.add(id);
        state.permanentlyHiddenOriginalIds[sourceLayer] = [...merged];
      };
      const ids = draft?.hiddenOriginalIds;
      if (ids) {
        for (const [sourceLayer, idList] of Object.entries(ids)) {
          if (idList && idList.length > 0) addPermanent(sourceLayer, idList);
        }
      }
      // Geometry-edit drafts (an existing feature reshaped to a measurement)
      // hide their original tile via a *computed* set (geometryEditHiddenOriginalIds
      // in BelisMapWrapper, derived from the open draft's geometryKey) rather
      // than the stored `hiddenOriginalIds` above. That computed set vanishes the
      // moment the draft is removed on save, so the original tile would pop back at
      // the old position until the next brandnew refresh. Promote the draft's own
      // id here — same as the Standort/Leuchte creation path — so the vector tile
      // stays hidden; the permanent set never suppresses the brandnew layer, so the
      // saved feature still renders at its new position.
      if (
        draft &&
        !draft.isCreation &&
        draft.geometryKey &&
        draft.geometryKey.startsWith("measurement.")
      ) {
        // Draft key is "<sourceLayer>:<dbPK>" (e.g. "mauerlaschen:6691"); the
        // prefix is the tile source layer the filter keys on.
        const sourceLayer = featureId.split(":")[0];
        const dbId = draft.featureDbId ?? Number(featureId.split(":")[1]);
        if (sourceLayer && Number.isFinite(dbId)) {
          addPermanent(sourceLayer, [Number(dbId)]);
          // Also suppress the feature's stale brandnew-FC copy (old position)
          // until the next poll delivers the new geometry. Cleared by
          // clearBrandnewSuppressedEditIds when the refreshed FC lands.
          const existing = state.brandnewSuppressedEditIds[sourceLayer] ?? [];
          const merged = new Set<number>(existing);
          merged.add(Number(dbId));
          state.brandnewSuppressedEditIds[sourceLayer] = [...merged];
        }
      }
    },
    // Clear the brandnew-FC suppression set. Dispatched once a refreshed
    // brandnew FeatureCollection arrives so the just-moved feature shows at its
    // new position instead of staying hidden.
    clearBrandnewSuppressedEditIds(state) {
      if (Object.keys(state.brandnewSuppressedEditIds).length > 0) {
        state.brandnewSuppressedEditIds = {};
      }
    },
    // Drop specific ids from the persistent hidden set (e.g. "show this
    // Standort again"). No-op when the source-layer has no entry.
    unhidePermanentOriginalIds(
      state,
      action: PayloadAction<{ sourceLayer: string; ids: number[] }>
    ) {
      const { sourceLayer, ids } = action.payload;
      const existing = state.permanentlyHiddenOriginalIds[sourceLayer];
      if (!existing || existing.length === 0) return;
      const drop = new Set(ids);
      const next = existing.filter((id) => !drop.has(id));
      if (next.length === 0) delete state.permanentlyHiddenOriginalIds[sourceLayer];
      else state.permanentlyHiddenOriginalIds[sourceLayer] = next;
    },
    clearPermanentlyHiddenOriginalIds(state) {
      state.permanentlyHiddenOriginalIds = {};
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
    // Mirror the parent Standort's existing Leuchten onto the draft so the
    // Entwürfe sidebar can render them as read-only rows under this draft's
    // cluster. Written by LeuchteForm when its mast fetch resolves; cleared
    // when the array is empty so a re-open with a different Standort doesn't
    // leak stale entries. No-op when the draft is gone (e.g. already
    // discarded between the fetch start and resolve).
    setDraftBestandLeuchten(
      state,
      action: PayloadAction<{
        featureId: string;
        bestandLeuchten: BestandLeuchteEntry[];
      }>
    ) {
      const { featureId, bestandLeuchten } = action.payload;
      const draft = state.drafts[featureId];
      if (!draft) return;
      if (bestandLeuchten.length === 0) {
        if (draft.bestandLeuchten) delete draft.bestandLeuchten;
      } else {
        draft.bestandLeuchten = bestandLeuchten;
      }
      // Keep the icon-driving count in sync with the deduped array. Always
      // overwrite — the fetch is authoritative once it resolves, replacing
      // the optimistic seed pulled from the tile property.
      draft.bestandLeuchtenCount = bestandLeuchten.length;
      // Patch the count on the live synthetic feature so the brandnew icon
      // layer redraws without waiting for the next form edit. Mirrors the
      // formula in enrichSyntheticProps' leuchte branch: bestand + 1 (the
      // editable "Leuchte 1" slice) + each extra "+" tab.
      const feature = draft.feature as
        | { properties?: Record<string, unknown> }
        | undefined;
      if (
        feature?.properties &&
        (feature.properties as Record<string, unknown>)._featureType ===
          "leuchte"
      ) {
        const extras = (draft.values?.leuchten ?? []) as Array<unknown>;
        feature.properties.leuchten_count =
          bestandLeuchten.length + 1 + extras.length;
      }
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
  setDraftBestandLeuchten,
  toggleGlobalEditMode,
  requestDraftTabFocus,
  promoteDraftHiddenToPermanent,
  unhidePermanentOriginalIds,
  clearPermanentlyHiddenOriginalIds,
  clearBrandnewSuppressedEditIds,
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
// An existing feature whose geometry was switched to a measurement is "dirty"
// even when no form field changed. The feature's own geometry option is keyed
// "current.<id>"; anything else means the user picked a different geometry.
const draftGeometryEdited = (draft: Draft | undefined): boolean =>
  !!draft &&
  !draft.isCreation &&
  !!draft.geometryKey &&
  !draft.geometryKey.startsWith("current.");

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
  if (draftGeometryEdited(draft)) return true;
  const original = state.featuresForms?.originalValues[featureId];
  if (!original) return true;
  return isFormDirtyManaged(original, draft.values);
};

// Check if any draft across all features has actual changes
export const hasAnyDraftChanges = (state: RootState): boolean => {
  const drafts = state.featuresForms?.drafts ?? {};
  const originals = state.featuresForms?.originalValues ?? {};
  return Object.entries(drafts).some(
    ([id, draft]) =>
      (draft.files?.length ?? 0) > 0 ||
      (draft.removedDocumentKeys?.length ?? 0) > 0 ||
      isFormDirtyManaged(originals[id], draft.values) ||
      draftGeometryEdited(draft)
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
    .filter(
      ([id, draft]) =>
        (draft.files?.length ?? 0) > 0 ||
        (draft.removedDocumentKeys?.length ?? 0) > 0 ||
        isFormDirtyManaged(originals[id], draft.values) ||
        draftGeometryEdited(draft)
    )
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

export const getPermanentlyHiddenOriginalIds = (
  state: RootState
): HiddenOriginalIds =>
  state.featuresForms?.permanentlyHiddenOriginalIds ?? {};

export const getBrandnewSuppressedEditIds = (
  state: RootState
): HiddenOriginalIds => state.featuresForms?.brandnewSuppressedEditIds ?? {};

// Union of every draft's hiddenOriginalIds plus the permanent set — keyed
// by source-layer. The map filter effect consumes this to exclude vector
// tile features whose `id` matches.
export const getEffectiveHiddenOriginalIds = (
  state: RootState
): HiddenOriginalIds => {
  const drafts = state.featuresForms?.drafts ?? {};
  const permanent = state.featuresForms?.permanentlyHiddenOriginalIds ?? {};
  const merged: Record<string, Set<number>> = {};
  const add = (sourceLayer: string, ids: number[]) => {
    const bucket = merged[sourceLayer] ?? (merged[sourceLayer] = new Set());
    for (const id of ids) bucket.add(id);
  };
  for (const [sourceLayer, ids] of Object.entries(permanent)) {
    if (ids && ids.length) add(sourceLayer, ids);
  }
  for (const draft of Object.values(drafts)) {
    const ids = draft.hiddenOriginalIds;
    if (!ids) continue;
    for (const [sourceLayer, list] of Object.entries(ids)) {
      if (list && list.length) add(sourceLayer, list);
    }
  }
  const out: HiddenOriginalIds = {};
  for (const [sourceLayer, set] of Object.entries(merged)) {
    if (set.size > 0) out[sourceLayer] = [...set];
  }
  return out;
};

export const getCreationDraftsCount = (state: RootState): number =>
  Object.values(state.featuresForms?.drafts ?? {}).filter(
    (d) => d.isCreation === true
  ).length;
