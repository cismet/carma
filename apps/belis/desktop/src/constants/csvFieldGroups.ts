// Grouping and field types for the CSV export settings.
//
// The available fields are NOT listed here; they come from what the export
// really writes: flattenGqlRecord keys shown by csvColumns.ts (`show`) for
// Fachobjekte, AA_EXPORT_HEADER plus one column per Aktion for Arbeitsaufträge.
// To offer a hidden field, set `show: true` there. This file only arranges them:
//   - CSV_FIELD_GROUPS: move a key to another group, rename or reorder groups.
//     Keys that are in no group show up under "Weitere Felder"; keys the export
//     doesn't write are ignored.
//   - CSV_REGISTRY_ALIASES / AA_FIELD_TYPES: field type (sidebar dot color),
//     taken from the expert search registry.

import type { FieldType } from "../components/ui/expert-search/fieldRegistry";

export type CsvExportLayer =
  | "leuchten"
  | "standorte"
  | "schaltstelle"
  | "mauerlaschen"
  | "leitungen"
  | "arbeitsauftraege";

export interface CsvFieldGroupConfig {
  key: string;
  label: string;
  fields: string[];
}

export const CSV_FIELD_GROUPS: Record<CsvExportLayer, CsvFieldGroupConfig[]> = {
  leuchten: [
    {
      key: "standort",
      label: "Standort",
      fields: ["strasse", "kennziffer", "lfd_nummer", "mastart", "masttyp"],
    },
    {
      key: "leuchte",
      label: "Leuchte",
      fields: [
        "leuchtennummer",
        "leuchtentyp",
        "fabrikat",
        "inbetriebnahme",
        "einbaudatum",
        "montagefirma",
        "unterhalt_leuchte",
        "bemerkungen",
      ],
    },
    {
      key: "energie",
      label: "Energie & Schaltung",
      fields: [
        "zaehler",
        "energielieferant",
        "schaltstelle",
        "rundsteuerempfaenger",
      ],
    },
    {
      key: "dk1",
      label: "Doppelkommando 1",
      fields: ["doppelkommando_1", "anzahl_1dk", "anschlussleistung_1dk"],
    },
    {
      key: "dk2",
      label: "Doppelkommando 2",
      fields: ["doppelkommando_2", "anzahl_2dk", "anschlussleistung_2dk"],
    },
    {
      key: "leuchtmittel",
      label: "Leuchtmittel",
      fields: [
        "leuchtmittel",
        "lebensdauer",
        "wechseldatum",
        "naechster_wechsel",
        "sonderturnus",
      ],
    },
    {
      key: "vorschaltgeraet",
      label: "Vorschaltgerät",
      fields: ["vorschaltgeraet", "wechselvorschaltgeraet"],
    },
  ],
  standorte: [
    {
      key: "lage",
      label: "Lage",
      fields: [
        "strasse",
        "kennziffer",
        "lfd_nummer",
        "haus_nr",
        "standortangabe",
        "stadtbezirk",
      ],
    },
    {
      key: "mast",
      label: "Mast",
      fields: [
        "mastart",
        "masttyp",
        "klassifizierung",
        "inbetriebnahme_mast",
        "montagefirma",
        "gruendung",
        "anbauten",
      ],
    },
    {
      key: "verwaltung",
      label: "Unterhalt & Verwaltung",
      fields: ["unterhalt", "verrechnungseinheit", "anlagengruppe"],
    },
    {
      key: "anstrich",
      label: "Anstrich & Schutz",
      fields: ["mastanstrich", "anstrichfarbe", "mastschutz"],
    },
    {
      key: "pruefungen",
      label: "Prüfungen",
      fields: [
        "standsicherheitspruefung",
        "naechstes_pruefdatum",
        "verfahren",
        "elek_pruefung",
        "erdung",
        "monteur",
        "revision",
      ],
    },
    {
      key: "sonstiges",
      label: "Sonstiges",
      fields: ["bemerkungen", "letzte_aenderung"],
    },
  ],
  schaltstelle: [
    {
      key: "lage",
      label: "Lage",
      fields: ["strasse", "haus_nummer", "zusaetzliche_standortbezeichnung"],
    },
    {
      key: "schaltstelle",
      label: "Schaltstelle",
      fields: [
        "laufende_nummer",
        "schaltstellen_nummer",
        "bezeichnung",
        "erstellungsjahr",
        "einbaudatum",
        "rundsteuerempfaenger",
      ],
    },
    {
      key: "pruefung",
      label: "Prüfung",
      fields: ["pruefdatum", "bemerkung"],
    },
  ],
  mauerlaschen: [
    { key: "lage", label: "Lage", fields: ["strasse", "laufende_nummer"] },
    {
      key: "mauerlasche",
      label: "Mauerlasche",
      fields: ["bezeichnung", "erstellungsjahr"],
    },
    {
      key: "pruefung",
      label: "Prüfung",
      fields: ["pruefdatum", "bemerkung"],
    },
  ],
  leitungen: [
    {
      key: "leitung",
      label: "Leitung",
      fields: ["bezeichnung", "material", "querschnitt"],
    },
  ],
  // AA columns are keyed by their header; "Aktionen" is added automatically.
  arbeitsauftraege: [
    {
      key: "fachobjekt",
      label: "Fachobjekt",
      fields: ["Straßenschlüssel", "Straße", "Leuchtennummer", "Mastnummer"],
    },
    {
      key: "auftrag",
      label: "Auftrag",
      fields: ["Bezeichnung (aus Auftrag)", "Datum des Arbeitsauftrags"],
    },
    {
      key: "protokoll",
      label: "Protokoll",
      fields: ["Monteur", "Datum aus Protokoll", "Status", "Bemerkung"],
    },
  ],
};

// CSV key → expert search registry key, where the names differ.
const STRASSE_ALIASES = {
  strasse: "fk_strassenschluessel",
  strassenschluessel: "fk_strassenschluessel",
};

export const CSV_REGISTRY_ALIASES: Partial<
  Record<CsvExportLayer, Record<string, string>>
> = {
  leuchten: {
    ...STRASSE_ALIASES,
    kennziffer: "fk_kennziffer",
    leuchtentyp: "fk_leuchttyp",
    fabrikat: "fk_leuchttyp",
    inbetriebnahme: "inbetriebnahme_leuchte",
    montagefirma: "montagefirma_leuchte",
    energielieferant: "fk_energielieferant",
    unterhalt_leuchte: "fk_unterhaltspflicht_leuchte",
    doppelkommando_1: "fk_dk1",
    doppelkommando_2: "fk_dk2",
    sonderturnus: "wartungszyklus",
    mastart: "fk_mastart",
    masttyp: "fk_masttyp",
  },
  standorte: {
    ...STRASSE_ALIASES,
    mastart: "fk_mastart",
    masttyp: "fk_masttyp",
    klassifizierung: "fk_klassifizierung",
    kennziffer: "fk_kennziffer",
    unterhalt: "fk_unterhaltspflicht_mast",
    stadtbezirk: "fk_stadtbezirk",
  },
  schaltstelle: {
    ...STRASSE_ALIASES,
    bezeichnung: "fk_bauart",
    einbaudatum: "einbaudatum_rs",
  },
  mauerlaschen: { ...STRASSE_ALIASES, bezeichnung: "fk_material" },
  leitungen: {
    bezeichnung: "fk_leitungstyp",
    leitungstyp: "fk_leitungstyp",
    material: "fk_material",
    querschnitt: "fk_querschnitt",
  },
};

// AA columns have no registry entry; Aktion columns are "ja"/empty (boolean).
export const AA_FIELD_TYPES: Record<string, FieldType> = {
  Straßenschlüssel: "fk",
  Straße: "fk",
  Leuchtennummer: "text",
  Mastnummer: "number",
  "Bezeichnung (aus Auftrag)": "fk",
  "Datum des Arbeitsauftrags": "date",
  Monteur: "text",
  "Datum aus Protokoll": "date",
  Status: "fk",
  Bemerkung: "text",
};
