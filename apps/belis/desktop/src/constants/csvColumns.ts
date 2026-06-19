// User-facing CSV column configuration for the highlight export.
//
// Keys are the flat property names produced by flattenGqlRecord (the same names
// the vector tiles and forms use). For each column:
//   - `label` is the human-readable header, matching the feature form labels.
//   - `show` toggles whether the column appears in the export. Set it to `false`
//     to hide technical / internal columns users don't need (e.g. database ids
//     and foreign keys).
//
// Property keys NOT listed here are still exported, falling back to their raw
// key as the header — so a newly added field shows up until it gets a config
// entry. To hide a column, add it here with `show: false`.

export interface CsvColumnConfig {
  label: string;
  show: boolean;
}

export const CSV_COLUMN_CONFIG: Record<string, CsvColumnConfig> = {
  // Technical / internal — hidden from the user-facing export.
  id: { label: "ID", show: false },
  fk_standort: { label: "FK Standort", show: false },
  strassenschluessel: { label: "Straßenschlüssel", show: false },

  // Shared across feature types.
  strasse: { label: "Straße", show: true },
  lfd_nummer: { label: "Laufende Nr.", show: true },
  mastart: { label: "Mastart", show: true },
  masttyp: { label: "Masttyp", show: true },

  // Leuchten.
  leuchtennummer: { label: "Leuchtennummer", show: true },
  leuchtentyp: { label: "Leuchtentyp", show: true },
  fabrikat: { label: "Fabrikat", show: true },
  inbetriebnahme: { label: "Inbetriebnahme", show: true },
  montagefirma: { label: "Montagefirma", show: true },
  schaltstelle: { label: "Schaltstelle", show: true },
  anzahl_1dk: { label: "Anzahl DK1", show: true },
  anschlussleistung_1dk: { label: "Anschlussleistung", show: true },
  sonderturnus: { label: "Sonderturnus", show: true },
  energielieferant: { label: "Energielieferant", show: true },
  unterhalt_leuchte: { label: "Unterhalt Leuchte", show: true },
  rundsteuerempfaenger: { label: "Rundsteuerempf.", show: true },
  doppelkommando_1: { label: "Doppelkommando 1", show: true },

  // Standorte.
  standortangabe: { label: "Standortangabe", show: true },
  haus_nr: { label: "Hausnummer", show: true },
  plz: { label: "PLZ", show: true },
  anlagengruppe: { label: "Anlagengruppe", show: true },
  kennziffer: { label: "Kennziffer", show: true },
  stadtbezirk: { label: "Stadtbezirk", show: true },
  klassifizierung: { label: "Klassifizierung", show: true },
  unterhalt: { label: "Unterhalt", show: true },

  // Schaltstelle. `bezeichnung` is the Bauart here (see per-layer override);
  // `erstellungsjahr` is "Erstellungsjahr" here but "Montage" on Mauerlaschen.
  schaltstellen_nummer: { label: "Schaltstellennummer", show: true },
  bezeichnung: { label: "Bezeichnung", show: true },
  haus_nummer: { label: "Hausnummer", show: true },
  zusaetzliche_standortbezeichnung: { label: "Standortbez.", show: true },
  erstellungsjahr: { label: "Erstellungsjahr", show: true },
  einbaudatum: { label: "Einbaudatum", show: true },
  pruefdatum: { label: "Prüfung", show: false },
  bemerkung: { label: "Bemerkung", show: false },

  // Mauerlaschen.
  laufende_nummer: { label: "Laufende Nr.", show: true },

  // Leitungen. `bezeichnung` carries the Leitungstyp here (per-layer override);
  // `leitungstyp` duplicates it and `laenge` is unused — both hidden.
  material: { label: "Material", show: true },
  querschnitt: { label: "Querschnitt", show: true },
  leitungstyp: { label: "Leitungstyp", show: false },
  laenge: { label: "Länge", show: false },
};

// Per-layer label overrides for property keys whose human-readable name depends
// on the feature type. These keys never collide within a single export file
// (each layer below gets its own file), so the override is unambiguous.
export const CSV_LAYER_LABEL_OVERRIDES: Record<
  string,
  Record<string, string>
> = {
  schaltstelle: { bezeichnung: "Bauart" },
  mauerlaschen: { bezeichnung: "Material", erstellungsjahr: "Montage" },
  leitungen: { bezeichnung: "Leitungstyp" },
};

// Per-layer visibility overrides. A `show` value here wins over the shared
// CSV_COLUMN_CONFIG `show` for that layer only — so a column hidden globally
// (e.g. pruefdatum / bemerkung on Schaltstelle) can still be shown on another
// feature type. Mauerlaschen and Leitungen show all their fields.
export const CSV_LAYER_SHOW_OVERRIDES: Record<
  string,
  Record<string, boolean>
> = {
  mauerlaschen: { pruefdatum: true, bemerkung: true },
};

// Human-readable labels for the "Typ" column values (derived from sourceLayer).
export const LAYER_LABELS: Record<string, string> = {
  leuchten: "Leuchte",
  standorte: "Standort",
  schaltstelle: "Schaltstelle",
  mauerlaschen: "Mauerlasche",
  leitungen: "Leitung",
  abzweigdosen: "Abzweigdose",
};
