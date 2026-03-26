import type {
  AADraft,
  APDraft,
  DraftAction,
} from "../store/slices/arbeitsauftraegeDrafts";
import { DAYJS_PREFIX } from "./draftSerialize";
import { executeAction, updateDataByClassName } from "./apiMethods";

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
      ...draft.values,
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
    const dataToSave: Record<string, unknown> = {
      id: Number(id),
      ...draft.values,
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
  Revision: {
    apiAction: "ProtokollStandortRevision",
    params: [
      { field: "revision", api: "REVISIONSDATUM", type: "date" },
    ],
  },
  Sonderturnus: {
    apiAction: "ProtokollLeuchteSonderturnus",
    params: [
      { field: "sonderturnus", api: "DATUM", type: "date" },
    ],
  },
  "Elektrische Prüfung": {
    apiAction: "ProtokollStandortElektrischePruefung",
    params: [
      { field: "elek_pruefung", api: "PRUEFDATUM", type: "date" },
      { field: "erdung", api: "ERDUNG_IN_ORDNUNG", type: "boolean" },
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
    case "double":
      return String(value ?? "");
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
  const config = ACTION_SAVE_CONFIGS[action.actionLabel];
  if (!config) {
    return {
      success: false,
      actionLabel: action.actionLabel,
      error: `No save config for action "${action.actionLabel}"`,
    };
  }

  const apiParams: Record<string, string> = {
    PROTOKOLL_ID: protokollId,
  };

  for (const mapping of config.params) {
    const rawValue = action.values[mapping.field];
    apiParams[mapping.api] = transformValue(rawValue, mapping.type);
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
