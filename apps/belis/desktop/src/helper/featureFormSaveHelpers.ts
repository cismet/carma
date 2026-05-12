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
    removedFields: ["strassenschluessel_pk", "strassenschluessel_strasse"],
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
  serializedDraftValues: Record<string, unknown>
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
  draft: Draft
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

  // Creation drafts: create new feature with id: -1
  if (draft.isCreation) {
    return saveCreationDraft(jwt, featureId, draft, config);
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
    const formValues = prepareSaveValues(featureType, draft.values ?? {});

    // 4. Build final payload
    const dataToSave: Record<string, unknown> = {
      id: featureDbId,
      ...(formValues ?? {}),
      ...(finalDokumenteArray !== undefined
        ? { dokumenteArray: finalDokumenteArray }
        : {}),
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
  config: FeatureSaveConfig
): Promise<SaveResult> => {
  const { featureType } = draft;
  const base = { featureId, featureType };
  const geomPayload = draft.geometry
    ? { id: -1, geo_field: draft.geometry }
    : undefined;

  try {
    console.debug("[CREATE-FEATURE] raw draft.values:", JSON.stringify(draft.values, null, 2));
    const formValues = prepareSaveValues(featureType, draft.values ?? {}) ?? {};
    console.debug("[CREATE-FEATURE] after prepareSaveValues:", JSON.stringify(formValues, null, 2));
    let payload: Record<string, unknown>;

    if (featureType === "leuchte") {
      const linkedMastId = parseStandortIdFromKey(draft.geometryKey);
      const leuchteValues = (draft.values?.leuchte ?? {}) as Record<
        string,
        unknown
      >;

      let mastIdForLink: number;
      if (linkedMastId != null) {
        // Existing Standort was selected — reuse it, no new Mast created.
        mastIdForLink = linkedMastId;
      } else {
        // Build the Mast payload from the form's Mast tab values, falling
        // back to the same defaults that used to be hardcoded so a Mast can
        // still be created if the user leaves required fields blank.
        const rawMastValues = (draft.values?.mast ?? {}) as Record<
          string,
          unknown
        >;
        const cleanedMastValues =
          prepareSaveValues("standort", rawMastValues) ?? {};
        const mastPayload: Record<string, unknown> = {
          id: -1,
          ...cleanedMastValues,
          // Defaults applied last so a missing or null form value still
          // produces a saveable Mast. Leuchte's strassenschluessel always
          // wins for the Mast since the field is hidden on the Mast tab.
          lfd_nummer: cleanedMastValues.lfd_nummer ?? 1,
          fk_strassenschluessel:
            leuchteValues.fk_strassenschluessel ?? null,
          fk_mastart: cleanedMastValues.fk_mastart ?? 8,
          fk_masttyp: cleanedMastValues.fk_masttyp ?? 42,
          ...(geomPayload ? { geom: geomPayload } : {}),
        };
        console.debug(
          "[CREATE-FEATURE] Standort payload:",
          JSON.stringify(mastPayload, null, 2)
        );
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
        tdta_standort_mast: { id: mastIdForLink },
      };
    } else {
      payload = {
        id: -1,
        ...formValues,
        ...(geomPayload ? { geom: geomPayload } : {}),
      };
    }

    console.debug(`[CREATE-FEATURE] ${featureType} → ${config.className} payload:`, JSON.stringify(payload, null, 2));
    const result = await updateDataByClassName(jwt, config.className, payload);
    console.debug(`[CREATE-FEATURE] ${featureType} → ${config.className} result:`, JSON.stringify(result, null, 2));

    // Upload files if any
    const draftFiles: DraftFile[] = draft.files ?? [];
    if (draftFiles.length > 0) {
      const res = result as { res?: string } | null;
      const parsed = res?.res
        ? (JSON.parse(res.res) as { id?: number })
        : null;
      const newId = parsed?.id;
      if (newId) {
        const uploadedDocs = await uploadDraftFiles(jwt, draftFiles);
        if (uploadedDocs.length > 0) {
          await updateDataByClassName(jwt, config.className, {
            id: newId,
            dokumenteArray: uploadedDocs,
          });
        }
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
  drafts: Record<string, Draft>
): Promise<SaveAllResult> => {
  const succeeded: string[] = [];
  const failed: SaveAllResult["failed"] = [];

  for (const [featureId, draft] of Object.entries(drafts)) {
    const result = await saveFeatureDraft(jwt, featureId, draft);
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
}

export const handleSaveAllDrafts = (deps: HandleSaveAllDeps) => {
  const {
    jwt,
    drafts,
    draftCount,
    setSaving,
    dispatch,
    removeDraft,
    incrementFeatureDataVersion,
    measurements,
    setMeasurements,
    onSuccess,
  } = deps;

  const creationCount = Object.values(drafts).filter(
    (d) => d.isCreation
  ).length;
  const editCount = draftCount - creationCount;
  const parts: string[] = [];
  if (editCount > 0)
    parts.push(editCount === 1 ? "1 Änderung" : `${editCount} Änderungen`);
  if (creationCount > 0)
    parts.push(
      creationCount === 1
        ? "1 neues Objekt"
        : `${creationCount} neue Objekte`
    );

  Modal.confirm({
    title: "Alle Entwürfe speichern?",
    content: `${parts.join(" und ")} ${
      draftCount === 1 ? "wird" : "werden"
    } gespeichert.`,
    okText: "Alle speichern",
    cancelText: "Abbrechen",
    onOk: async () => {
      if (!jwt) {
        message.error("Nicht authentifiziert");
        return;
      }

      setSaving(true);
      try {
        const result = await saveAllFeatureDrafts(jwt, drafts);

        for (const featureId of result.succeeded) {
          dispatch(removeDraft(featureId));
        }

        if (result.succeeded.length > 0) {
          // Drop measurements consumed by successful creation saves: from
          // the dropdown source (Redux) and from the on-map terra-draw
          // layer. Draft geometryKeys are double-prefixed
          // (`measurement.measurement.<uuid>`) and Redux feature ids carry
          // one `measurement.` prefix — match against the same
          // single-prefix synthesis used in the dropdown builder, then
          // strip one prefix to recover the raw terra-draw id.
          const consumedKeys = new Set<string>();
          for (const featureId of result.succeeded) {
            const d = drafts[featureId];
            if (d?.isCreation && d.geometryKey?.startsWith("measurement.")) {
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
      } finally {
        setSaving(false);
      }
    },
  });
};
