import dayjs from "dayjs";
import { Modal, message } from "antd";
import type { Feature } from "geojson";
import type { DokumentItem } from "../components/ui/DocumentPreview";
import { getDocumentKey } from "../components/ui/FilePreview";
import type { Draft, DraftFile } from "../store/slices/featuresForms";
import { updateDataByClassName } from "./apiMethods";
import { normalizeSensorValues } from "../components/ui/featuresForm/sensorFields";
import { uploadDraftFiles } from "./uploadDraftFiles";
import { parseStandortIdFromKey } from "./geometryOptions";
import { removeMeasurements } from "@carma-mapping/measurements";

// Copy of the FeaturesFormsWrapper dayjs (de)serialization.
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
      result[key] = value.format("YYYY-MM-DDTHH:mm:ss");
    } else {
      result[key] = value;
    }
  }
  return result;
};

/** pk → id map, used to backfill a missing `fk_strassenschluessel`. */
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
    // "+ Leuchte" tabs, saved separately as tdta_leuchten rows.
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

/** Draft values → API payload (per-type removals, renames, dates). */
export const prepareSaveValues = (
  featureType: string,
  serializedDraftValues: Record<string, unknown>,
  strassenschluesselByPk?: Record<string, number>
): Record<string, unknown> | null => {
  const config = featureSaveConfigs[featureType];
  if (!config) return null;

  let raw: Record<string, unknown>;
  if (config.valuesPath) {
    const nested = serializedDraftValues[config.valuesPath];
    if (!nested || typeof nested !== "object") return {};
    raw = nested as Record<string, unknown>;
  } else {
    raw = { ...serializedDraftValues };
  }

  const deserialized = deserializeValues(raw);

  // The street is saved only via the hidden fk_strassenschluessel, which can be
  // missing in hydrated or copied drafts. Resolve it from the visible pk.
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

  // Leitung: only explicitFields are sent.
  if (config.explicitFields) {
    const result: Record<string, unknown> = {};
    for (const field of config.explicitFields) {
      result[field] = config.nullifyUndefined
        ? deserialized[field] ?? null
        : deserialized[field];
    }
    return result;
  }

  // Remove display-only fields, keeping values that get renamed.
  const renamed: Record<string, unknown> = {};
  for (const field of config.removedFields) {
    if (field in deserialized && config.fieldRenames[field]) {
      renamed[config.fieldRenames[field]] = deserialized[field];
    }
    delete deserialized[field];
  }

  // Renames of fields that are not removed
  for (const [from, to] of Object.entries(config.fieldRenames)) {
    if (from in deserialized) {
      renamed[to] = deserialized[from];
      delete deserialized[from];
    }
  }

  const merged = { ...deserialized, ...renamed };

  // Cleared Selects arrive as undefined; the backend needs null.
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      merged[key] = null;
    }
  }

  // An emptied Sensor-ID must go out as null, not ""
  const normalized = normalizeSensorValues(merged);

  if (config.transformDates) {
    return transformDatesForBackend(normalized);
  }

  return normalized;
};

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

export interface SaveResult {
  success: boolean;
  featureId: string;
  featureType: string;
  error?: string;
}

/** Saves one draft. The caller removes it from Redux on success. */
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

  // Soft delete: send only { id, is_deleted: true }.
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
      await updateDataByClassName(jwt, config.className, deletePayload);
      return { ...base, success: true };
    } catch (error) {
      return {
        ...base,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  if (draft.isCreation) {
    return saveCreationDraft(
      jwt,
      featureId,
      draft,
      config,
      strassenschluesselByPk
    );
  }

  if (featureDbId == null) {
    return {
      ...base,
      success: false,
      error: "Missing database ID (featureDbId)",
    };
  }

  try {
    let uploadedDocuments: DokumentItem[] = [];
    const draftFiles: DraftFile[] = draft.files ?? [];
    if (draftFiles.length > 0) {
      uploadedDocuments = await uploadDraftFiles(jwt, draftFiles);
    }

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

    const formValues = prepareSaveValues(
      featureType,
      draft.values ?? {},
      strassenschluesselByPk
    );
    // Owned by the Standort; a stale lamp draft must not overwrite them.
    if (featureType === "leuchte" && formValues) {
      delete formValues.lfd_nummer;
      delete formValues.fk_strassenschluessel;
    }

    // Geometry edit: update the existing geom row in place (id -1 if unknown).
    // "current.*" keys mean the geometry is unchanged.
    const geometryEdited =
      !!draft.geometry &&
      !!draft.geometryKey &&
      !draft.geometryKey.startsWith("current.");
    const geomPayload = geometryEdited
      ? { id: draft.featureGeomId ?? -1, geo_field: draft.geometry }
      : undefined;

    // Diagnostic only: a geometry change was selected but no geom is sent.
    const geometryChangeIntended =
      !!draft.geometryKey && !draft.geometryKey.startsWith("current.");
    if (geometryChangeIntended && !geomPayload) {
      console.error(
        `[SAVE-NO-GEOM] edit feature "${featureId}" (${featureType}) had a geometry change selected (geometryKey=${draft.geometryKey}) but is being sent WITHOUT geom — draft.geometry is empty/undefined.`,
        {
          featureId,
          featureType,
          geometryKey: draft.geometryKey,
          featureGeomId: draft.featureGeomId,
        }
      );
    }

    const dataToSave: Record<string, unknown> = {
      id: featureDbId,
      ...(formValues ?? {}),
      ...(finalDokumenteArray !== undefined
        ? { dokumenteArray: finalDokumenteArray }
        : {}),
      ...(geomPayload ? { geom: geomPayload } : {}),
    };

    await updateDataByClassName(jwt, config.className, dataToSave);

    if (featureType === "standort" && formValues) {
      await syncStandortFieldsToLeuchten(jwt, draft, formValues);
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

// Leuchten keep their own copy of these Standort fields.
const syncStandortFieldsToLeuchten = async (
  jwt: string,
  draft: Draft,
  formValues: Record<string, unknown>
) => {
  const mast = (
    draft.fetchedData?.tdta_standort_mast as
      | Array<Record<string, unknown>>
      | undefined
  )?.[0];
  if (!mast) return;

  const originalFk =
    (mast.tkey_strassenschluessel as { id?: number } | null | undefined)?.id ??
    null;
  const changes: Record<string, unknown> = {};
  if (
    "fk_strassenschluessel" in formValues &&
    (formValues.fk_strassenschluessel ?? null) !== originalFk
  ) {
    changes.fk_strassenschluessel = formValues.fk_strassenschluessel;
  }
  if (
    "lfd_nummer" in formValues &&
    String(formValues.lfd_nummer ?? "") !== String(mast.lfd_nummer ?? "")
  ) {
    changes.lfd_nummer = formValues.lfd_nummer;
  }
  if (Object.keys(changes).length === 0) return;

  const leuchten = (
    (mast.leuchtenArray ?? []) as Array<Record<string, unknown>>
  ).filter((l) => l.is_deleted !== true && l.id != null);
  const failed: unknown[] = [];
  for (const leuchte of leuchten) {
    try {
      await updateDataByClassName(jwt, "tdta_leuchten", {
        id: leuchte.id,
        ...changes,
      });
    } catch (err) {
      console.error("[SAVE] Leuchte sync failed", { id: leuchte.id, err });
      failed.push(leuchte.id);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `Standort gespeichert, aber Leuchte(n) #${failed.join(
        ", #"
      )} konnten nicht aktualisiert werden`
    );
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
      prepareSaveValues(
        featureType,
        draft.values ?? {},
        strassenschluesselByPk
      ) ?? {};
    let payload: Record<string, unknown>;
    // Also used by the extra-Leuchten loop below.
    let mastIdForLink: number | undefined;
    let leuchteStrassenschluesselId: number | null = null;

    if (featureType === "leuchte") {
      const linkedMastId = parseStandortIdFromKey(draft.geometryKey);

      // The Leuchte gets the Mast's street (hidden on the Leuchte tab) so its
      // joined view shows the street name.
      if (linkedMastId != null) {
        // Existing Standort: reuse it and its fk_strassenschluessel.
        mastIdForLink = linkedMastId;
        const mastSlice = (draft.values?.mast ?? {}) as Record<string, unknown>;
        const linkedFk = mastSlice.fk_strassenschluessel;
        if (typeof linkedFk === "number" && Number.isFinite(linkedFk)) {
          leuchteStrassenschluesselId = linkedFk;
        }
      } else {
        // New Mast from the Standort tab values.
        const rawMastValues = (draft.values?.mast ?? {}) as Record<
          string,
          unknown
        >;
        const cleanedMastValues =
          prepareSaveValues(
            "standort",
            rawMastValues,
            strassenschluesselByPk
          ) ?? {};
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

    // A Leuchte on an existing Standort has no geom; the backend still needs
    // its location, sent as a separate `geometry` parameter (EPSG:4326).
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

    // Diagnostic only: no geometry at all (Leuchten on a Standort are exempt).
    const payloadHasGeom = "geom" in payload || !!extraSaveParams;
    const leuchteBoundToStandort =
      featureType === "leuchte" &&
      parseStandortIdFromKey(draft.geometryKey) != null;
    if (!payloadHasGeom && !leuchteBoundToStandort) {
      console.error(
        `[SAVE-NO-GEOM] creation feature "${featureId}" (${featureType} → ${config.className}) is being sent WITHOUT geometry — draft.geometry is empty/undefined.`,
        {
          featureId,
          featureType,
          geometryKey: draft.geometryKey,
          geometry: draft.geometry,
        }
      );
    }

    const result = await updateDataByClassName(
      jwt,
      config.className,
      payload,
      extraSaveParams
    );

    // Needed for the late document upload and for linking "+ Leuchte" tabs.
    const createdRes = result as { res?: string } | null;
    const createdId = createdRes?.res
      ? (JSON.parse(createdRes.res) as { id?: number }).id
      : undefined;

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

    // New Standort: save its "+ Leuchte" tabs linked to it, with its street.
    // `_tabId` is UI-only.
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
            (extraCleaned.fk_strassenschluessel as number | null | undefined) ??
            mastFk,
          tdta_standort_mast: { id: createdId },
        };
        await updateDataByClassName(
          jwt,
          featureSaveConfigs["leuchte"].className,
          extraPayload
        );
      }
    }

    // Extra "+" Leuchten share Leuchte 1's Mast and street.
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
            (extraCleaned.fk_strassenschluessel as number | null | undefined) ??
            leuchteStrassenschluesselId,
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

export interface SaveAllResult {
  succeeded: string[];
  failed: { featureId: string; featureType: string; error: string }[];
}

/** Saves drafts one after another. */
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

interface HandleSaveAllDeps {
  jwt: string | undefined;
  drafts: Record<string, Draft>;
  draftCount: number;
  setSaving: (saving: boolean) => void;
  dispatch: (action: any) => void;
  removeDraft: (featureId: string) => unknown;
  /** Dispatched before removeDraft so hiddenOriginalIds survive. */
  promoteDraftHiddenToPermanent: (featureId: string) => unknown;
  /** Keeps soft-deleted rows hidden until the tiles drop them. */
  markFeatureDeleted: (payload: {
    featureId: string;
    sourceLayer?: string;
    featureDbId?: number;
  }) => unknown;
  incrementFeatureDataVersion: () => unknown;
  /** Namespaced `measurement.<uuid>`; used to drop consumed measurements. */
  measurements: Feature[];
  setMeasurements: (features: Feature[]) => unknown;
  /** Called if at least one draft saved (closes the datasheet). */
  onSuccess?: () => void;
  /** pk → id map to backfill a missing `fk_strassenschluessel`. */
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

  // Creation drafts without geometry would create NULL-geometry rows; keep
  // them as drafts instead of saving.
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
      creationCount === 1 ? "1 neues Objekt" : `${creationCount} neue Objekte`
    );

  const skipNote =
    skippedCount > 0
      ? `\n\n${
          skippedCount === 1
            ? "1 Entwurf ohne Geometrie wird übersprungen"
            : `${skippedCount} Entwürfe ohne Geometrie werden übersprungen`
        } und bleibt als Entwurf erhalten.`
      : "";

  // Kept for caller compatibility; no longer used.
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
          // Soft deletes stay hidden until the tiles drop the row.
          if (draftsToSave[featureId]?.pendingDeletion) {
            dispatch(markFeatureDeleted({ featureId }));
          } else {
            dispatch(promoteDraftHiddenToPermanent(featureId));
          }
          dispatch(removeDraft(featureId));
        }

        if (result.succeeded.length > 0) {
          // Remove measurements used as geometry by saved drafts (creation and
          // geometry edit) from Redux and the map. Keys are `measurement.<id>`.
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
