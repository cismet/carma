/**
 * Flatten a GraphQL record (from search or by-id queries) to vector-tile-compatible
 * flat properties. Field names match the tiling pipeline SQL output so that
 * createInfoBoxInfo.js (embedded in the style) and the sidebar extractors can
 * process them without special _gql_* code paths.
 */
export const flattenGqlRecord = (
  r: Record<string, any>,
  sourceLayer: string
): Record<string, unknown> => {
  switch (sourceLayer) {
    case "schaltstelle":
      return {
        id: r.id,
        bezeichnung: r.bauart?.bezeichnung,
        schaltstellen_nummer: r.schaltstellen_nummer,
        haus_nummer: r.haus_nummer,
        zusaetzliche_standortbezeichnung: r.zusaetzliche_standortbezeichnung,
        laufende_nummer: r.laufende_nummer,
        erstellungsjahr: r.erstellungsjahr,
        einbaudatum: r.einbaudatum_rs,
        pruefdatum: r.pruefdatum,
        rundsteuerempfaenger: r.rundsteuerempfaengerObject?.rs_typ,
        bemerkung: r.bemerkung,
        strassenschluessel: r.tkey_strassenschluessel?.pk,
        strasse: r.tkey_strassenschluessel?.strasse,
      };
    case "leuchten":
      return {
        id: r.id,
        fabrikat: r.tkey_leuchtentyp?.fabrikat,
        leuchtentyp: r.tkey_leuchtentyp?.leuchtentyp,
        leuchtennummer: r.leuchtennummer,
        lfd_nummer: r.tdta_standort_mast?.lfd_nummer ?? r.lfd_nummer,
        mastart:
          r.tdta_standort_mast?.tkey_mastart?.mastart ??
          r.tkey_mastart?.mastart,
        masttyp:
          r.tdta_standort_mast?.tkey_masttyp?.masttyp ??
          r.tkey_masttyp?.masttyp,
        strassenschluessel: r.tkey_strassenschluessel?.pk,
        strasse: r.tkey_strassenschluessel?.strasse,
        fk_standort: r.fk_standort ?? r.tdta_standort_mast?.id,
        inbetriebnahme: r.inbetriebnahme_leuchte,
        montagefirma: r.montagefirma_leuchte,
        schaltstelle: r.schaltstelle,
        anzahl_1dk: r.anzahl_1dk,
        anschlussleistung_1dk: r.anschlussleistung_1dk,
        sonderturnus: r.wartungszyklus,
        energielieferant: r.tkey_energielieferant?.energielieferant,
        unterhalt_leuchte: r.tkey_unterh_leuchte?.unterhaltspflichtiger_leuchte,
        rundsteuerempfaenger: r.rundsteuerempfaengerObject?.rs_typ,
        doppelkommando_1: r.fk_dk1Object?.beschreibung,
      };
    case "standorte":
      return {
        id: r.id,
        mastart: r.tkey_mastart?.mastart,
        masttyp: r.tkey_masttyp?.masttyp,
        lfd_nummer: r.lfd_nummer,
        strassenschluessel: r.tkey_strassenschluessel?.pk,
        strasse: r.tkey_strassenschluessel?.strasse,
        standortangabe: r.standortangabe,
        haus_nr: r.haus_nr,
        plz: r.plz,
        anlagengruppe: r.anlagengruppeObject?.bezeichnung,
        kennziffer: r.tkey_kennziffer?.kennziffer,
        stadtbezirk: r.tkey_bezirk?.bezirk,
        klassifizierung: r.tkey_klassifizierung?.klassifizierung,
        unterhalt: r.tkey_unterh_mast?.unterhalt_mast,
      };
    case "mauerlaschen":
      return {
        id: r.id,
        bezeichnung: r.material_mauerlasche?.bezeichnung,
        laufende_nummer: r.laufende_nummer,
        erstellungsjahr: r.erstellungsjahr,
        pruefdatum: r.pruefdatum,
        bemerkung: r.bemerkung,
        strassenschluessel: r.tkey_strassenschluessel?.pk,
        strasse: r.tkey_strassenschluessel?.strasse,
      };
    case "leitungen":
      return {
        id: r.id,
        bezeichnung: r.leitungstyp?.bezeichnung,
        leitungstyp: r.leitungstyp?.bezeichnung,
        material: r.material_leitung?.bezeichnung,
        querschnitt: r.querschnitt?.groesse,
        laenge: r.laenge,
      };
    case "abzweigdosen":
      return {
        id: r.id,
      };
    default:
      return { id: r.id };
  }
};
