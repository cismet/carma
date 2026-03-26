import type {
  AADraft,
  APDraft,
} from "../store/slices/arbeitsauftraegeDrafts";
import { updateDataByClassName } from "./apiMethods";

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
