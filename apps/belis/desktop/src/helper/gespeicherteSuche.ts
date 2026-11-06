import { updateDataByClassName } from "./apiMethods";

// gespeicherte_suche holds named, shared definitions per `objekttyp`: saved
// expert searches and CSV export templates.
const CLASS_NAME = "gespeicherte_suche";

export interface SaveGespeicherteSucheInput {
  // Row to overwrite; omitted creates a new one.
  id?: number;
  name: string;
  beschreibung?: string;
  objekttyp: string;
  definition: unknown;
  login?: string | null;
}

// Returns the id of the saved row (null if the server didn't report it).
export const saveGespeicherteSuche = async (
  jwt: string,
  {
    id,
    name,
    beschreibung,
    objekttyp,
    definition,
    login,
  }: SaveGespeicherteSucheInput
): Promise<number | null> => {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: id ?? -1,
    name: name.trim(),
    beschreibung: beschreibung?.trim() || null,
    objekttyp,
    definition: JSON.stringify(definition),
    geaendert_am: now,
  };
  if (id == null) {
    payload.angelegt_von = login ?? null;
    payload.angelegt_am = now;
  }
  const result = (await updateDataByClassName(jwt, CLASS_NAME, payload)) as {
    res?: string;
  } | null;
  if (id != null) return id;
  if (!result?.res) return null;
  const parsed = JSON.parse(result.res) as { id?: number | string };
  return parsed.id == null ? null : Number(parsed.id);
};

export const deleteGespeicherteSuche = async (
  jwt: string,
  id: number
): Promise<void> => {
  await updateDataByClassName(jwt, CLASS_NAME, { id, is_deleted: true });
};

// Only the author may overwrite or delete an entry.
export const isAuthor = (
  item: { angelegt_von?: string | null } | null,
  login: string | null | undefined
): boolean => item != null && login != null && item.angelegt_von === login;
