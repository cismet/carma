// Central registry for the expert search.
//
// This is the ONE place to declare which fields are filterable per BELIS object
// type. Both the sidebar (colored "tags") and the filter rule dropdown read from
// it, so adding/renaming a field is a single edit here.
//
// `key` is the REAL backend filter column/relationship name (as used in the
// GraphQL `where` clause in SearchModal.tsx, e.g. `fk_leuchttyp`, `pruefdatum`),
// so a future where-builder can consume it directly. Note this differs from the
// GraphQL *selection* name (`tkey_leuchtentyp { leuchtentyp }`) and from the
// flattened tile prop (`leuchtentyp`).
//
// For `type: "fk"`, `fkTable` names a key table in keyTableDisplayConfig; its
// options + labels come from redux (getKeyTablesData) rendered via parseTemplate.

export type FieldType = "text" | "number" | "date" | "boolean" | "fk";

// The BELIS object types filterable via expert search — matches SearchModal's
// SearchType (minus arbeitsauftrag, which has no scalar filter surface here).
export type ObjectType = "leuchte" | "mast" | "schaltstelle" | "mauerlasche";

export type CategoryKey =
  | "identity"
  | "location"
  | "date"
  | "classification"
  | "status"
  | "general";

// A "tag" = category, defined once (label + color). Fields reference a category,
// so colors are never repeated on individual fields.
export const CATEGORIES: Record<CategoryKey, { label: string; color: string }> = {
  identity: { label: "Kennung", color: "#3b82f6" },
  location: { label: "Verortung", color: "#14b8a6" },
  date: { label: "Datum", color: "#8b5cf6" },
  classification: { label: "Klassifizierung", color: "#f59e0b" },
  status: { label: "Status", color: "#ea580c" },
  general: { label: "Allgemein", color: "#6b7280" },
};

export interface Field {
  key: string; // real backend filter column/relationship name
  label: string;
  type: FieldType; // drives which value input renders
  category: CategoryKey; // → tag color via CATEGORIES
  fkTable?: string; // key-table name (keyTableDisplayConfig) — only for type "fk"
}

// Fields shared by (almost) every object type. Spread into each list below.
const ID_FIELD: Field = {
  key: "id",
  label: "ID",
  type: "number",
  category: "identity",
};

export const REGISTRY: Record<ObjectType, Field[]> = {
  // tdta_leuchten
  leuchte: [
    ID_FIELD,
    { key: "inbetriebnahme_leuchte", label: "Inbetriebnahme", type: "date", category: "date" },
    { key: "wechseldatum", label: "Wechseldatum", type: "date", category: "date" },
    { key: "naechster_wechsel", label: "Nächster Wechsel", type: "date", category: "date" },
    { key: "fk_leuchttyp", label: "Leuchtentyp", type: "fk", category: "classification", fkTable: "leuchtentyp" },
    { key: "rundsteuerempfaenger", label: "Rundsteuerempfänger", type: "fk", category: "classification", fkTable: "rundsteuerempfänger" },
    { key: "fk_dk1", label: "Doppelkommando 1", type: "fk", category: "classification", fkTable: "doppelkommando" },
    { key: "fk_dk2", label: "Doppelkommando 2", type: "fk", category: "classification", fkTable: "doppelkommando" },
    { key: "schaltstelle", label: "Schaltstelle", type: "text", category: "general" },
  ],
  // tdta_standort_mast
  mast: [
    ID_FIELD,
    { key: "inbetriebnahme_mast", label: "Inbetriebnahme", type: "date", category: "date" },
    { key: "mastschutz", label: "Mastschutz", type: "date", category: "date" },
    { key: "mastanstrich", label: "Mastanstrich", type: "date", category: "date" },
    { key: "elek_pruefung", label: "Elektr. Prüfung", type: "date", category: "date" },
    { key: "standsicherheitspruefung", label: "Standsicherheitsprüfung", type: "date", category: "date" },
    { key: "fk_mastart", label: "Mastart", type: "fk", category: "classification", fkTable: "mastart" },
    { key: "fk_masttyp", label: "Masttyp", type: "fk", category: "classification", fkTable: "masttyp" },
    { key: "fk_klassifizierung", label: "Klassifizierung", type: "fk", category: "classification", fkTable: "klassifizierung" },
    { key: "anlagengruppe", label: "Anlagengruppe", type: "fk", category: "classification", fkTable: "anlagengruppe" },
    { key: "tkey_unterh_mast", label: "Unterhalt", type: "fk", category: "classification", fkTable: "unterhaltMast" },
  ],
  // schaltstelle
  schaltstelle: [
    ID_FIELD,
    { key: "fk_bauart", label: "Bauart", type: "fk", category: "classification", fkTable: "bauart" },
    { key: "rundsteuerempfaenger", label: "Rundsteuerempfänger", type: "fk", category: "classification", fkTable: "rundsteuerempfänger" },
    { key: "erstellungsjahr", label: "Erstellungsjahr", type: "number", category: "date" },
    { key: "einbaudatum_rs", label: "Einbaudatum", type: "date", category: "date" },
    { key: "pruefdatum", label: "Prüfdatum", type: "date", category: "date" },
  ],
  // mauerlasche
  mauerlasche: [
    ID_FIELD,
    { key: "fk_material", label: "Material", type: "fk", category: "classification", fkTable: "materialMauerlasche" },
    { key: "erstellungsjahr", label: "Erstellungsjahr", type: "number", category: "date" },
    { key: "pruefdatum", label: "Prüfdatum", type: "date", category: "date" },
    { key: "bemerkung", label: "Bemerkung", type: "text", category: "general" },
  ],
};
