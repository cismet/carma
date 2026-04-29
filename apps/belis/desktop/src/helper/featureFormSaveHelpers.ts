import dayjs from "dayjs";
import { Modal, message } from "antd";
import type { DokumentItem } from "../components/ui/DocumentPreview";
import { getDocumentKey } from "../components/ui/FilePreview";
import type { Draft, DraftFile } from "../store/slices/featuresForms";
import { updateDataByClassName } from "./apiMethods";
import { uploadDraftFiles } from "./uploadDraftFiles";

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
    removedFields: [
      "strassenschluessel_pk",
      "strassenschluessel_strasse",
      "sonderturnus",
    ],
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
    const formValues = prepareSaveValues(featureType, draft.values ?? {}) ?? {};
    let payload: Record<string, unknown>;

    if (featureType === "leuchte") {
      // Two-step: create Standort first, then Leuchte
      const mastPayload: Record<string, unknown> = {
        id: -1,
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
      payload = {
        id: -1,
        ...formValues,
        tdta_standort_mast: { id: Number(newMastId) },
      };
    } else {
      payload = {
        id: -1,
        ...formValues,
        ...(geomPayload ? { geom: geomPayload } : {}),
      };
    }

    const result = await updateDataByClassName(jwt, config.className, payload);

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
          dispatch(incrementFeatureDataVersion());
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
