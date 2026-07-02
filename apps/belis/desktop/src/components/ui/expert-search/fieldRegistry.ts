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

// The sidebar dot color describes the field's DATA TYPE, so a field carries no
// separate color — it comes from its `type` via this map (defined once here).
export const TYPE_META: Record<FieldType, { label: string; color: string }> = {
  text: { label: "Text", color: "#6b7280" }, // gray
  number: { label: "Zahl", color: "#3b82f6" }, // blue
  date: { label: "Datum", color: "#10b981" }, // green
  boolean: { label: "Ja / Nein", color: "#ea580c" }, // orange
  fk: { label: "Auswahl", color: "#f59e0b" }, // amber
};

export interface Field {
  key: string; // real backend filter column/relationship name
  label: string;
  type: FieldType; // drives the value input AND the sidebar dot color (TYPE_META)
  fkTable?: string; // key-table name (keyTableDisplayConfig) — only for type "fk"
}

// Fields shared by (almost) every object type. Spread into each list below.
const ID_FIELD: Field = { key: "id", label: "ID", type: "number" };

export const REGISTRY: Record<ObjectType, Field[]> = {
  // tdta_leuchten
  leuchte: [
    ID_FIELD,
    { key: "inbetriebnahme_leuchte", label: "Inbetriebnahme", type: "date" },
    { key: "wechseldatum", label: "Wechseldatum", type: "date" },
    { key: "naechster_wechsel", label: "Nächster Wechsel", type: "date" },
    { key: "fk_leuchttyp", label: "Leuchtentyp", type: "fk", fkTable: "leuchtentyp" },
    { key: "rundsteuerempfaenger", label: "Rundsteuerempfänger", type: "fk", fkTable: "rundsteuerempfänger" },
    { key: "fk_dk1", label: "Doppelkommando 1", type: "fk", fkTable: "doppelkommando" },
    { key: "fk_dk2", label: "Doppelkommando 2", type: "fk", fkTable: "doppelkommando" },
    { key: "schaltstelle", label: "Schaltstelle", type: "text" },
  ],
  // tdta_standort_mast
  mast: [
    ID_FIELD,
    { key: "inbetriebnahme_mast", label: "Inbetriebnahme", type: "date" },
    { key: "mastschutz", label: "Mastschutz", type: "date" },
    { key: "mastanstrich", label: "Mastanstrich", type: "date" },
    { key: "elek_pruefung", label: "Elektr. Prüfung", type: "date" },
    { key: "standsicherheitspruefung", label: "Standsicherheitsprüfung", type: "date" },
    { key: "fk_mastart", label: "Mastart", type: "fk", fkTable: "mastart" },
    { key: "fk_masttyp", label: "Masttyp", type: "fk", fkTable: "masttyp" },
    { key: "fk_klassifizierung", label: "Klassifizierung", type: "fk", fkTable: "klassifizierung" },
    { key: "anlagengruppe", label: "Anlagengruppe", type: "fk", fkTable: "anlagengruppe" },
    { key: "tkey_unterh_mast", label: "Unterhalt", type: "fk", fkTable: "unterhaltMast" },
  ],
  // schaltstelle
  schaltstelle: [
    ID_FIELD,
    { key: "fk_bauart", label: "Bauart", type: "fk", fkTable: "bauart" },
    { key: "rundsteuerempfaenger", label: "Rundsteuerempfänger", type: "fk", fkTable: "rundsteuerempfänger" },
    { key: "erstellungsjahr", label: "Erstellungsjahr", type: "date" },
    { key: "einbaudatum_rs", label: "Einbaudatum", type: "date" },
    { key: "pruefdatum", label: "Prüfdatum", type: "date" },
  ],
  // mauerlasche
  mauerlasche: [
    ID_FIELD,
    { key: "laufende_nummer", label: "Laufende Nummer", type: "number" },
    { key: "fk_strassenschluessel", label: "Straßenschlüssel", type: "fk", fkTable: "straßenschlüssel" },
    // Geometrie temporarily hidden — filtering a geom FK by value is meaningless.
    // { key: "fk_geom", label: "Geometrie", type: "number" },
    { key: "fk_material", label: "Material", type: "fk", fkTable: "materialMauerlasche" },
    { key: "erstellungsjahr", label: "Erstellungsjahr", type: "date" },
    { key: "pruefdatum", label: "Prüfdatum", type: "date" },
    { key: "monteur", label: "Monteur", type: "text" },
    { key: "bemerkung", label: "Bemerkung", type: "text" },
    { key: "dokumente", label: "Dokumente", type: "text" },
    { key: "foto", label: "Foto", type: "text" },
    { key: "is_deleted", label: "Gelöscht", type: "boolean" },
  ],
};
