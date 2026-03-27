import dayjs from "dayjs";
import type {
  AADraft,
  APDraft,
  DraftAction,
} from "../store/slices/arbeitsauftraegeDrafts";
import { DAYJS_PREFIX, deserializeValues } from "./draftSerialize";
import { executeAction, updateDataByClassName } from "./apiMethods";

// ---------------------------------------------------------------------------
// Date transformation for updateDataByClassName payloads
// ---------------------------------------------------------------------------

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

const prepareValuesForSave = (
  serializedValues: Record<string, unknown>
): Record<string, unknown> => {
  const deserialized = deserializeValues(serializedValues);
  return transformDatesForBackend(deserialized);
};

// ---------------------------------------------------------------------------
// Single draft save
// ---------------------------------------------------------------------------

export interface AASaveResult {
  success: boolean;
  id: string;
  error?: string;
}

export interface APSaveResult {
  success: boolean;
  id: string;
  error?: string;
}

const saveAADraft = async (
  jwt: string,
  id: string,
  draft: AADraft
): Promise<AASaveResult> => {
  try {
    const dataToSave: Record<string, unknown> = {
      id: Number(id),
      ...prepareValuesForSave(draft.values ?? {}),
    };

    await updateDataByClassName(jwt, "arbeitsauftrag", dataToSave);
    return { success: true, id };
  } catch (error) {
    return {
      success: false,
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

const saveAPDraft = async (
  jwt: string,
  id: string,
  draft: APDraft
): Promise<APSaveResult> => {
  try {
    const prepared = prepareValuesForSave(draft.values ?? {});

    // Convert datum to millis (same format as action endpoints)
    if (prepared.datum != null) {
      const d = dayjs(prepared.datum as string);
      if (d.isValid()) {
        prepared.datum = d.valueOf();
      }
    }

    // Remap status (form field) → arbeitsprotokollstatus (server FK object)
    if (prepared.status != null) {
      prepared.arbeitsprotokollstatus = { id: prepared.status };
      delete prepared.status;
    }

    const dataToSave: Record<string, unknown> = {
      id: Number(id),
      ...prepared,
    };

    await updateDataByClassName(jwt, "arbeitsprotokoll", dataToSave);
    return { success: true, id };
  } catch (error) {
    return {
      success: false,
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// ---------------------------------------------------------------------------
// Bulk save all AA and AP drafts
// ---------------------------------------------------------------------------

export interface SaveAllArbeitsauftraegeResult {
  aa: { succeeded: string[]; failed: { id: string; error: string }[] };
  ap: { succeeded: string[]; failed: { id: string; error: string }[] };
}

export const saveAllArbeitsauftraegeDrafts = async (
  jwt: string,
  aaDrafts: Record<string, AADraft>,
  apDrafts: Record<string, APDraft>
): Promise<SaveAllArbeitsauftraegeResult> => {
  const aa: SaveAllArbeitsauftraegeResult["aa"] = {
    succeeded: [],
    failed: [],
  };
  const ap: SaveAllArbeitsauftraegeResult["ap"] = {
    succeeded: [],
    failed: [],
  };

  for (const [id, draft] of Object.entries(aaDrafts)) {
    const result = await saveAADraft(jwt, id, draft);
    if (result.success) {
      aa.succeeded.push(id);
    } else {
      aa.failed.push({ id, error: result.error ?? "Unknown error" });
    }
  }

  for (const [id, draft] of Object.entries(apDrafts)) {
    const result = await saveAPDraft(jwt, id, draft);
    if (result.success) {
      ap.succeeded.push(id);
    } else {
      ap.failed.push({ id, error: result.error ?? "Unknown error" });
    }
  }

  return { aa, ap };
};

// ---------------------------------------------------------------------------
// AP Action save — config-driven approach
// ---------------------------------------------------------------------------

interface ParamMapping {
  /** Form field name (from aktionFieldConfig) */
  field: string;
  /** API parameter name (uppercase) */
  api: string;
  /** Value type for transformation */
  type: "date" | "id" | "text" | "double" | "boolean";
}

interface ActionSaveConfig {
  apiAction: string;
  params: ParamMapping[];
}

/**
 * Config lookup key: "actionLabel" or "actionLabel:fachobjektType" for
 * actions whose API differs per fachobjekt (e.g. Revision).
 */
const getConfigKey = (label: string, fachobjektType?: string): string => {
  const specific = `${label}:${fachobjektType}`;
  if (specific in ACTION_SAVE_CONFIGS) return specific;
  return label;
};

const ACTION_SAVE_CONFIGS: Record<string, ActionSaveConfig> = {
  Leuchtenerneuerung: {
    apiAction: "ProtokollLeuchteLeuchtenerneuerung",
    params: [
      { field: "inbetriebnahme_leuchte", api: "INBETRIEBNAHMEDATUM", type: "date" },
      { field: "fk_leuchttyp", api: "LEUCHTENTYP", type: "id" },
    ],
  },
  "Standsicherheitsprüfung": {
    apiAction: "ProtokollStandortStandsicherheitspruefung",
    params: [
      { field: "standsicherheitspruefung", api: "PRUEFDATUM", type: "date" },
      { field: "verfahren", api: "VERFAHREN", type: "text" },
      { field: "naechstes_pruefdatum", api: "NAECHSTES_PRUEFDATUM", type: "date" },
    ],
  },
  Sonstiges: {
    apiAction: "ProtokollFortfuehrungsantrag",
    params: [
      { field: "bemerkung", api: "BEMERKUNG", type: "text" },
    ],
  },
  "Rundsteuerempfängerwechsel": {
    apiAction: "ProtokollLeuchteRundsteuerempfaengerwechsel",
    params: [
      { field: "einbaudatum", api: "EINBAUDATUM", type: "date" },
      { field: "rundsteuerempfaenger", api: "RUNDSTEUEREMPFAENGER", type: "id" },
    ],
  },
  Anstricharbeiten: {
    apiAction: "ProtokollStandortAnstricharbeiten",
    params: [
      { field: "mastanstrich", api: "ANSTRICHDATUM", type: "date" },
      { field: "anstrichfarbe", api: "ANSTRICHFARBE", type: "text" },
    ],
  },
  // Revision: Mast (default) vs Schaltstelle (fachobjektType-specific)
  Revision: {
    apiAction: "ProtokollStandortRevision",
    params: [
      { field: "revision", api: "REVISIONSDATUM", type: "date" },
    ],
  },
  "Revision:schaltstelle": {
    apiAction: "ProtokollSchaltstelleRevision",
    params: [
      { field: "pruefdatum", api: "PRUEFDATUM", type: "date" },
    ],
  },
  Sonderturnus: {
    apiAction: "ProtokollLeuchteSonderturnus",
    params: [
      { field: "sonderturnus", api: "DATUM", type: "date" },
    ],
  },
  Masterneuerung: {
    apiAction: "ProtokollStandortMasterneuerung",
    params: [
      { field: "inbetriebnahme_mast", api: "INBETRIEBNAHMEDATUM", type: "date" },
      { field: "montagefirma", api: "MONTAGEFIRMA", type: "text" },
    ],
  },
  "Elektrische Prüfung": {
    apiAction: "ProtokollStandortElektrischePruefung",
    params: [
      { field: "elek_pruefung", api: "PRUEFDATUM", type: "date" },
      { field: "erdung", api: "ERDUNG_IN_ORDNUNG", type: "boolean" },
    ],
  },
  "Leuchtmittelwechsel (mit EP)": {
    apiAction: "ProtokollLeuchteLeuchtmittelwechselElekpruefung",
    params: [
      { field: "elek_pruefung", api: "PRUEFDATUM", type: "date" },
      { field: "erdung", api: "ERDUNG_IN_ORDNUNG", type: "boolean" },
      { field: "wechseldatum", api: "WECHSELDATUM", type: "date" },
      { field: "leuchtmittel", api: "LEUCHTMITTEL", type: "id" },
      { field: "lebensdauer", api: "LEBENSDAUER", type: "double" },
    ],
  },
  "Vorschaltgerätwechsel": {
    apiAction: "ProtokollLeuchteVorschaltgeraetwechsel",
    params: [
      { field: "wechselvorschaltgeraet", api: "WECHSELDATUM", type: "date" },
      { field: "vorschaltgeraet", api: "VORSCHALTGERAET", type: "text" },
    ],
  },
  "Prüfung": {
    apiAction: "ProtokollMauerlaschePruefung",
    params: [
      { field: "pruefdatum", api: "PRUEFDATUM", type: "date" },
    ],
  },
  Leuchtmittelwechsel: {
    apiAction: "ProtokollLeuchteLeuchtmittelwechsel",
    params: [
      { field: "wechseldatum", api: "WECHSELDATUM", type: "date" },
      { field: "leuchtmittel", api: "LEUCHTMITTEL", type: "id" },
      { field: "lebensdauer", api: "LEBENSDAUER", type: "double" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Value transformer: draft values → API parameter strings
// ---------------------------------------------------------------------------

const dayjsToMillis = (value: unknown): string => {
  if (typeof value === "string" && value.startsWith(DAYJS_PREFIX)) {
    const dateStr = value.slice(DAYJS_PREFIX.length);
    return String(new Date(dateStr).getTime());
  }
  if (typeof value === "number") {
    return String(value);
  }
  return String(value ?? "");
};

const transformValue = (value: unknown, type: ParamMapping["type"]): string => {
  switch (type) {
    case "date":
      return dayjsToMillis(value);
    case "id":
      return String(value ?? "");
    case "double": {
      const num = Number(value);
      return isNaN(num) ? "0" : String(num);
    }
    case "text":
      return String(value ?? "");
    case "boolean":
      return value ? "ja" : "nein";
  }
};

// ---------------------------------------------------------------------------
// Save a single AP action
// ---------------------------------------------------------------------------

export interface ActionSaveResult {
  success: boolean;
  actionLabel: string;
  error?: string;
}

const saveAPAction = async (
  jwt: string,
  protokollId: string,
  action: DraftAction
): Promise<ActionSaveResult> => {
  const configKey = getConfigKey(action.actionLabel, action.fachobjektType);
  const config = ACTION_SAVE_CONFIGS[configKey];
  if (!config) {
    return {
      success: false,
      actionLabel: action.actionLabel,
      error: `No save config for action "${action.actionLabel}" (${action.fachobjektType})`,
    };
  }

  const apiParams: Record<string, string> = {
    PROTOKOLL_ID: protokollId,
  };

  for (const mapping of config.params) {
    const rawValue = action.values[mapping.field];
    const transformed = transformValue(rawValue, mapping.type);
    if (transformed !== "") {
      apiParams[mapping.api] = transformed;
    }
  }

  try {
    await executeAction(jwt, config.apiAction, apiParams);
    return { success: true, actionLabel: action.actionLabel };
  } catch (error) {
    return {
      success: false,
      actionLabel: action.actionLabel,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// ---------------------------------------------------------------------------
// Save all actions for all AP drafts
// ---------------------------------------------------------------------------

export interface SaveAllAPActionsResult {
  succeeded: { apId: string; actionLabel: string }[];
  failed: { apId: string; actionLabel: string; error: string }[];
}

export const saveAllAPActions = async (
  jwt: string,
  apDrafts: Record<string, APDraft>
): Promise<SaveAllAPActionsResult> => {
  const result: SaveAllAPActionsResult = { succeeded: [], failed: [] };

  for (const [apId, draft] of Object.entries(apDrafts)) {
    const actions = draft.actions ?? [];
    for (const action of actions) {
      const saveResult = await saveAPAction(jwt, apId, action);
      if (saveResult.success) {
        result.succeeded.push({ apId, actionLabel: action.actionLabel });
      } else {
        result.failed.push({
          apId,
          actionLabel: action.actionLabel,
          error: saveResult.error ?? "Unknown error",
        });
      }
    }
  }

  return result;
};
