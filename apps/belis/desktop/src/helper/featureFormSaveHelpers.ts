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

  // "Leitung verlängern": the user keeps the existing Leitung and only edits
  // its geometry (plus the editable fk_* fields). Update the existing row in
  // place — same id, same geom record — instead of falling through to the
  // creation path that would POST a new feature with id: -1.
  // if (draft.isExtension && draft.extendingLeitungId != null) {
  //   return saveExtensionDraft(jwt, featureId, draft, config);
  // }

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

// "Leitung verlängern": update the existing Leitung in place. The merged
// LineString (original + picked extension) is already in draft.geometry
// (EPSG:25832, written by FeaturesFormsWrapper.handleGeometryChange via
// mergeLineStringsClosestEndpoints). Sending it back under the same Leitung
// id and same geom id preserves the Leitung's identity — the user expects
// "verlängern" to extend a known L-13564, not replace it with a new id.
// const saveExtensionDraft = async (
//   jwt: string,
//   featureId: string,
//   draft: Draft,
//   config: FeatureSaveConfig
// ): Promise<SaveResult> => {
//   const { featureType, extendingLeitungId, extendingGeomId } = draft;
//   const base = { featureId, featureType };
//
//   if (extendingLeitungId == null) {
//     return {
//       ...base,
//       success: false,
//       error: "Missing extendingLeitungId",
//     };
//   }
//   if (!draft.geometry) {
//     return {
//       ...base,
//       success: false,
//       error: "Missing geometry on extension draft",
//     };
//   }
//
//   try {
//     const formValues = prepareSaveValues(featureType, draft.values ?? {}) ?? {};
//     // Update the same `geom` row so the Leitung's foreign key stays intact.
//     // Falling back to id: -1 when the geom id wasn't captured (e.g. JWT was
//     // missing at draft-open time) — the backend then creates a fresh geom
//     // and re-links it; still preferable to losing the Leitung's id.
//     const geomPayload = {
//       id: extendingGeomId ?? -1,
//       geo_field: draft.geometry,
//     };
//     const dataToSave: Record<string, unknown> = {
//       id: extendingLeitungId,
//       ...formValues,
//       geom: geomPayload,
//     };
//     await updateDataByClassName(jwt, config.className, dataToSave);
//     return { ...base, success: true };
//   } catch (error) {
//     return {
//       ...base,
//       success: false,
//       error: error instanceof Error ? error.message : "Unknown error",
//     };
//   }
// };

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
          prepareSaveValues("standort", rawMastValues) ?? {};
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

    console.debug(`[CREATE-FEATURE] ${featureType} → ${config.className} payload:`, JSON.stringify(payload, null, 2));
    const result = await updateDataByClassName(
      jwt,
      config.className,
      payload,
      extraSaveParams
    );
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

    // Scope B: persist any extra "+"-added Leuchten tabs. They live in
    // `draft.values.leuchten[]` and each entry shares the Mast with Leuchte 1
    // (mastIdForLink). `_tabId` is a UI-only key — strip it before save.
    // prepareSaveValues handles date deserialization, renames, and removing
    // display-only fields just like Leuchte 1.
    if (featureType === "leuchte" && mastIdForLink != null) {
      const extras = (draft.values?.leuchten ?? []) as Array<
        Record<string, unknown>
      >;
      for (const [extraIdx, extra] of extras.entries()) {
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
        console.debug(
          `[CREATE-FEATURE] extra leuchte ${extraIdx + 1} payload:`,
          JSON.stringify(extraPayload, null, 2)
        );
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
  /** Action creator for `promoteDraftHiddenToPermanent` from the
   * featuresForms slice. Dispatched per successfully-saved draft *before*
   * removeDraft so hiddenOriginalIds survive the draft's deletion. */
  promoteDraftHiddenToPermanent: (featureId: string) => unknown;
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
    promoteDraftHiddenToPermanent,
    incrementFeatureDataVersion,
    measurements,
    setMeasurements,
    onSuccess,
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
        const result = await saveAllFeatureDrafts(jwt, draftsToSave);

        for (const featureId of result.succeeded) {
          dispatch(promoteDraftHiddenToPermanent(featureId));
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
