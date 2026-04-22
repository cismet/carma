export interface ArbeitsauftragSearchValues {
  bearbeitungsstand?: { value?: string };
  auftragsnummer?: { value?: string };
  zugewiesenAn?: { value?: number };
  angelegtAm?: { von?: string; bis?: string };
  angelegtVon?: { value?: string };
}

// Helper to build date range condition (combines von/bis into single object)
// Database stores timestamps, so we need to include the full day for _lte
export const buildDateRangeCondition = (
  fieldName: string,
  von?: string,
  bis?: string
): string | null => {
  const parts: string[] = [];
  if (von) {
    parts.push(`_gte: "${von.split("T")[0]}"`);
  }
  if (bis) {
    parts.push(`_lte: "${bis.split("T")[0]} 23:59:59"`);
  }
  return parts.length > 0 ? `${fieldName}: {${parts.join(", ")}}` : null;
};

export const buildArbeitsauftragWhereClause = (
  values: ArbeitsauftragSearchValues
): string => {
  const conditions: string[] = [];

  // Exclude deleted records
  conditions.push(
    `_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]`
  );

  // Bearbeitungsstand - filter by protokoll status
  // "alle" = no condition, "offen" = at least one protokoll with schluessel "0", "abgearbeitet" = no protokoll with schluessel "0"
  if (values.bearbeitungsstand?.value === "offen") {
    conditions.push(
      `ar_protokolleArray: {arbeitsprotokoll: {_or: [{fk_status: {_is_null: true}}, {arbeitsprotokollstatus: {schluessel: {_eq: "0"}}}]}}`
    );
  } else if (values.bearbeitungsstand?.value === "abgearbeitet") {
    conditions.push(
      `_not: {ar_protokolleArray: {arbeitsprotokoll: {_or: [{fk_status: {_is_null: true}}, {arbeitsprotokollstatus: {schluessel: {_eq: "0"}}}]}}}`
    );
  }
  // "alle" or undefined = no condition added

  // Auftragsnummer
  if (values.auftragsnummer?.value) {
    conditions.push(`nummer: {_ilike: "%${values.auftragsnummer.value}%"}`);
  }

  // Zugewiesen an (Team)
  if (values.zugewiesenAn?.value) {
    conditions.push(`zugewiesen_an: {_eq: ${values.zugewiesenAn.value}}`);
  }

  // Angelegt am - date range
  const angelegtAmCondition = buildDateRangeCondition(
    "angelegt_am",
    values.angelegtAm?.von,
    values.angelegtAm?.bis
  );
  if (angelegtAmCondition) {
    conditions.push(angelegtAmCondition);
  }

  // Angelegt von
  if (values.angelegtVon?.value) {
    conditions.push(`angelegt_von: {_ilike: "%${values.angelegtVon.value}%"}`);
  }

  return conditions.length > 0 ? `where: {${conditions.join(", ")}}` : "";
};
