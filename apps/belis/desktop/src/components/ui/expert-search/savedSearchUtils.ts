import type { Field } from "./fieldRegistry";
import type {
  ExpertGroupState,
  ExpertTypeState,
  SavedSearchDefinition,
} from "./types";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";

// Rule values can be dayjs (date fields); tag them like the persisted drafts do.
export const toSavedSearchDefinition = (
  typeState: ExpertTypeState
): Record<string, unknown> =>
  serializeValues({
    version: 1,
    groups: typeState.groups,
    groupConjunction: typeState.groupConjunction,
    sorts: typeState.sorts,
    limit: typeState.limit,
  });

// Returns null for unreadable definitions. Rules and sorts on fields that no
// longer exist in the registry are dropped and counted.
export const parseSavedSearchDefinition = (
  raw: unknown,
  fields: Field[]
): { definition: SavedSearchDefinition; dropped: number } | null => {
  let obj = raw;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj) as unknown;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const data = deserializeValues(obj as Record<string, unknown>);
  if (!Array.isArray(data.groups)) return null;

  const known = new Set(fields.map((f) => f.key));
  let dropped = 0;

  const groups = (data.groups as ExpertGroupState[]).map((g) => {
    const rules = g.rules.filter((r) => known.has(r.field));
    dropped += g.rules.length - rules.length;
    return { ...g, rules };
  });
  const allSorts = Array.isArray(data.sorts)
    ? (data.sorts as SavedSearchDefinition["sorts"])
    : [];
  const sorts = allSorts.filter((s) => known.has(s.field));
  dropped += allSorts.length - sorts.length;

  return {
    definition: {
      version: 1,
      groups,
      groupConjunction: data.groupConjunction === "ODER" ? "ODER" : "UND",
      sorts,
      limit: typeof data.limit === "number" ? data.limit : null,
    },
    dropped,
  };
};
