import dayjs from "dayjs";
import { Modal, message } from "antd";
import type { Feature } from "geojson";
import type { DokumentItem } from "../components/ui/DocumentPreview";
import { getDocumentKey } from "../components/ui/FilePreview";
import type { Draft, DraftFile } from "../store/slices/featuresForms";
import { updateDataByClassName } from "./apiMethods";
import { uploadDraftFiles } from "./uploadDraftFiles";
import { parseStandortIdFromKey } from "./geometryOptions";
import { removeMeasurements } from "@carma-mapping/measurements";

// ---------------------------------------------------------------------------
// Dayjs serialization (independent copy — matches FeaturesFormsWrapper logic)
// ---------------------------------------------------------------------------

const DAYJS_PREFIX = "__dayjs:";

const deserializeValues = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.startsWith(DAYJS_PREFIX)) {
      result[key] = dayjs(value.slice(DAYJS_PREFIX.length));
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ("$d" in obj) {
        result[key] = dayjs(obj["$d"] as string);
      } else {
        result[key] = deserializeValues(obj);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
};

const transformDatesForBackend = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      // console.log("xxx [DATE] dayjs field:", key, "→", value.format("YYYY-MM-DDTHH:mm:ss"));
      result[key] = value.format("YYYY-MM-DDTHH:mm:ss");
    } else {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        // console.log("xxx [DATE] string date field (NOT dayjs):", key, "→", value);
      }
      result[key] = value;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Strassenschluessel pk → id lookup
// ---------------------------------------------------------------------------

/**
 * Builds a `pk → id` map from the Strassenschluessel key table so the save
 * layer can backfill `fk_strassenschluessel` from the visible `pk` when the
 * hidden FK never made it into the draft (see `prepareSaveValues`).
 */
export const buildStrassenschluesselByPk = (
  items: ReadonlyArray<{ id?: unknown; pk?: unknown }> | undefined
): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const item of items ?? []) {
    if (item && typeof item.pk === "string" && typeof item.id === "number") {
      map[item.pk] = item.id;
    }
  }
  return map;
};

// ---------------------------------------------------------------------------
// Per-feature-type save configuration
// ---------------------------------------------------------------------------

interface FeatureSaveConfig {
  className: string;
  removedFields: string[];
  fieldRenames: Record<string, string>;
  transformDates: boolean;
  /** Nested key in draft.values to extract (e.g. "leuchte"). undefined = flat */
  valuesPath?: string;
  /** If set, only include these fields in the payload (others ignored) */
  explicitFields?: string[];
  /** Convert undefined field values to null */
  nullifyUndefined?: boolean;
}

const featureSaveConfigs: Record<string, FeatureSaveConfig> = {
  leuchte: {
    className: "tdta_leuchten",
    removedFields: ["strassenschluessel_pk", "strassenschluessel_strasse", "sonderturnus"],
    fieldRenames: { sonderturnus: "wartungszyklus" },
    transformDates: true,
    valuesPath: "leuchte",
  },
  standort: {
    className: "tdta_standort_mast",
    // `leuchten` holds the "+ Leuchte" creation tabs (see saveCreationDraft);
    // strip it here so it never reaches the Mast payload as a bogus field —
    // the array is consumed separately to create the linked tdta_leuchten rows.
    removedFields: [
      "strassenschluessel_pk",
      "strassenschluessel_strasse",
      "leuchten",
    ],
    fieldRenames: {},
    transformDates: true,
  },
  schaltstelle: {
    className: "schaltstelle",
    removedFields: ["strassenschluessel_pk", "strassenschluessel_strasse"],
    fieldRenames: {},
    transformDates: true,
  },
  leitung: {
    className: "leitung",
    removedFields: [],
    fieldRenames: {},
    transformDates: false,
    explicitFields: ["fk_leitungstyp", "fk_material", "fk_querschnitt"],
    nullifyUndefined: true,
  },
  mauerlasche: {
    className: "mauerlasche",
    removedFields: ["strassenschluessel_pk", "strassenschluessel_strasse"],
    fieldRenames: {},
    transformDates: true,
  },
  abzweigdose: {
    className: "abzweigdose",
    removedFields: [],
    fieldRenames: {},
    transformDates: false,
  },
};

// ---------------------------------------------------------------------------
// Value preparation
// ---------------------------------------------------------------------------

/**
 * Transforms serialized draft values into a clean payload ready for the API.
 * Applies per-feature-type rules: field removal, renaming, date conversion.
 */
export const prepareSaveValues = (
  featureType: string,
  serializedDraftValues: Record<string, unknown>,
  strassenschluesselByPk?: Record<string, number>
): Record<string, unknown> | null => {
  const config = featureSaveConfigs[featureType];
  if (!config) return null;

  // 1. Extract nested values if needed
  let raw: Record<string, unknown>;
  if (config.valuesPath) {
    const nested = serializedDraftValues[config.valuesPath];
    if (!nested || typeof nested !== "object") return {};
    raw = nested as Record<string, unknown>;
  } else {
    raw = { ...serializedDraftValues };
  }

  // 2. Deserialize dayjs strings
  const deserialized = deserializeValues(raw);

  // 2b. Backfill fk_strassenschluessel from the visible pk.
  // The street is persisted ONLY via fk_strassenschluessel — strassenschluessel_pk
  // and strassenschluessel_strasse are display-only and stripped below. The FK is
  // a hidden field that only reaches the draft through the picker's manual sync
  // (AntD setFieldValue doesn't fire onValuesChange); a draft hydrated from server
  // data or copied via the green "+" can therefore carry the visible pk/strasse
  // while the FK is null, which would save the feature with no street. Resolve the
  // FK from the pk against the key table so the display and the FK can't desync.
  const currentFk = deserialized.fk_strassenschluessel;
  const pk = deserialized.strassenschluessel_pk;
  if (
    strassenschluesselByPk &&
    (currentFk == null || currentFk === "") &&
    typeof pk === "string" &&
    pk !== ""
  ) {
    const resolved = strassenschluesselByPk[pk];
    if (typeof resolved === "number") {
      deserialized.fk_strassenschluessel = resolved;
    }
  }

  // 3. Handle explicitFields mode (leitung)
  if (config.explicitFields) {
    const result: Record<string, unknown> = {};
    for (const field of config.explicitFields) {
      result[field] = config.nullifyUndefined
        ? deserialized[field] ?? null
        : deserialized[field];
    }
    return result;
  }

  // 4. Remove display-only fields and collect renamed values
  const renamed: Record<string, unknown> = {};
  for (const field of config.removedFields) {
    if (field in deserialized && config.fieldRenames[field]) {
      // Capture value before removing (e.g. sonderturnus → wartungszyklus)
      renamed[config.fieldRenames[field]] = deserialized[field];
    }
    delete deserialized[field];
  }

  // 5. Apply any remaining renames not tied to removed fields
  for (const [from, to] of Object.entries(config.fieldRenames)) {
    if (from in deserialized) {
      renamed[to] = deserialized[from];
      delete deserialized[from];
    }
  }

  // 6. Merge renamed values
  const merged = { ...deserialized, ...renamed };

  // 6b. Convert undefined values to null (e.g. cleared Select fields)
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      merged[key] = null;
    }
  }

  // 7. Transform dates if needed
  if (config.transformDates) {
    return transformDatesForBackend(merged);
  }

  return merged;
};

// ---------------------------------------------------------------------------
// Document array builder
// ---------------------------------------------------------------------------

export const buildDokumenteArray = (
  existingDocs: DokumentItem[],
  removedKeys: string[],
  uploadedDocs: DokumentItem[]
): DokumentItem[] => {
  const removedSet = new Set(removedKeys);
  const kept = existingDocs.filter(
    (doc) => !removedSet.has(getDocumentKey(doc))
  );
  return [...kept, ...uploadedDocs];
};

// ---------------------------------------------------------------------------
// Single draft save
// ---------------------------------------------------------------------------

export interface SaveResult {
  success: boolean;
  featureId: string;
  featureType: string;
  error?: string;
}

/**
 * Saves a single feature draft: uploads files, builds payload, calls API.
 * Does NOT modify Redux state — the caller is responsible for removing
 * the draft on success.
 */
export const saveFeatureDraft = async (
  jwt: string,
  featureId: string,
  draft: Draft,
  strassenschluesselByPk?: Record<string, number>
): Promise<SaveResult> => {
  const { featureType, featureDbId } = draft;
  const config = featureSaveConfigs[featureType];
  const base = { featureId, featureType };

  if (!config) {
    return {
      ...base,
      success: false,
      error: `Unknown feature type: ${featureType}`,
    };
  }

  // Soft-delete draft: flip the row's `is_deleted` flag instead of saving any
  // field values. Applies to EVERY feature type and to BOTH the single-save
  // (handleServerSave) and bulk-save ("Alle speichern") paths — every deletion
  // must send exactly { id, is_deleted: true }.
  if (draft.pendingDeletion) {
    if (featureDbId == null) {
      return {
        ...base,
        success: false,
        error: "Missing database ID (featureDbId)",
      };
    }
    const deletePayload = { id: featureDbId, is_deleted: true };
    try {
      await updateDataByClassName(
        jwt,
        config.className,
        deletePayload
      );
      return { ...base, success: true };
    } catch (error) {
      return {
        ...base,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Creation drafts: create new feature with id: -1
  if (draft.isCreation) {
    return saveCreationDraft(jwt, featureId, draft, config, strassenschluesselByPk);
  }

  if (featureDbId == null) {
    return {
      ...base,
      success: false,
      error: "Missing database ID (featureDbId)",
    };
  }

  try {
    // 1. Upload new files
    let uploadedDocuments: DokumentItem[] = [];
    const draftFiles: DraftFile[] = draft.files ?? [];
    if (draftFiles.length > 0) {
      uploadedDocuments = await uploadDraftFiles(jwt, draftFiles);
    }

    // 2. Build dokumenteArray
    const removedKeys = draft.removedDocumentKeys ?? [];
    const existingDocs = draft.existingDocuments ?? [];
    const hasDocumentChanges =
      uploadedDocuments.length > 0 || removedKeys.length > 0;

    let finalDokumenteArray: DokumentItem[] | undefined;
    if (hasDocumentChanges) {
      finalDokumenteArray = buildDokumenteArray(
        existingDocs,
        removedKeys,
        uploadedDocuments
      );
    }

    // 3. Prepare form values
    const formValues = prepareSaveValues(
      featureType,
      draft.values ?? {},
      strassenschluesselByPk
    );

    // 4a. Geometry edit: the user switched this existing feature's shape to a
    // measurement. Update the same `geom` row in place (same geom id) so the
    // feature keeps its identity. Applies to both point features and Leitungen.
    // A "current.*" key means the geometry was left untouched (or reverted),
    // so no geom is sent. Falls back to id: -1 when the geom id wasn't
    // captured at draft-open (backend then creates a fresh geom and re-links).
    const geometryEdited =
      !!draft.geometry &&
      !!draft.geometryKey &&
      !draft.geometryKey.startsWith("current.");
    const geomPayload = geometryEdited
      ? { id: draft.featureGeomId ?? -1, geo_field: draft.geometry }
      : undefined;

    // Diagnostic: a geometry change was selected (key is not "current.*") but no
    // geom is going out — the draft lost its geometry before save. Logs only;
    // the save still proceeds.
    const geometryChangeIntended =
      !!draft.geometryKey && !draft.geometryKey.startsWith("current.");
    if (geometryChangeIntended && !geomPayload) {
      console.error(
        `[SAVE-NO-GEOM] edit feature "${featureId}" (${featureType}) had a geometry change selected (geometryKey=${draft.geometryKey}) but is being sent WITHOUT geom — draft.geometry is empty/undefined.`,
        { featureId, featureType, geometryKey: draft.geometryKey, featureGeomId: draft.featureGeomId }
      );
    }

    // 4. Build final payload
    const dataToSave: Record<string, unknown> = {
      id: featureDbId,
      ...(formValues ?? {}),
      ...(finalDokumenteArray !== undefined
        ? { dokumenteArray: finalDokumenteArray }
        : {}),
      ...(geomPayload ? { geom: geomPayload } : {}),
    };

    // 5. Send to API
    await updateDataByClassName(jwt, config.className, dataToSave);

    return { ...base, success: true };
  } catch (error) {
    return {
      ...base,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const saveCreationDraft = async (
  jwt: string,
  featureId: string,
  draft: Draft,
  config: FeatureSaveConfig,
  strassenschluesselByPk?: Record<string, number>
): Promise<SaveResult> => {
  const { featureType } = draft;
  const base = { featureId, featureType };
  const geomPayload = draft.geometry
    ? { id: -1, geo_field: draft.geometry }
    : undefined;

  try {
    const formValues =
      prepareSaveValues(featureType, draft.values ?? {}, strassenschluesselByPk) ??
      {};
    let payload: Record<string, unknown>;
    // Hoisted out of the `featureType === "leuchte"` branch so the Scope-B
    // extras loop below can reuse them when creating additional Leuchten that
    // share Leuchte 1's Mast + Strassenschluessel.
    let mastIdForLink: number | undefined;
    let leuchteStrassenschluesselId: number | null = null;

    if (featureType === "leuchte") {
      const linkedMastId = parseStandortIdFromKey(draft.geometryKey);

      // Mirror the Mast's strassenschluessel onto the Leuchte so the joined
      // Leuchte view (which reads leuchte.tkey_strassenschluessel) renders
      // the street name. The Strassenschluessel field is hidden on the
      // Leuchte tab during creation, so the only source is the Mast tab.
      if (linkedMastId != null) {
        // Existing Standort was selected — reuse it, no new Mast created.
        // LeuchteForm hydrates `draft.values.mast.fk_strassenschluessel`
        // from the linked Mast's tkey_strassenschluessel; pick it up so
        // the same FK lands on each saved Leuchte (otherwise the new
        // Leuchten persist with `fk_strassenschluessel = null` and the
        // sidebar/tile view shows them with a blank street).
        mastIdForLink = linkedMastId;
        const mastSlice = (draft.values?.mast ?? {}) as Record<
          string,
          unknown
        >;
        const linkedFk = mastSlice.fk_strassenschluessel;
        if (typeof linkedFk === "number" && Number.isFinite(linkedFk)) {
          leuchteStrassenschluesselId = linkedFk;
        }
      } else {
        // Build the Mast payload from the form's Mast tab values, falling
        // back to the same defaults that used to be hardcoded so a Mast can
        // still be created if the user leaves required fields blank.
        const rawMastValues = (draft.values?.mast ?? {}) as Record<
          string,
          unknown
        >;
        const cleanedMastValues =
          prepareSaveValues("standort", rawMastValues, strassenschluesselByPk) ??
          {};
        const mastFkStrassenschluessel =
          (cleanedMastValues.fk_strassenschluessel as
            | number
            | null
            | undefined) ?? null;
        leuchteStrassenschluesselId = mastFkStrassenschluessel;
        const mastPayload: Record<string, unknown> = {
          id: -1,
          ...cleanedMastValues,
          fk_strassenschluessel: mastFkStrassenschluessel,
          ...(geomPayload ? { geom: geomPayload } : {}),
        };
        const mastResult = await updateDataByClassName(
          jwt,
          featureSaveConfigs["standort"].className,
          mastPayload
        );
        const mastRes = mastResult as { res?: string } | null;
        const parsedMast = mastRes?.res
          ? (JSON.parse(mastRes.res) as { id?: number })
          : null;
        const newMastId = parsedMast?.id;
        if (!newMastId) {
          return {
            ...base,
            success: false,
            error: "Standort erstellt, aber keine ID erhalten",
          };
        }
        mastIdForLink = Number(newMastId);
      }

      payload = {
        id: -1,
        ...formValues,
        fk_strassenschluessel:
          (formValues.fk_strassenschluessel as number | null | undefined) ??
          leuchteStrassenschluesselId,
        tdta_standort_mast: { id: mastIdForLink },
      };
    } else {
      payload = {
        id: -1,
        ...formValues,
        ...(geomPayload ? { geom: geomPayload } : {}),
      };
    }

    // When creating a Leuchte bound to an existing Standort the payload has
    // no `geom` (the Leuchte links to the Mast via tdta_standort_mast.id).
    // The backend still wants the spatial location, so we send the picked
    // Standort's 4326 point as a sibling `geometry` SaveObject parameter.
    // Only fires for this specific branch — every other path keeps the
    // historical two-parameter shape.
    const extraSaveParams =
      featureType === "leuchte" &&
      parseStandortIdFromKey(draft.geometryKey) != null &&
      draft.geometryWgs84
        ? {
            geometry: JSON.stringify({
              type: "Point",
              crs: {
                type: "name",
                properties: { name: "urn:ogc:def:crs:EPSG::4326" },
              },
              coordinates: draft.geometryWgs84.coordinates,
            }),
          }
        : undefined;

    // Diagnostic: the new feature is going out with neither a `geom` field nor a
    // sibling `geometry` param — it will persist without a location. A Leuchte
    // bound to an existing Standort legitimately uses neither (it locates via
    // tdta_standort_mast), so it is exempt. Logs only; the save still proceeds.
    const payloadHasGeom = "geom" in payload || !!extraSaveParams;
    const leuchteBoundToStandort =
      featureType === "leuchte" &&
      parseStandortIdFromKey(draft.geometryKey) != null;
    if (!payloadHasGeom && !leuchteBoundToStandort) {
      console.error(
        `[SAVE-NO-GEOM] creation feature "${featureId}" (${featureType} → ${config.className}) is being sent WITHOUT geometry — draft.geometry is empty/undefined.`,
        { featureId, featureType, geometryKey: draft.geometryKey, geometry: draft.geometry }
      );
    }

    const result = await updateDataByClassName(
      jwt,
      config.className,
      payload,
      extraSaveParams
    );

    // Id of the row just created — needed both for late document upload and
    // (for a Standort) for linking its "+ Leuchte" tabs to the new Mast.
    const createdRes = result as { res?: string } | null;
    const createdId = createdRes?.res
      ? (JSON.parse(createdRes.res) as { id?: number }).id
      : undefined;

    // Upload files if any
    const draftFiles: DraftFile[] = draft.files ?? [];
    if (draftFiles.length > 0 && createdId) {
      const uploadedDocs = await uploadDraftFiles(jwt, draftFiles);
      if (uploadedDocs.length > 0) {
        await updateDataByClassName(jwt, config.className, {
          id: createdId,
          dokumenteArray: uploadedDocs,
        });
      }
    }

    // Standort creation with "+ Leuchte" tabs: persist each lamp as a
    // tdta_leuchten row linked to the freshly created Mast. Mirrors the
    // new-Mast extras loop in the leuchte branch below — the Leuchten share
    // the Mast's Strassenschluessel and locate via the tdta_standort_mast
    // link (no own geom). `_tabId` is a UI-only key; strip it before save.
    if (featureType === "standort" && createdId != null) {
      const extras = (draft.values?.leuchten ?? []) as Array<
        Record<string, unknown>
      >;
      const mastFk =
        (formValues.fk_strassenschluessel as number | null | undefined) ?? null;
      for (const extra of extras) {
        const { _tabId: _tabIdUnused, ...extraFields } = extra;
        void _tabIdUnused;
        const extraCleaned =
          prepareSaveValues("leuchte", { leuchte: extraFields }) ?? {};
        const extraPayload: Record<string, unknown> = {
          id: -1,
          ...extraCleaned,
          fk_strassenschluessel:
            (extraCleaned.fk_strassenschluessel as
              | number
              | null
              | undefined) ?? mastFk,
          tdta_standort_mast: { id: createdId },
        };
        await updateDataByClassName(
          jwt,
          featureSaveConfigs["leuchte"].className,
          extraPayload
        );
      }
    }

    // Scope B: persist any extra "+"-added Leuchten tabs. They live in
    // `draft.values.leuchten[]` and each entry shares the Mast with Leuchte 1
    // (mastIdForLink). `_tabId` is a UI-only key — strip it before save.
    // prepareSaveValues handles date deserialization, renames, and removing
    // display-only fields just like Leuchte 1.
    if (featureType === "leuchte" && mastIdForLink != null) {
      const extras = (draft.values?.leuchten ?? []) as Array<
        Record<string, unknown>
      >;
      for (const extra of extras) {
        const { _tabId: _tabIdUnused, ...extraFields } = extra;
        void _tabIdUnused;
        const extraCleaned =
          prepareSaveValues("leuchte", { leuchte: extraFields }) ?? {};
        const extraPayload: Record<string, unknown> = {
          id: -1,
          ...extraCleaned,
          fk_strassenschluessel:
            (extraCleaned.fk_strassenschluessel as
              | number
              | null
              | undefined) ?? leuchteStrassenschluesselId,
          tdta_standort_mast: { id: mastIdForLink },
        };
        await updateDataByClassName(
          jwt,
          config.className,
          extraPayload,
          extraSaveParams
        );
      }
    }

    return { ...base, success: true };
  } catch (error) {
    return {
      ...base,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// ---------------------------------------------------------------------------
// Bulk save all drafts
// ---------------------------------------------------------------------------

export interface SaveAllResult {
  succeeded: string[];
  failed: { featureId: string; featureType: string; error: string }[];
}

/**
 * Saves all provided drafts sequentially.
 * Returns arrays of succeeded and failed feature IDs.
 */
export const saveAllFeatureDrafts = async (
  jwt: string,
  drafts: Record<string, Draft>,
  strassenschluesselByPk?: Record<string, number>
): Promise<SaveAllResult> => {
  const succeeded: string[] = [];
  const failed: SaveAllResult["failed"] = [];

  for (const [featureId, draft] of Object.entries(drafts)) {
    const result = await saveFeatureDraft(
      jwt,
      featureId,
      draft,
      strassenschluesselByPk
    );
    if (result.success) {
      succeeded.push(featureId);
    } else {
      failed.push({
        featureId,
        featureType: result.featureType,
        error: result.error ?? "Unknown error",
      });
    }
  }

  return { succeeded, failed };
};

// ---------------------------------------------------------------------------
// Confirm & save all drafts (UI handler)
// ---------------------------------------------------------------------------

interface HandleSaveAllDeps {
  jwt: string | undefined;
  drafts: Record<string, Draft>;
  draftCount: number;
  setSaving: (saving: boolean) => void;
  dispatch: (action: any) => void;
  removeDraft: (featureId: string) => unknown;
  /** Action creator for `promoteDraftHiddenToPermanent` from the
   * featuresForms slice. Dispatched per successfully-saved draft *before*
   * removeDraft so hiddenOriginalIds survive the draft's deletion. */
  promoteDraftHiddenToPermanent: (featureId: string) => unknown;
  /** Action creator for `markFeatureDeleted` from the featuresForms slice.
   * Dispatched per successfully-saved *deletion* draft so the soft-deleted row
   * stays hidden on both maps until the server-side tiles/brandnew FC drop it. */
  markFeatureDeleted: (payload: {
    featureId: string;
    sourceLayer?: string;
    featureDbId?: number;
  }) => unknown;
  incrementFeatureDataVersion: () => unknown;
  /** Current measurement features (already namespaced as
   * `measurement.<uuid>` in id) — used to find which ones to drop after
   * successful creation saves and to derive their raw terra-draw ids. */
  measurements: Feature[];
  setMeasurements: (features: Feature[]) => unknown;
  /** Fires once the batch finishes if at least one draft saved successfully.
   * The caller wires this to `closeDatasheet` so the right pane returns to
   * the map view — the form was bound to drafts that no longer exist. */
  onSuccess?: () => void;
  /** Strassenschluessel pk → id map, used to backfill a missing
   * `fk_strassenschluessel` from the visible pk at save time. */
  strassenschluesselByPk?: Record<string, number>;
}

export const handleSaveAllDrafts = (deps: HandleSaveAllDeps) => {
  const {
    jwt,
    drafts,
    draftCount,
    setSaving,
    dispatch,
    removeDraft,
    promoteDraftHiddenToPermanent,
    markFeatureDeleted,
    incrementFeatureDataVersion,
    measurements,
    setMeasurements,
    onSuccess,
    strassenschluesselByPk,
  } = deps;

  // Brandnew creation drafts without a geometry would be POSTed with no geom
  // field, producing NULL-geometry rows server-side that surface the next day
  // as malformed features in brand.new.features.json. Filter them out of the
  // save batch entirely and keep them in Redux as drafts — the user has to
  // assign a geometry before they can be sent.
  const skippedEmptyDraftIds: string[] = [];
  const draftsToSave: Record<string, Draft> = {};
  for (const [featureId, draft] of Object.entries(drafts)) {
    if (draft.isCreation && !draft.geometry) {
      skippedEmptyDraftIds.push(featureId);
    } else {
      draftsToSave[featureId] = draft;
    }
  }

  const draftsToSaveCount = Object.keys(draftsToSave).length;
  const skippedCount = skippedEmptyDraftIds.length;

  if (draftsToSaveCount === 0) {
    Modal.warning({
      title: "Keine speicherbaren Entwürfe",
      content:
        "Keine Entwürfe mit Geometrie zum Speichern vorhanden. Bitte zuerst eine Geometrie zuweisen.",
      okText: "OK",
    });
    return;
  }

  const creationCount = Object.values(draftsToSave).filter(
    (d) => d.isCreation
  ).length;
  const editCount = draftsToSaveCount - creationCount;
  const parts: string[] = [];
  if (editCount > 0)
    parts.push(editCount === 1 ? "1 Änderung" : `${editCount} Änderungen`);
  if (creationCount > 0)
    parts.push(
      creationCount === 1
        ? "1 neues Objekt"
        : `${creationCount} neue Objekte`
    );

  const skipNote =
    skippedCount > 0
      ? `\n\n${
          skippedCount === 1
            ? "1 Entwurf ohne Geometrie wird übersprungen"
            : `${skippedCount} Entwürfe ohne Geometrie werden übersprungen`
        } und bleibt als Entwurf erhalten.`
      : "";

  // Silence unused-var when draftCount was the headline number before the
  // partition. Kept as a dep field for backwards compatibility with callers
  // that pass the redux count.
  void draftCount;

  Modal.confirm({
    title: "Alle Entwürfe speichern?",
    content: `${parts.join(" und ")} ${
      draftsToSaveCount === 1 ? "wird" : "werden"
    } gespeichert.${skipNote}`,
    okText: "Alle speichern",
    cancelText: "Abbrechen",
    onOk: async () => {
      if (!jwt) {
        message.error("Nicht authentifiziert");
        return;
      }

      setSaving(true);
      try {
        const result = await saveAllFeatureDrafts(
          jwt,
          draftsToSave,
          strassenschluesselByPk
        );

        for (const featureId of result.succeeded) {
          // A committed soft-delete must stay hidden on both maps until the
          // server-side tiles/brandnew FC drop the row; other saves promote
          // their draft's hide to the (vector-only) permanent set as before.
          if (draftsToSave[featureId]?.pendingDeletion) {
            dispatch(markFeatureDeleted({ featureId }));
          } else {
            dispatch(promoteDraftHiddenToPermanent(featureId));
          }
          dispatch(removeDraft(featureId));
        }

        if (result.succeeded.length > 0) {
          // Drop measurements consumed by successful saves: from the dropdown
          // source (Redux) and from the on-map terra-draw layer. Applies to
          // creation drafts (measurement used as the new feature's geometry)
          // AND geometry-edit drafts (an existing feature reshaped to a
          // measurement) alike — once saved, that measurement is spent and
          // must not linger on the map. (`handleServerSave` for the single-
          // save button already treats both cases; this mirrors it.) Draft
          // geometryKeys are built as `measurement.${f.id}` from the same
          // Redux feature ids, so matching against that synthesis and then
          // stripping one prefix recovers the raw terra-draw id.
          const consumedKeys = new Set<string>();
          for (const featureId of result.succeeded) {
            const d = drafts[featureId];
            if (d?.geometryKey?.startsWith("measurement.")) {
              consumedKeys.add(d.geometryKey);
            }
          }
          if (consumedKeys.size > 0) {
            const rawIds: string[] = [];
            const filtered = measurements.filter((f) => {
              const key = `measurement.${String(f.id)}`;
              if (consumedKeys.has(key)) {
                rawIds.push(String(f.id).replace(/^measurement\./, ""));
                return false;
              }
              return true;
            });
            if (rawIds.length > 0) {
              dispatch(setMeasurements(filtered));
              removeMeasurements(rawIds);
            }
          }

          dispatch(incrementFeatureDataVersion());
          onSuccess?.();
        }

        for (const fail of result.failed) {
          message.error(`${fail.featureType}: ${fail.error}`);
        }

        const total = result.succeeded.length + result.failed.length;
        if (result.failed.length === 0) {
          message.success(
            result.succeeded.length === 1
              ? "Entwurf gespeichert."
              : `Alle (${result.succeeded.length}) Entwürfe gespeichert.`
          );
        } else if (result.succeeded.length === 0) {
          message.error("Alle Entwürfe fehlgeschlagen");
        } else {
          message.warning(
            `${result.succeeded.length} von ${total} gespeichert, ${result.failed.length} fehlgeschlagen`
          );
        }
        if (skippedCount > 0) {
          message.info(
            skippedCount === 1
              ? "1 Entwurf ohne Geometrie wurde übersprungen."
              : `${skippedCount} Entwürfe ohne Geometrie wurden übersprungen.`
          );
        }
      } finally {
        setSaving(false);
      }
    },
  });
};
