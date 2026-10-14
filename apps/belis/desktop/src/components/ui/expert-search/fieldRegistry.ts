// Central registry for the expert search.
//
// This is the ONE place to declare which fields are filterable per BELIS object
// type. Both the sidebar (colored "tags") and the filter rule dropdown read from
// it, so adding/renaming a field is a single edit here.

export type FieldType = "text" | "number" | "date" | "boolean" | "fk";

// Default comparison operator for a field type: Text starts with substring
// search ("enthält"/contains), every other type with exact equality ("=").
export const defaultOperatorForType = (type: FieldType): string =>
  type === "text" ? "contains" : "eq";
export type ObjectType =
  | "leuchte"
  | "mast"
  | "schaltstelle"
  | "mauerlasche"
  | "leitung";

export const TYPE_META: Record<FieldType, { label: string; color: string }> = {
  number: { label: "Zahl", color: "#3b82f6" }, // blue
  fk: { label: "Auswahl", color: "#f59e0b" }, // amber
  date: { label: "Datum", color: "#10b981" }, // green
  boolean: { label: "Ja / Nein", color: "#ea580c" }, // orange
  text: { label: "Text", color: "#6b7280" }, // gray
};

export interface Field {
  key: string; // real backend filter column/relationship name
  label: string;
  type: FieldType; // drives the value input AND the sidebar dot color (TYPE_META)
  fkTable?: string; // key-table name (keyTableDisplayConfig) — only for type "fk"
  sortRelation?: string;
  sortColumn?: string;
  filterRelation?: string;
  // Column to filter on when it differs from `key` (e.g. on a related table).
  filterColumn?: string;
  filterRelationIsArray?: boolean;
  sortable?: false;
}

const COMMON = {
  id: { key: "id", label: "ID", type: "number" },
  laufende_nummer: {
    key: "laufende_nummer",
    label: "Laufende Nummer",
    type: "number",
  },
  strassenschluessel: {
    key: "fk_strassenschluessel",
    label: "Straßenschlüssel",
    type: "fk",
    fkTable: "straßenschlüssel",
    sortRelation: "tkey_strassenschluessel",
    sortColumn: "strasse",
  },
  erstellungsjahr: {
    key: "erstellungsjahr",
    label: "Erstellungsjahr",
    type: "date",
  },
  pruefdatum: { key: "pruefdatum", label: "Prüfdatum", type: "date" },
  bemerkung: { key: "bemerkung", label: "Bemerkung", type: "text" },
  // `dokumente` is an Int array key; search the documents' description instead.
  dokumente: {
    key: "dokumente",
    label: "Dokumente",
    type: "text",
    filterRelation: "dokumenteArray.dms_url",
    filterColumn: "description",
    filterRelationIsArray: true,
    sortable: false,
  },
  is_deleted: { key: "is_deleted", label: "Gelöscht", type: "boolean" },
} satisfies Record<string, Field>;

export const REGISTRY: Record<ObjectType, Field[]> = {
  // tdta_leuchten
  leuchte: [
    COMMON.id,
    { key: "leuchtennummer", label: "Leuchtennummer", type: "text" },
    { key: "lfd_nummer", label: "Laufende Nummer", type: "number" },
    { key: "fk_standort", label: "Standort", type: "number" },
    // A Leuchte has no Stadtbezirk column — filter/sort it through the parent
    // Standort (fk_standort → tdta_standort_mast.fk_stadtbezirk).
    {
      key: "fk_stadtbezirk",
      label: "Stadtbezirk",
      type: "fk",
      fkTable: "bezirk",
      filterRelation: "tdta_standort_mast",
      sortRelation: "tdta_standort_mast",
      sortColumn: "fk_stadtbezirk",
    },
    COMMON.strassenschluessel,
    {
      key: "fk_leuchttyp",
      label: "Leuchtentyp",
      type: "fk",
      fkTable: "leuchtentyp",
    },
    // Lampe is a column of the Leuchtentyp key table.
    {
      key: "lampe",
      label: "Lampe",
      type: "text",
      filterRelation: "tkey_leuchtentyp",
      sortRelation: "tkey_leuchtentyp",
      sortColumn: "lampe",
    },
    {
      key: "leuchtmittel",
      label: "Leuchtmittel",
      type: "fk",
      fkTable: "leuchtmittel",
    },
    {
      key: "fk_kennziffer",
      label: "Kennziffer",
      type: "fk",
      fkTable: "kennziffer",
    },
    {
      key: "fk_energielieferant",
      label: "Energielieferant",
      type: "fk",
      fkTable: "energielieferant",
    },
    {
      key: "fk_unterhaltspflicht_leuchte",
      label: "Unterhalt",
      type: "fk",
      fkTable: "unterhaltLeuchte",
    },
    {
      key: "rundsteuerempfaenger",
      label: "Rundsteuerempfänger",
      type: "fk",
      fkTable: "rundsteuerempfänger",
    },
    {
      key: "fk_dk1",
      label: "Doppelkommando 1",
      type: "fk",
      fkTable: "doppelkommando",
    },
    {
      key: "fk_dk2",
      label: "Doppelkommando 2",
      type: "fk",
      fkTable: "doppelkommando",
    },
    { key: "anzahl_1dk", label: "Anzahl 1. DK", type: "number" },
    { key: "anzahl_2dk", label: "Anzahl 2. DK", type: "number" },
    {
      key: "anschlussleistung_1dk",
      label: "Anschlussleistung 1. DK",
      type: "number",
    },
    {
      key: "anschlussleistung_2dk",
      label: "Anschlussleistung 2. DK",
      type: "number",
    },
    { key: "inbetriebnahme_leuchte", label: "Inbetriebnahme", type: "date" },
    { key: "einbaudatum", label: "Einbaudatum", type: "date" },
    { key: "wechseldatum", label: "Leuchtmittelwechsel", type: "date" },
    { key: "naechster_wechsel", label: "Nächster Wechsel", type: "date" },
    { key: "lebensdauer", label: "Lebensdauer", type: "number" },
    { key: "wartungszyklus", label: "Sonderturnus", type: "date" },
    { key: "vorschaltgeraet", label: "Vorschaltgerät", type: "text" },
    { key: "wechselvorschaltgeraet", label: "Erneuerung VG", type: "date" },
    // Stored on the parent Standort, like Stadtbezirk.
    {
      key: "elek_pruefung",
      label: "Elektrische Prüfung",
      type: "date",
      filterRelation: "tdta_standort_mast",
      sortRelation: "tdta_standort_mast",
      sortColumn: "elek_pruefung",
    },
    { key: "montagefirma_leuchte", label: "Montagefirma", type: "text" },
    { key: "schaltstelle", label: "Schaltstelle", type: "text" },
    { key: "zaehler", label: "Zähler vorhanden", type: "text" },
    { key: "bemerkungen", label: "Bemerkung", type: "text" },
    COMMON.dokumente,
  ],
  // tdta_standort_mast
  mast: [
    COMMON.id,
    { key: "lfd_nummer", label: "Laufende Nummer", type: "number" },
    COMMON.strassenschluessel,
    {
      key: "fk_stadtbezirk",
      label: "Stadtbezirk",
      type: "fk",
      fkTable: "bezirk",
    },
    { key: "haus_nr", label: "Hausnummer", type: "text" },
    { key: "standortangabe", label: "Standortangabe", type: "text" },
    { key: "fk_mastart", label: "Mastart", type: "fk", fkTable: "mastart" },
    { key: "fk_masttyp", label: "Masttyp", type: "fk", fkTable: "masttyp" },
    {
      key: "fk_klassifizierung",
      label: "Klassifizierung",
      type: "fk",
      fkTable: "klassifizierung",
    },
    {
      key: "fk_kennziffer",
      label: "Kennziffer",
      type: "fk",
      fkTable: "kennziffer",
    },
    {
      key: "anlagengruppe",
      label: "Anlagengruppe",
      type: "fk",
      fkTable: "anlagengruppe",
    },
    {
      key: "fk_unterhaltspflicht_mast",
      label: "Unterhalt",
      type: "fk",
      fkTable: "unterhaltMast",
    },
    { key: "inbetriebnahme_mast", label: "Inbetriebnahme", type: "date" },
    { key: "mastschutz", label: "Mastschutz", type: "date" },
    { key: "mastanstrich", label: "Mastanstrich", type: "date" },
    { key: "elek_pruefung", label: "Elektrische Prüfung", type: "date" },
    {
      key: "standsicherheitspruefung",
      label: "Standsicherheitsprüfung",
      type: "date",
    },
    { key: "naechstes_pruefdatum", label: "Nächstes Prüfdatum", type: "date" },
    { key: "letzte_aenderung", label: "Letzte Änderung", type: "date" },
    // Stored on the Leuchten: matches Standorte with at least one such Leuchte.
    {
      key: "wartungszyklus",
      label: "Sonderturnus",
      type: "date",
      filterRelation: "leuchtenArray",
      sortable: false,
    },
    { key: "gruendung", label: "Gründung", type: "text" },
    { key: "anstrichfarbe", label: "Anstrichfarbe", type: "text" },
    { key: "anbauten", label: "Anbauten", type: "text" },
    { key: "erdung", label: "Erdung", type: "boolean" },
    { key: "verfahren", label: "Verfahren", type: "text" },
    { key: "verrechnungseinheit", label: "V-Einheit", type: "boolean" },
    { key: "revision", label: "Revision", type: "date" },
    { key: "montagefirma", label: "Montagefirma", type: "text" },
    { key: "bemerkungen", label: "Bemerkung", type: "text" },
    COMMON.dokumente,
  ],
  // schaltstelle
  schaltstelle: [
    COMMON.id,
    { key: "schaltstellen_nummer", label: "Schaltstellennummer", type: "text" },
    { key: "fk_bauart", label: "Bauart", type: "fk", fkTable: "bauart" },
    {
      key: "rundsteuerempfaenger",
      label: "Rundsteuerempfänger",
      type: "fk",
      fkTable: "rundsteuerempfänger",
    },
    { key: "haus_nummer", label: "Hausnummer", type: "text" },
    {
      key: "zusaetzliche_standortbezeichnung",
      label: "Standortbezeichnung",
      type: "text",
    },
    COMMON.strassenschluessel,
    COMMON.laufende_nummer,
    COMMON.erstellungsjahr,
    { key: "einbaudatum_rs", label: "Einbaudatum", type: "date" },
    COMMON.pruefdatum,
    COMMON.bemerkung,
    COMMON.dokumente,
  ],
  // mauerlasche
  mauerlasche: [
    COMMON.id,
    COMMON.laufende_nummer,
    COMMON.strassenschluessel,
    {
      key: "fk_material",
      label: "Material",
      type: "fk",
      fkTable: "materialMauerlasche",
    },
    COMMON.erstellungsjahr,
    COMMON.pruefdatum,
    COMMON.bemerkung,
    COMMON.dokumente,
  ],
  // leitung
  leitung: [
    COMMON.id,
    {
      key: "fk_leitungstyp",
      label: "Leitungstyp",
      type: "fk",
      fkTable: "leitungstyp",
    },
    {
      key: "fk_material",
      label: "Material",
      type: "fk",
      fkTable: "materialLeitung",
    },
    {
      key: "fk_querschnitt",
      label: "Querschnitt",
      type: "fk",
      fkTable: "querschnitt",
    },
  ],
};
