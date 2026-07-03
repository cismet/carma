// Shared GraphQL field selections for BELIS feature queries.
// Used by both the search modal (SearchModal.tsx) and the CSV export
// enrichment (fetchFeaturesForExport.ts) so the selected fields — and thus
// the columns available downstream via flattenGqlRecord — stay in sync.

// When true, queries include all display fields. When false, only id + geom.
// Extended: ~527 KB / 341ms vs minimal: ~127 KB / 203ms (benchmarked).
export const FETCH_EXTENDED_SEARCH_RESULTS = true;

export const LEUCHTEN_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    leuchtennummer lfd_nummer fk_standort
    inbetriebnahme_leuchte zaehler montagefirma_leuchte schaltstelle
    einbaudatum anzahl_1dk anschlussleistung_1dk
    anzahl_2dk anschlussleistung_2dk
    wechseldatum naechster_wechsel lebensdauer wartungszyklus
    vorschaltgeraet wechselvorschaltgeraet bemerkungen
    tkey_leuchtentyp { leuchtentyp fabrikat }
    tkey_strassenschluessel { pk strasse }
    tkey_kennziffer { beschreibung }
    tkey_energielieferant { energielieferant }
    tkey_unterh_leuchte { unterhaltspflichtiger_leuchte }
    rundsteuerempfaengerObject { rs_typ }
    fk_dk1Object { beschreibung }
    fk_dk2Object { beschreibung }
    leuchtmittelObject { hersteller lichtfarbe }
    tdta_standort_mast { lfd_nummer tkey_mastart { mastart } tkey_masttyp { masttyp } geom_84 { x y } }`
  : `id
    tdta_standort_mast { geom_84 { x y } }`;

export const MAST_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    lfd_nummer standortangabe haus_nr
    inbetriebnahme_mast verrechnungseinheit mastanstrich anstrichfarbe
    montagefirma gruendung standsicherheitspruefung naechstes_pruefdatum
    verfahren elek_pruefung erdung monteur mastschutz revision
    anbauten bemerkungen letzte_aenderung
    tkey_mastart { mastart }
    tkey_masttyp { masttyp }
    tkey_strassenschluessel { pk strasse }
    anlagengruppeObject { bezeichnung }
    tkey_kennziffer { kennziffer beschreibung }
    tkey_bezirk { bezirk }
    tkey_klassifizierung { klassifizierung }
    tkey_unterh_mast { unterhalt_mast }
    geom_84 { x y }`
  : `id
    geom_84 { x y }`;

export const SCHALTSTELLE_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    schaltstellen_nummer
    haus_nummer
    zusaetzliche_standortbezeichnung
    laufende_nummer
    erstellungsjahr
    einbaudatum_rs
    pruefdatum
    bemerkung
    bauart { bezeichnung }
    rundsteuerempfaengerObject { rs_typ }
    tkey_strassenschluessel { pk strasse }
    geom_84 { x y }`
  : `id
    geom_84 { x y }`;

export const MAUERLASCHE_FIELDS = FETCH_EXTENDED_SEARCH_RESULTS
  ? `id
    laufende_nummer
    erstellungsjahr
    pruefdatum
    bemerkung
    material_mauerlasche { bezeichnung }
    tkey_strassenschluessel { pk strasse }
    geom_84 { x y }`
  : `id
    geom_84 { x y }`;

// Leitungen are export-only (not part of the search modal), so no geom and no
// minimal/extended split — the export always wants the full attribute set.
export const LEITUNG_FIELDS = `id
    geom { geo_field }
    leitungstyp { bezeichnung }
    material_leitung { bezeichnung }
    querschnitt { groesse }`;

// Maps a tile/sidebar sourceLayer to the GraphQL table + field selection used
// to fetch full records by id for export. Layers absent here (e.g. abzweigdosen)
// have no enrichment query and fall back to their tile props.
export const EXPORT_QUERY_BY_LAYER: Record<
  string,
  { table: string; fields: string }
> = {
  leuchten: { table: "tdta_leuchten", fields: LEUCHTEN_FIELDS },
  standorte: { table: "tdta_standort_mast", fields: MAST_FIELDS },
  schaltstelle: { table: "schaltstelle", fields: SCHALTSTELLE_FIELDS },
  mauerlaschen: { table: "mauerlasche", fields: MAUERLASCHE_FIELDS },
  leitungen: { table: "leitung", fields: LEITUNG_FIELDS },
};
