import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { Modal, message, Select } from "antd";
import { featureFormRegistry } from "./index";
import {
  getSelectedFeature,
  getFeatureDataVersion,
  incrementFeatureDataVersion,
} from "../../../store/slices/featureCollection";
import {
  getDraft,
  getDraftFiles,
  getRemovedDocumentKeys,
  setDraft,
  setDraftFiles,
  setDraftDocumentsInfo,
  setRemovedDocumentKeys,
  setPendingDeletion,
  markFeatureDeleted,
  recordLeuchteDeletionForStandort,
  removeDraft,
  clearDraftGeometry,
  setOriginalValues,
  getOriginalValues,
  hasDraftChanges,
  getGlobalEditMode,
  isCreationDraftKey,
  getAllDrafts,
  promoteDraftHiddenToPermanent,
} from "../../../store/slices/featuresForms";
import { getJWT, getIsReadOnly } from "../../../store/slices/auth";
import type { DokumentItem } from "../DocumentPreview";
import { ChangedFieldsProvider } from "./DraftFieldHighlight";
import { DeleteFeatureProvider } from "./DeleteFeatureContext";
import { LOCKED_FIELD_CLASSES } from "./readOnlyFormUtils";
import {
  getAllowlistedPaths,
  getCreationDefaults,
  recordSelectionDefaults,
  CREATION_DEFAULTS_ALLOWLIST,
} from "../../../store/slices/creationDefaults";
import type {
  DraftFile,
  BestandLeuchteEntry,
} from "../../../store/slices/featuresForms";
import type { RootState } from "../../../store";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";
import {
  saveFeatureDraft,
  buildStrassenschluesselByPk,
} from "../../../helper/featureFormSaveHelpers";
import { updateDataByClassName } from "../../../helper/apiMethods";
import {
  buildMeasurementGeometryOptions,
  buildCurrentGeometryOption,
  parseStandortIdFromKey,
  STANDORT_OPTION_PREFIX,
  type MeasurementGeometryOption,
} from "../../../helper/geometryOptions";
import {
  getMeasurements,
  setMeasurements,
} from "../../../store/slices/measurements";
import {
  removeMeasurements,
  addMeasurements,
} from "@carma-mapping/measurements";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
  enrichSyntheticProps,
  convertGeometryToWgs84,
} from "../../../helper/buildSyntheticFeature";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { useMapSelection } from "@carma-mapping/engines/maplibre";

interface SingleSaveContext {
  onSaveSingle?: () => Promise<void>;
  savingSingle: boolean;
}

const SingleSaveCtx = createContext<SingleSaveContext>({ savingSingle: false });

export const useSingleSave = () => useContext(SingleSaveCtx);

interface FeaturesFormsWrapperProps {
  featureType?: string;
  data: any;
  rawFeature?: any;
  readOnly?: boolean;
  loading?: boolean;
  onSelectNextDraft?: (removedFeatureId: string) => void;
}

// Map form key to the GraphQL response key used to extract dokumenteArray
const formKeyToGraphqlKey: Record<string, string> = {
  leuchte: "tdta_leuchten",
  standort: "tdta_standort_mast",
  leitung: "leitung",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlasche",
  abzweigdose: "abzweigdose",
};

// Project a Standort's fetched `leuchtenArray` into the slim BestandLeuchteEntry
// rows the sidebar renders. Skips Leuchten already soft-deleted server-side
// (is_deleted), denormalizes the leuchtentyp / strassenschluessel FK objects to
// flat label strings, and keeps the DB `id` so the cascade soft-delete and the
// red pending-deletion styling can key on it. Used when a Standort is marked
// for deletion to capture the children that go with it.
const projectCascadeLeuchten = (
  standortData: unknown
): BestandLeuchteEntry[] => {
  const mast = Array.isArray(standortData)
    ? (standortData[0] as Record<string, unknown> | undefined)
    : undefined;
  const arr = mast?.leuchtenArray;
  if (!Array.isArray(arr)) return [];
  const out: BestandLeuchteEntry[] = [];
  for (const raw of arr) {
    const l = raw as Record<string, unknown>;
    if (l.is_deleted === true) continue;
    const id = Number(l.id);
    if (!Number.isFinite(id)) continue;
    const leuchtentyp = l.tkey_leuchtentyp as
      | Record<string, unknown>
      | null
      | undefined;
    const strasse = l.tkey_strassenschluessel as
      | Record<string, unknown>
      | null
      | undefined;
    out.push({
      id,
      // No form tab to focus — these are display-only deletion rows.
      tabKey: `cascade-${id}`,
      leuchtennummer: l.leuchtennummer as number | string | undefined,
      leuchtentyp: leuchtentyp?.leuchtentyp as string | undefined,
      fabrikat: leuchtentyp?.fabrikat as string | undefined,
      lfd_nummer: l.lfd_nummer as number | string | undefined,
      strasse: strasse?.strasse as string | undefined,
    });
  }
  return out;
};

// Map sourceLayer values to registry keys
const featureTypeToFormKey: Record<string, string> = {
  leuchten: "leuchte",
  tdta_leuchten: "leuchte",
  leitungen: "leitung",
  leitung: "leitung",
  tdta_standort_mast: "standort",
  standort_mast: "standort",
  masten: "standort",
  mast: "standort",
  standorte: "standort",
  schaltstelle: "schaltstelle",
  schaltstellen: "schaltstelle",
  mauerlasche: "mauerlasche",
  mauerlaschen: "mauerlasche",
  abzweigdose: "abzweigdose",
  abzweigdosen: "abzweigdose",
};

const FeaturesFormsWrapper = ({
  featureType,
  data,
  rawFeature,
  readOnly: readOnlyProp = true,
  loading,
  onSelectNextDraft,
}: FeaturesFormsWrapperProps) => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const { selectedFeatureId, selectFeature } = useMapSelection();

  // Creation drafts use their draft key directly as featureId
  const isCreation = rawFeature?.properties?._isCreation === true;
  const creationDraftKey = isCreation
    ? String(rawFeature.properties.id)
    : undefined;

  // Build a composite draft key: "sourceLayer:databasePK".
  // Database PKs alone are not unique across source layers (e.g. Leuchte PK=1
  // vs Standort PK=1 are different features). Including the sourceLayer prevents
  // draft key collisions between feature types.
  const rawPK = rawFeature?.properties?.id;
  const dbPK =
    rawPK != null
      ? String(rawPK)
      : selectedFeature?.id != null
      ? String(selectedFeature.id)
      : undefined;
  const sourceLayer = featureType ?? "";
  const allDrafts = useSelector(getAllDrafts);
  const strictFeatureId =
    creationDraftKey ?? (dbPK != null ? `${sourceLayer}:${dbPK}` : undefined);
  // The datasheet's `featureType` (hence `sourceLayer`) is not stable across
  // selection paths: picking the feature from the sidebar yields its tile
  // source layer (e.g. "mauerlaschen"), but clicking the moved preview point
  // of an open geometry-edit draft on the map yields the brandnew GeoJSON
  // source name instead. The strict "<sourceLayer>:<dbPK>" key built from the
  // latter misses the draft stored under the former, so the geometry selector
  // would fall back to "Momentane Geometrie" even though a measurement is
  // attached. Recover by matching an open non-creation draft on the stable DB
  // id — the same DB-id reconciliation BelisMapWrapper uses for the
  // edit-selection highlight — and adopt its key so reads AND later writes
  // stay on one canonical featureId.
  const featureId = useMemo(() => {
    if (!strictFeatureId || creationDraftKey) return strictFeatureId;
    if (allDrafts[strictFeatureId]) return strictFeatureId;
    if (dbPK == null) return strictFeatureId;
    for (const [key, d] of Object.entries(allDrafts)) {
      if (d.isCreation) continue;
      const draftDbId = d.featureDbId ?? key.split(":")[1];
      if (String(draftDbId) === dbPK) return key;
    }
    return strictFeatureId;
  }, [strictFeatureId, creationDraftKey, allDrafts, dbPK]);

  // Store a serializable snapshot of the raw feature for the draft.
  // MapLibre's MapGeoJSONFeature contains non-serializable objects (layer, state)
  // that don't survive redux-persist round-trips. We keep only the fields the
  // sidebar extractors and draft display actually need.
  const draftFeature = useMemo(() => {
    const f = rawFeature ?? selectedFeature;
    if (!f) return undefined;
    return {
      type: f.type ?? "Feature",
      id: f.id,
      properties: f.properties ?? {},
      geometry: f.geometry,
      sourceLayer: f.sourceLayer ?? sourceLayer,
      source: f.source ?? "",
      layer: {
        id: f.sourceLayer ?? sourceLayer,
        source: f.source ?? "",
        type: "circle" as const,
      },
      state: {},
    };
  }, [rawFeature, selectedFeature, sourceLayer]);
  const draft = useSelector((state: RootState) => getDraft(state, featureId));
  const draftFiles = useSelector((state: RootState) =>
    getDraftFiles(state, featureId)
  );
  const hasChanges = useSelector((state: RootState) =>
    hasDraftChanges(state, featureId)
  );
  const originalValues = useSelector((state: RootState) =>
    getOriginalValues(state, featureId)
  );
  const removedDocKeys = useSelector((state: RootState) =>
    getRemovedDocumentKeys(state, featureId)
  );

  const removedDocumentKeys = useMemo(
    () => new Set(removedDocKeys),
    [removedDocKeys]
  );

  const jwt = useSelector(getJWT) as string | null;
  const featureDataVersion = useSelector(getFeatureDataVersion);
  const globalEditMode = useSelector(getGlobalEditMode);
  const measurements = useSelector(getMeasurements);
  const keyTablesData = useSelector(getKeyTablesData);
  // pk → id map used at save time to backfill a missing fk_strassenschluessel
  // from the visible Strassenschluessel pk (see prepareSaveValues).
  const strassenschluesselByPk = useMemo(
    () =>
      buildStrassenschluesselByPk(
        keyTablesData["straßenschlüssel"] as
          | ReadonlyArray<{ id?: unknown; pk?: unknown }>
          | undefined
      ),
    [keyTablesData]
  );

  // When creating a new Leuchte that's linked to an existing Standort, expose
  // that Standort as a geometry-source option in the dropdown. The link is
  // captured at "+ Leuchte" click time (CreateFeatureDropdown) and persisted
  // on the draft itself, since opening the creation draft replaces
  // selectedFeature in Redux and the original Standort selection is lost.
  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;

  // A Leitung is a LineString; every other BelIS feature is a Point. This
  // drives which measurement geometries the selectors (both creation and
  // geometry edit) are allowed to offer: only LineStrings for a Leitung form,
  // only Points for every other form — a line can't back a point feature and
  // vice versa.
  const featureGeometryType: "Point" | "LineString" =
    formKey === "leitung" ? "LineString" : "Point";

  const standortOption = useMemo<MeasurementGeometryOption | null>(() => {
    if (!isCreation || formKey !== "leuchte") return null;
    const geometryKey = draft?.geometryKey;
    const geometry = draft?.geometry;
    if (!geometryKey || !geometry) return null;
    if (!geometryKey.startsWith(STANDORT_OPTION_PREFIX)) return null;
    const id = parseStandortIdFromKey(geometryKey);
    if (id == null) return null;
    const stashedLabel = draft?.linkedStandortLabel;
    const label =
      typeof stashedLabel === "string" ? stashedLabel : `Standort ${id}`;
    return {
      key: geometryKey,
      label,
      geometry: geometry as MeasurementGeometryOption["geometry"],
      geometryWgs84: draft?.geometryWgs84,
    };
  }, [
    isCreation,
    formKey,
    draft?.geometryKey,
    draft?.geometry,
    draft?.geometryWgs84,
    draft?.linkedStandortLabel,
  ]);

  // Fallback for the edge case where the user deletes the underlying
  // measurement via terra-draw while it's attached to this draft. The
  // attachment normally keeps the measurement in the Redux slice (just
  // hidden from terra-draw) so buildMeasurementGeometryOptions surfaces
  // it; if the user explicitly deletes it, we still want the draft to
  // remain saveable and the dropdown to show a recognizable label, so
  // reconstruct the option from the snapshot stashed on the draft.
  const measurementOption = useMemo<MeasurementGeometryOption | null>(() => {
    const geometryKey = draft?.geometryKey;
    const geometry = draft?.geometry;
    if (!geometryKey || !geometry) return null;
    if (!geometryKey.startsWith("measurement.")) return null;
    // Still in the measurements slice (normal attached state)? Then
    // buildMeasurementGeometryOptions already covers it — only reconstruct
    // for the rare case where the measurement was deleted out from under
    // the draft.
    const stillLive = measurements.some(
      (f) => `measurement.${String(f.id)}` === geometryKey
    );
    if (stillLive) return null;
    return {
      key: geometryKey,
      label: draft?.measurementLabel ?? "Messung",
      geometry: geometry as MeasurementGeometryOption["geometry"],
    };
  }, [
    draft?.geometryKey,
    draft?.geometry,
    draft?.measurementLabel,
    measurements,
  ]);

  // Measurement keys already claimed by other in-progress drafts — each
  // measurement can back at most one feature, so don't offer it again in any
  // other draft's geometry selector. Covers both creation drafts (measurement
  // used as a new feature's geometry) AND geometry-edit drafts (an existing
  // feature reshaped to a measurement); both stash the picked measurement under
  // `geometryKey`, so a measurement consumed by either must disappear from every
  // other selector.
  const consumedByOtherDrafts = useMemo(() => {
    const set = new Set<string>();
    for (const [id, d] of Object.entries(allDrafts)) {
      if (id === featureId) continue;
      const key = d.geometryKey;
      if (key && key.startsWith("measurement.")) set.add(key);
    }
    return set;
  }, [allDrafts, featureId]);

  const geometryOptions = useMemo(() => {
    const measurementOpts = buildMeasurementGeometryOptions(measurements)
      // Only offer measurements of the form's own geometry type: LineStrings
      // for a Leitung, Points for every other feature.
      .filter((o) => o.geometry.type === featureGeometryType)
      .filter((o) => !consumedByOtherDrafts.has(o.key));
    const base = standortOption
      ? [standortOption, ...measurementOpts]
      : measurementOpts;
    // This draft's own assigned-and-deleted measurement, prepended so the
    // Select can render its label and the value-match logic resolves it.
    return measurementOption ? [measurementOption, ...base] : base;
  }, [
    measurements,
    standortOption,
    measurementOption,
    consumedByOtherDrafts,
    featureGeometryType,
  ]);

  // --- Geometry edit ("change an existing feature's shape to a measurement").
  // The feature's own geom row id + geometry are pulled from the fetched DB
  // record; the selector offers "Momentane Geometrie" (the current shape) plus
  // the visible measurements of the matching geometry type — Point measurements
  // for the point features, LineString measurements for Leitungen. Leuchten are
  // deliberately excluded: a Leuchte has no own geometry — it is positioned at
  // its parent Standort's point — so it is moved only via that Standort (which
  // carries the whole mast group with it).
  const GEOMETRY_EDIT_FORM_KEYS = new Set([
    "mauerlasche",
    "schaltstelle",
    "abzweigdose",
    "standort",
    "leitung",
  ]);
  const isGeometryEditFeature =
    !isCreation && !!formKey && GEOMETRY_EDIT_FORM_KEYS.has(formKey);

  const editFeatureRecord = useMemo(() => {
    if (!isGeometryEditFeature || !formKey || !data) return undefined;
    const gqlKey = formKeyToGraphqlKey[formKey];
    const arr = (data as Record<string, unknown>)[gqlKey] as
      | Array<Record<string, unknown>>
      | undefined;
    return arr?.[0];
  }, [isGeometryEditFeature, formKey, data]);

  const featureGeomId = useMemo(() => {
    const geom = editFeatureRecord?.geom as { id?: number } | undefined;
    return typeof geom?.id === "number" ? geom.id : undefined;
  }, [editFeatureRecord]);

  const currentGeometryOption = useMemo<MeasurementGeometryOption | null>(() => {
    if (!isGeometryEditFeature) return null;
    const geom = editFeatureRecord?.geom as
      | { geo_field?: GeoJSON.Geometry }
      | undefined;
    const dbId = (editFeatureRecord?.id as number | undefined) ?? undefined;
    return buildCurrentGeometryOption(geom?.geo_field, dbId);
  }, [isGeometryEditFeature, editFeatureRecord]);

  // Selector options: current shape first, then visible measurements of the
  // feature's own geometry type (Point for the point features, LineString for
  // Leitungen — a point can't reshape a line and vice versa).
  const editGeometryOptions = useMemo<MeasurementGeometryOption[]>(() => {
    if (!isGeometryEditFeature) return [];
    const measurementOpts = buildMeasurementGeometryOptions(measurements)
      .filter((o) => o.geometry.type === featureGeometryType)
      .filter((o) => !consumedByOtherDrafts.has(o.key));
    const opts: MeasurementGeometryOption[] = [];
    if (currentGeometryOption) opts.push(currentGeometryOption);
    // The currently-attached measurement is removed from terra-draw (and the
    // measurements slice) while it backs the draft, so it is absent from
    // measurementOpts. Re-add it from the draft snapshot so the selector can
    // still render its label (e.g. "P9") after re-opening the draft.
    if (measurementOption) opts.push(measurementOption);
    opts.push(...measurementOpts);
    return opts;
  }, [
    isGeometryEditFeature,
    featureGeometryType,
    measurements,
    consumedByOtherDrafts,
    currentGeometryOption,
    measurementOption,
  ]);

  // Are there any geometry options to switch to besides the current shape?
  // Without at least one measurement the selector has nothing to offer, so it
  // is rendered disabled.
  const hasAlternativeGeometryOptions = useMemo(
    () =>
      editGeometryOptions.some((o) => o.key !== currentGeometryOption?.key),
    [editGeometryOptions, currentGeometryOption]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingDeletion = !!draft?.pendingDeletion;
  // A read-only ("Gast") user must never get an editable form — not even a
  // creation form. This overrides the normal creation/editing/globalEditMode
  // logic so no CRUD UI (save buttons, green "+" create button, editable
  // fields) is exposed.
  const isReadOnly = useSelector(getIsReadOnly) as boolean;
  const effectiveReadOnly =
    isReadOnly || (!isCreation && readOnlyProp && !isEditing && !globalEditMode);

  // Exit edit mode when feature data is refetched externally (e.g. Save All).
  // No FormComponent remount here: re-population happens inside *FormFields via
  // a data-identity check, which preserves scroll position and avoids the
  // brief stale-data flicker that a key-bumped remount caused.
  useEffect(() => {
    if (!isCreation) {
      setIsEditing(false);
    }
  }, [featureDataVersion, isCreation]);

  // Set empty original values for creation drafts so all fields appear as "changed"
  useEffect(() => {
    if (isCreation && featureId) {
      dispatch(setOriginalValues({ featureId, values: {} }));
    }
  }, [isCreation, featureId, dispatch]);

  const deserializedDraftValues = useMemo(
    () => (draft?.values ? deserializeValues(draft.values) : undefined),
    [draft?.values]
  );

  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  const allowlistedPaths = useMemo(
    () =>
      isCreation && formKey ? getAllowlistedPaths(formKey) : undefined,
    [isCreation, formKey]
  );

  const currentDefaults = useSelector((state: RootState) =>
    isCreation && formKey ? getCreationDefaults(state, formKey) : undefined
  );

  // Keep draft's existingDocuments and featureDbId in sync with server data.
  // Only updates when a draft already exists (avoids creating ghost drafts).
  // Skip for creation drafts — they have no server data.
  useEffect(() => {
    if (isCreation) return;
    if (!featureId || !formKey || !draft || !data) return;
    const graphqlKey = formKeyToGraphqlKey[formKey];
    if (!graphqlKey) return;
    const dataObj = data as Record<string, unknown>;
    const arr = dataObj[graphqlKey] as
      | Array<Record<string, unknown>>
      | undefined;
    const firstItem = arr?.[0];
    if (!firstItem) return;
    const docs = (firstItem.dokumenteArray as DokumentItem[]) ?? [];
    const dbId = firstItem.id as number | undefined;
    if (dbId != null) {
      dispatch(
        setDraftDocumentsInfo({
          featureId,
          existingDocuments: docs,
          featureDbId: dbId,
        })
      );
    }
  }, [featureId, formKey, data, draft, dispatch, isCreation]);

  // Diagnostic: an edit draft that has NO baseline (originalValues). In this
  // state getChangedPaths() returns nothing (so no field highlights gray) and
  // hasDraftChanges() falls back to "always changed" (so the draft shows
  // "nicht gespeicherte Änderungen" and never auto-discards even when its
  // values match the server and the geometry is "Current"). The baseline is
  // seeded by the *FormFields onOriginalValues effect and can be dropped by the
  // orphan-cleanup in setOriginalValues — this logs when that race bites.
  useEffect(() => {
    if (isCreation) return;
    if (draft && !originalValues) {
      console.warn(
        `xxx [NO-ORIGINAL] feature "${featureId}" (${formKey}) has a draft but NO originalValues baseline — it will never show gray highlights and never auto-discard (hasDraftChanges defaults to true).`,
        {
          featureId,
          formKey,
          geometryKey: draft.geometryKey,
          draftValueKeys: Object.keys(draft.values ?? {}),
        }
      );
    }
  }, [draft, originalValues, isCreation, featureId, formKey]);

  const handleToggleReadOnly = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  // Bring a previously-attached measurement back into terra-draw. The
  // measurement stays in Redux while attached (so the dropdown can render
  // it) but is hidden from terra-draw; releasing the attachment makes it
  // visible and editable again. No-op when there was no prior measurement
  // attachment or its Redux record is gone.
  const restoreAttachedMeasurement = useCallback(
    (geometryKey: string | undefined) => {
      if (!geometryKey || !geometryKey.startsWith("measurement.")) return;
      const feature = measurements.find(
        (f) => `measurement.${String(f.id)}` === geometryKey
      );
      if (!feature) return;
      const rawId = String(feature.id).replace(/^measurement\./, "");
      addMeasurements([{ ...feature, id: rawId }]);
    },
    [measurements]
  );

  const handleCancel = useCallback(() => {
    if (featureId) {
      // Bring any attached measurement back into terra-draw before the
      // draft goes away — discarding the draft must not silently destroy
      // the user's measurement work.
      restoreAttachedMeasurement(draft?.geometryKey);
      dispatch(removeDraft(featureId));
      onSelectNextDraft?.(featureId);
    }
    setIsEditing(false);
  }, [
    featureId,
    dispatch,
    onSelectNextDraft,
    draft?.geometryKey,
    restoreAttachedMeasurement,
  ]);

  const handleSaveComplete = useCallback(() => {
    if (featureId) {
      // Update baseline to the saved values so subsequent edits highlight correctly.
      // Skip when draft.values is empty (file-only saves) to avoid wiping the
      // proper baseline with {} – that would break dirty-field detection.
      if (draft?.values && Object.keys(draft.values).length > 0) {
        dispatch(setOriginalValues({ featureId, values: draft.values }));
      }
      // Promote hiddenOriginalIds before removing the draft so the parent
      // Standort (etc.) stays suppressed on the regular vector layers until
      // the brandnew tile contains the new record.
      dispatch(promoteDraftHiddenToPermanent(featureId));
      dispatch(removeDraft(featureId));
    }
    setIsEditing(false);
  }, [featureId, dispatch, draft?.values]);

  const handleServerSave = useCallback(async () => {
    if (!jwt) {
      void message.error("Nicht authentifiziert");
      return;
    }
    if (!featureId || !draft) return;

    // Deletion draft: "Speichern" commits the marked deletion as a soft delete —
    // a normal update that flips the row's `is_deleted` flag (via
    // updateDataByClassName), not a hard server-side removal. The backend keeps
    // the record but filters it out of the GraphQL/tile responses.
    if (draft.pendingDeletion) {
      const className = formKey ? formKeyToGraphqlKey[formKey] : undefined;
      if (!className || dbPK == null) {
        void message.error("Löschen nicht möglich: Typ oder ID unbekannt.");
        return;
      }
      setSaving(true);
      const hide = message.loading(`${className} #${dbPK} wird gelöscht …`, 0);
      const deletePayload = { id: Number(dbPK), is_deleted: true };
      try {
        await updateDataByClassName(
          jwt,
          className,
          deletePayload
        );
        // Keep the soft-deleted row hidden on both maps: the vector tiles and
        // the brandnew FC still carry it until they are regenerated server-side.
        dispatch(
          markFeatureDeleted({ featureId, featureDbId: Number(dbPK) })
        );
        // A deleted Leuchte must shrink its parent Standort's stacked icon by
        // one dot. Hiding the Leuchte alone leaves the Standort (and the
        // remaining Leuchten) still painting the old `leuchten_count`, so record
        // a per-Standort override the map turns into a single decremented
        // synthetic Standort. The deleted Leuchte's tile carries both its parent
        // id (`fk_standort`) and the parent's count (`leuchten_count`); its
        // geometry is the Standort position (Leuchten stack on their Standort).
        if (formKey === "leuchte") {
          const leuchteProps = (draftFeature?.properties ?? {}) as Record<
            string,
            unknown
          >;
          const standortId = leuchteProps.fk_standort;
          const rawCount = leuchteProps.leuchten_count;
          const baseLeuchtenCount =
            rawCount != null && Number.isFinite(Number(rawCount))
              ? Number(rawCount)
              : undefined;
          const geometry = draftFeature?.geometry as
            | GeoJSON.Geometry
            | undefined;
          if (
            standortId != null &&
            baseLeuchtenCount != null &&
            geometry != null
          ) {
            dispatch(
              recordLeuchteDeletionForStandort({
                standortId: standortId as number | string,
                leuchteDbId: Number(dbPK),
                baseLeuchtenCount,
                geometry,
                lfdNummer: leuchteProps.lfd_nummer as
                  | string
                  | number
                  | undefined,
              })
            );
          }
        }
        // Cascade: a deleted Standort takes its Leuchten with it. Soft-delete
        // each child captured at mark time, mirroring the single-feature path
        // (updateDataByClassName flips is_deleted; markFeatureDeleted keeps the
        // lingering tile/brandnew copy hidden until the sources regenerate).
        // Failures are collected and surfaced but don't abort the Standort
        // deletion that already succeeded.
        if (formKey === "standort" && draft.cascadeDeleteLeuchten?.length) {
          const failedLeuchten: number[] = [];
          for (const leuchte of draft.cascadeDeleteLeuchten) {
            try {
              await updateDataByClassName(jwt, "tdta_leuchten", {
                id: leuchte.id,
                is_deleted: true,
              });
              dispatch(
                markFeatureDeleted({
                  featureId: `leuchten:${leuchte.id}`,
                  sourceLayer: "leuchten",
                  featureDbId: leuchte.id,
                })
              );
            } catch (leuchteErr) {
              console.error("[DELETE] Leuchte (Kaskade) fehlgeschlagen", {
                id: leuchte.id,
                err: leuchteErr,
              });
              failedLeuchten.push(leuchte.id);
            }
          }
          if (failedLeuchten.length > 0) {
            void message.warning(
              `Standort gelöscht, aber ${failedLeuchten.length} Leuchte(n) konnten nicht gelöscht werden: #${failedLeuchten.join(
                ", #"
              )}`
            );
          }
        }
        dispatch(removeDraft(featureId));
        dispatch(incrementFeatureDataVersion());
        void message.success(`Gelöscht: ${className} #${dbPK}`);
        setIsEditing(false);
        onSelectNextDraft?.(featureId);
      } catch (err) {
        console.error("[DELETE] fehlgeschlagen", { className, id: dbPK, err });
        void message.error(
          `Löschen fehlgeschlagen: ${
            err instanceof Error ? err.message : "Unbekannter Fehler"
          }`
        );
      } finally {
        hide();
        setSaving(false);
      }
      return;
    }

    // Brandnew (creation) drafts without a geometry would be POSTed with no
    // geom field, producing a NULL-geometry row server-side that surfaces
    // the next day as a malformed feature in brand.new.features.json and
    // breaks the symbol layer's rendering pass. Stop here and explain.
    if (draft.isCreation && !draft.geometry) {
      Modal.warning({
        title: "Geometrie fehlt",
        content:
          "Bitte weisen Sie diesem Entwurf zuerst eine Geometrie zu, bevor Sie ihn speichern.",
        okText: "OK",
      });
      return;
    }

    setSaving(true);
    try {
      const result = await saveFeatureDraft(
        jwt,
        featureId,
        draft,
        strassenschluesselByPk
      );
      if (result.success) {
        dispatch(promoteDraftHiddenToPermanent(featureId));
        dispatch(removeDraft(featureId));
        dispatch(incrementFeatureDataVersion());
        void message.success("Gespeichert");
        // Drop the consumed measurement from the dropdown source AND from the
        // terra-draw layer on the map. Applies to creation drafts (measurement
        // used as the new feature's geometry) and geometry-edit drafts (an
        // existing feature reshaped to a measurement) alike — once saved, that
        // measurement is spent and must not reappear as a selectable option.
        if (draft.geometryKey && draft.geometryKey.startsWith("measurement.")) {
          const consumed = measurements.find(
            (f) => `measurement.${String(f.id)}` === draft.geometryKey
          );
          if (consumed) {
            const filtered = measurements.filter((f) => f !== consumed);
            dispatch(setMeasurements(filtered));
            const rawId = String(consumed.id).replace(/^measurement\./, "");
            removeMeasurements([rawId]);
          }
        }
        if (isCreation) {
          onSelectNextDraft?.(featureId);
        } else {
          // After a geometry edit the saved feature is hidden on both map
          // layers (vector tile permanently hidden + brandnew copy suppressed)
          // until the next brandnew poll delivers it at its new position. The
          // datasheet mini-map follows the selection's geometry, so without
          // this it stays parked on the pre-edit position and the moved feature
          // looks like an empty map. Push the new geometry onto the selection —
          // the same selectFeature(sameId, updatedFeature) channel creation
          // drafts use on every form change — so the mini-map recenters on the
          // new position; the marker fills in once the burst poll lands it.
          const newWgs84 = draft.geometry
            ? convertGeometryToWgs84(draft.geometry)
            : undefined;
          if (newWgs84 && selectedFeatureId && rawFeature) {
            selectFeature(selectedFeatureId, {
              ...(rawFeature as object),
              geometry: newWgs84,
            } as never);
          }
          setIsEditing(false);
        }
      } else {
        void message.error(
          `Fehler beim Speichern: ${result.error ?? "Unbekannter Fehler"}`
        );
      }
    } catch (err) {
      void message.error(
        `Fehler beim Speichern: ${
          err instanceof Error ? err.message : "Unbekannter Fehler"
        }`
      );
    } finally {
      setSaving(false);
    }
  }, [
    jwt,
    featureId,
    draft,
    isCreation,
    formKey,
    dbPK,
    measurements,
    dispatch,
    onSelectNextDraft,
    strassenschluesselByPk,
    selectedFeatureId,
    rawFeature,
    draftFeature,
    selectFeature,
  ]);

  const handleDraftChange = useCallback(
    (values: Record<string, unknown>) => {
      if (!featureId || !formKey) return;

      if (isCreation) {
        // Rebuild the synthetic feature so denormalized props (e.g.
        // leitung.bezeichnung from fk_leitungstyp) flow into the mini-map
        // render and trigger the right per-type style. The Bestand-Leuchten
        // count (set at draft open from the linked Standort tile; refreshed
        // by setDraftBestandLeuchten when the mast fetch resolves) feeds the
        // leuchten icon's dot count formula.
        const enrichedValues = enrichSyntheticProps(
          formKey,
          values,
          keyTablesData,
          draft?.bestandLeuchtenCount ?? 0
        );
        const newFeature = buildSyntheticFeature(
          formKey,
          featureId,
          enrichedValues,
          draft?.geometry
        );
        dispatch(
          setDraft({
            featureId,
            featureType: formKey,
            values: serializeValues(values),
            feature: newFeature,
            fetchedData: buildSyntheticFetchedData(formKey, values),
            isCreation: true,
            geometry: draft?.geometry,
            geometryKey: draft?.geometryKey,
          })
        );
        if (selectedFeatureId) {
          selectFeature(selectedFeatureId, newFeature as never);
        }
        return;
      }

      dispatch(
        setDraft({
          featureId,
          featureType: formKey,
          values: serializeValues(values),
          feature: draftFeature,
          fetchedData: data,
        })
      );
    },
    [
      featureId,
      formKey,
      isCreation,
      keyTablesData,
      draft?.geometry,
      draft?.geometryKey,
      draft?.bestandLeuchtenCount,
      dispatch,
      draftFeature,
      data,
      selectedFeatureId,
      selectFeature,
    ]
  );

  const handleGeometryChange = useCallback(
    (newKey: string | undefined) => {
      if (!featureId || !formKey) return;
      const currentValues = draft?.values ?? {};
      const enrichedValues = enrichSyntheticProps(
        formKey,
        deserializeValues(currentValues),
        keyTablesData,
        draft?.bestandLeuchtenCount ?? 0
      );
      const previousGeometryKey = draft?.geometryKey;
      // Clear case: user hit the "x" in the allowClear select.
      if (!newKey) {
        const newFeature = buildSyntheticFeature(
          formKey,
          featureId,
          enrichedValues,
          undefined
        );
        dispatch(
          clearDraftGeometry({
            featureId,
            feature: newFeature,
            fetchedData: buildSyntheticFetchedData(
              formKey,
              deserializeValues(currentValues)
            ),
          })
        );
        // Releasing the attachment — bring the measurement back into
        // terra-draw so the user sees it again on the map.
        restoreAttachedMeasurement(previousGeometryKey);
        if (selectedFeatureId) {
          selectFeature(selectedFeatureId, newFeature as never);
        }
        return;
      }
      const opt = geometryOptions.find((o) => o.key === newKey);
      if (!opt) return;
      const geom = opt.geometry;
      const isMeasurement = newKey.startsWith("measurement.");
      const newFeature = buildSyntheticFeature(
        formKey,
        featureId,
        enrichedValues,
        geom
      );
      // Switching to a different geometry — restore the previous
      // measurement attachment (if any) before consuming the new one.
      // Same-key re-pick is a no-op for restore (the feature isn't in
      // terra-draw to begin with).
      if (previousGeometryKey && previousGeometryKey !== newKey) {
        restoreAttachedMeasurement(previousGeometryKey);
      }
      dispatch(
        setDraft({
          featureId,
          featureType: formKey,
          values: currentValues,
          feature: newFeature,
          fetchedData: buildSyntheticFetchedData(
            formKey,
            deserializeValues(currentValues)
          ),
          isCreation: true,
          geometry: geom,
          geometryKey: newKey,
          geometryWgs84: opt.geometryWgs84,
          // Stash the label as a fallback for the case where the user
          // deletes the underlying measurement from terra-draw while it's
          // attached — the dropdown then falls back to this label.
          measurementLabel: isMeasurement ? opt.label : undefined,
        })
      );
      // Hide the measurement from terra-draw while it backs the draft —
      // the draft renders its own styled feature in its place. The
      // measurement stays in Redux so the dropdown can still show it and
      // a later detach can restore it without data loss.
      if (isMeasurement) {
        const consumed = measurements.find(
          (f) => `measurement.${String(f.id)}` === newKey
        );
        if (consumed) {
          const rawId = String(consumed.id).replace(/^measurement\./, "");
          removeMeasurements([rawId]);
        }
      }
      // Push the new feature into MapSelectionContext so the datasheet
      // mini-map (which reads rawFeature) re-centers on the new geometry.
      if (selectedFeatureId) {
        selectFeature(selectedFeatureId, newFeature as never);
      }
    },
    [
      featureId,
      formKey,
      draft?.values,
      draft?.bestandLeuchtenCount,
      draft?.geometryKey,
      geometryOptions,
      keyTablesData,
      measurements,
      dispatch,
      selectedFeatureId,
      selectFeature,
      restoreAttachedMeasurement,
    ]
  );

  // Geometry-edit handler for an *existing* feature. Unlike
  // handleGeometryChange this never builds a synthetic creation feature or
  // sets isCreation — it attaches the picked geometry to the normal edit
  // draft. Picking "Momentane Geometrie" reverts (clears) the geometry.
  const handleEditGeometryChange = useCallback(
    (newKey: string | undefined) => {
      if (!featureId || !formKey) return;
      const previousGeometryKey = draft?.geometryKey;
      const currentKey = currentGeometryOption?.key;
      const currentValues = draft?.values ?? originalValues ?? {};

      // Revert to the feature's own geometry: drop the draft geometry and
      // bring any attached measurement back into terra-draw. The mini-map is
      // re-centered on the original position. A prior measurement pick replaced
      // the shared rawFeature (and thus draftFeature) with the moved geometry,
      // so re-derive the original position from the DB geom (EPSG:25832 → WGS84)
      // rather than trusting draftFeature's now-stale coordinates.
      if (!newKey || newKey === currentKey) {
        const originalWgs84 = currentGeometryOption
          ? convertGeometryToWgs84(currentGeometryOption.geometry)
          : undefined;
        const restoredFeature =
          draftFeature && originalWgs84
            ? { ...draftFeature, geometry: originalWgs84 }
            : draftFeature;
        // No-op in the reducer when no draft exists yet.
        dispatch(
          clearDraftGeometry({
            featureId,
            feature: restoredFeature,
            fetchedData: data,
          })
        );
        restoreAttachedMeasurement(previousGeometryKey);
        if (selectedFeatureId && restoredFeature) {
          selectFeature(selectedFeatureId, restoredFeature as never);
        }
        return;
      }

      const opt = editGeometryOptions.find((o) => o.key === newKey);
      if (!opt) return;

      if (previousGeometryKey && previousGeometryKey !== newKey) {
        restoreAttachedMeasurement(previousGeometryKey);
      }

      dispatch(
        setDraft({
          featureId,
          featureType: formKey,
          values: currentValues,
          feature: draftFeature,
          fetchedData: data,
          featureGeomId,
          geometry: opt.geometry,
          geometryKey: newKey,
          // Stash the label so the dropdown can still render the picked
          // measurement after it is consumed (removed from terra-draw and the
          // measurements slice) — mirrors the creation path. Without it,
          // re-opening the draft drops the option and the selector falls back
          // to "Momentane Geometrie".
          measurementLabel: newKey.startsWith("measurement.")
            ? opt.label
            : undefined,
        })
      );

      // Hide the picked measurement from terra-draw while it backs the draft —
      // the draft preview renders in its place. It stays in Redux so the
      // dropdown can still show it and a later revert can restore it.
      if (newKey.startsWith("measurement.")) {
        const consumed = measurements.find(
          (f) => `measurement.${String(f.id)}` === newKey
        );
        if (consumed) {
          const rawId = String(consumed.id).replace(/^measurement\./, "");
          removeMeasurements([rawId]);
        }
      }

      // Re-center the datasheet mini-map on the new position by handing
      // MapSelectionContext a clone of the original feature with the new
      // (WGS84) geometry — keeping the real id/properties so the datasheet
      // does not flip into creation mode.
      if (selectedFeatureId && draftFeature) {
        const movedFeature = {
          ...draftFeature,
          geometry:
            convertGeometryToWgs84(opt.geometry) ?? draftFeature.geometry,
        };
        selectFeature(selectedFeatureId, movedFeature as never);
      }
    },
    [
      featureId,
      formKey,
      draft?.geometryKey,
      draft?.values,
      currentGeometryOption,
      originalValues,
      editGeometryOptions,
      featureGeomId,
      measurements,
      dispatch,
      draftFeature,
      data,
      selectedFeatureId,
      selectFeature,
      restoreAttachedMeasurement,
    ]
  );

  // Tracks featureIds whose single-option geometry the user explicitly cleared,
  // so the auto-apply effect below doesn't immediately re-apply it.
  const userClearedGeometryRef = useRef<Set<string>>(new Set());
  const prevGeometryKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!featureId) return;
    const prev = prevGeometryKeyRef.current;
    const now = draft?.geometryKey;
    if (prev && !now) {
      userClearedGeometryRef.current.add(featureId);
    } else if (now) {
      userClearedGeometryRef.current.delete(featureId);
    }
    prevGeometryKeyRef.current = now;
  }, [featureId, draft?.geometryKey]);

  useEffect(() => {
    if (!isCreation) return;
    if (geometryOptions.length !== 1) return;
    if (featureId && userClearedGeometryRef.current.has(featureId)) return;
    const only = geometryOptions[0];
    if (draft?.geometryKey === only.key) return;
    handleGeometryChange(only.key);
  }, [
    isCreation,
    featureId,
    geometryOptions,
    draft?.geometryKey,
    handleGeometryChange,
  ]);

  const handleOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      if (featureId) {
        const serialized = serializeValues(values);
        dispatch(setOriginalValues({ featureId, values: serialized }));
        // Selecting an existing feature in Fachobjekte seeds the per-form "+"
        // button's memory (selectionDefaults) for that type, so it creates the
        // next draft pre-filled with this feature's allowlisted fields. The
        // toolbar dropdown reads a separate memory and is unaffected. Skip
        // creation drafts — their memory is owned by the draft-edit path (#645).
        if (
          !isCreation &&
          formKey &&
          CREATION_DEFAULTS_ALLOWLIST[formKey] != null
        ) {
          dispatch(
            recordSelectionDefaults({
              featureType: formKey,
              values: serialized,
            })
          );
        }
      }
    },
    [featureId, formKey, isCreation, dispatch]
  );

  const handleDraftFilesChange = useCallback(
    (files: DraftFile[]) => {
      if (featureId && formKey) {
        dispatch(
          setDraftFiles({
            featureId,
            featureType: formKey,
            files,
            feature: draftFeature,
            fetchedData: data,
          })
        );
      }
    },
    [featureId, formKey, dispatch, draftFeature, data]
  );

  const handleRemovedDocumentKeysChange = useCallback(
    (keys: Set<string>) => {
      if (featureId && formKey) {
        dispatch(
          setRemovedDocumentKeys({
            featureId,
            featureType: formKey,
            keys: [...keys],
            feature: draftFeature,
            fetchedData: data,
          })
        );
      }
    },
    [featureId, formKey, dispatch, draftFeature, data]
  );

  const singleSaveValue = useMemo(
    () => ({
      onSaveSingle: draft ? handleServerSave : undefined,
      savingSingle: saving,
    }),
    [draft, handleServerSave, saving]
  );

  // "Neue Geometrien" selector for editing an existing feature's shape.
  // Rendered inside the form (above Strassenschlüssel), only in edit mode.
  const geometryEdited =
    !!draft?.geometryKey && !draft.geometryKey.startsWith("current.");
  const editGeometrySelector =
    isGeometryEditFeature && !effectiveReadOnly && editGeometryOptions.length > 0 ? (
      <div className={geometryEdited ? "mb-4 draft-changed-field" : "mb-4"}>
        <span className="text-sm font-medium text-gray-700">
          Geometrie
        </span>
        <Select
          value={draft?.geometryKey ?? currentGeometryOption?.key}
          onChange={handleEditGeometryChange}
          className="w-full mt-1"
          size="large"
          placeholder="Messung wählen"
          disabled={!hasAlternativeGeometryOptions}
        >
          {editGeometryOptions.map((opt) => (
            <Select.Option key={opt.key} value={opt.key}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      </div>
    ) : undefined;

  // Mark the currently open existing Fachobjekt for deletion. Surfaced as the
  // bottom "Gefahrenzone" action in FeatureFormLayout (gated by the
  // dangerous-delete-mode setting) and provided to the form tree via context.
  // Marking records the intent as a draft and enters edit mode so the form
  // header's existing "Speichern"/"zurücksetzen" buttons commit or cancel the
  // deletion like any other draft — Speichern runs the server-side delete in
  // handleServerSave; zurücksetzen drops the draft via handleCancel.
  const handleMarkForDeletion = useCallback(() => {
    if (!featureId || !formKey) return;
    // Deleting a Standort cascades to its Leuchten: capture them from the
    // fetched mast (`leuchtenArray`) so the sidebar can show them as red
    // "wird gelöscht" rows and handleServerSave can soft-delete each on commit.
    const cascadeDeleteLeuchten =
      formKey === "standort"
        ? projectCascadeLeuchten(
            (data as Record<string, unknown> | undefined)?.[
              formKeyToGraphqlKey.standort
            ]
          )
        : undefined;
    dispatch(
      setPendingDeletion({
        featureId,
        featureType: formKey,
        pendingDeletion: true,
        feature: draftFeature,
        fetchedData: data,
        featureDbId: dbPK != null ? Number(dbPK) : undefined,
        cascadeDeleteLeuchten,
      })
    );
    setIsEditing(true);
  }, [featureId, formKey, dispatch, draftFeature, data, dbPK]);

  // Deletion is only offered for existing features (creation drafts are
  // cancelled, not deleted), editable (non-"Gast") users, and only while the
  // form is actually in edit mode (`!effectiveReadOnly`) — not when merely
  // viewing the feature. `undefined` keeps the danger zone hidden entirely.
  const deleteControls = useMemo(
    () =>
      !isReadOnly &&
      !effectiveReadOnly &&
      !isCreation &&
      dbPK != null &&
      featureId &&
      formKey
        ? { pendingDeletion, mark: handleMarkForDeletion }
        : undefined,
    [
      isReadOnly,
      effectiveReadOnly,
      isCreation,
      dbPK,
      featureId,
      formKey,
      pendingDeletion,
      handleMarkForDeletion,
    ]
  );

  if (FormComponent) {
    return (
      <DeleteFeatureProvider value={deleteControls}>
      <SingleSaveCtx.Provider value={singleSaveValue}>
        <ChangedFieldsProvider
          originalValues={originalValues}
          draftValues={draft?.values}
          allowlistedPaths={allowlistedPaths}
          currentDefaults={currentDefaults}
        >
          <div className="h-full">
            <FormComponent
              data={data}
              rawFeature={rawFeature}
              readOnly={effectiveReadOnly}
              loading={loading}
              draftValues={deserializedDraftValues}
              draftFiles={draftFiles}
              hasDraft={isCreation || hasChanges}
              isCreation={isCreation}
              featureId={featureId}
              linkedMastId={parseStandortIdFromKey(draft?.geometryKey)}
              geometrySelector={editGeometrySelector}
              formHeaderContent={
                isCreation ? (
                  <div
                    className={
                      draft?.geometryKey?.startsWith(STANDORT_OPTION_PREFIX)
                        ? `mb-3 ${LOCKED_FIELD_CLASSES}`
                        : draft?.geometryKey &&
                          draft.geometryKey === draft?.prefillGeometryKey
                        ? "mb-3 draft-prefilled-field"
                        : draft?.geometryKey
                        ? "mb-3 draft-changed-field"
                        : "mb-3"
                    }
                  >
                    <span className="text-sm font-medium text-gray-700">
                      Neue Geometrien
                    </span>
                    <Select
                      value={
                        geometryOptions.some(
                          (o) => o.key === draft?.geometryKey
                        )
                          ? draft?.geometryKey
                          : undefined
                      }
                      onChange={handleGeometryChange}
                      className="w-full mt-1"
                      size="large"
                      placeholder="Messung wählen"
                      allowClear
                    >
                      {geometryOptions.map((opt) => (
                        <Select.Option key={opt.key} value={opt.key}>
                          {opt.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                ) : formKey === "abzweigdose" ? (
                  // Abzweigdose has no editable form fields, so its edit-geometry
                  // selector rides the formHeaderContent slot at the top of the
                  // form — the same spot a new Abzweigdose's selector occupies.
                  editGeometrySelector
                ) : undefined
              }
              onDraftChange={handleDraftChange}
              onDraftFilesChange={handleDraftFilesChange}
              onOriginalValues={handleOriginalValues}
              onToggleReadOnly={handleToggleReadOnly}
              onCancel={handleCancel}
              onSaveComplete={handleSaveComplete}
              removedDocumentKeys={removedDocumentKeys}
              onRemovedDocumentKeysChange={handleRemovedDocumentKeysChange}
            />
          </div>
        </ChangedFieldsProvider>
      </SingleSaveCtx.Provider>
      </DeleteFeatureProvider>
    );
  }
};

export default FeaturesFormsWrapper;
