const queries: Record<string, string> = {};
export default queries;

queries.jwtTestQuery = `
query Test {
  __typename ## Placeholder value
}`;

queries.bauart = `
query MyQuery {
  bauart {
    bezeichnung
    id
  }
}`;

queries.rundsteuerempfaenger = `
query MyQuery {
  rundsteuerempfaenger {
    rs_typ
    programm
    id
    herrsteller_rs
    anschlusswert
    dms_url {
      description
      id
      name
      typ
      url {
        id
        object_name
        url_base {
          id
          path
          prot_prefix
          server
        }
      }
    }
  }
}`;

queries.infobaustein_template = `
query MyQuery {
  infobaustein_template {
    schluessel
    id
    bezeichnung
    ar_bausteineArray {
      infobaustein {
        bezeichnung
        id
        pflichtfeldten
        schluessel
        wert
      }
    }
  }
}`;

queries.infobaustein_template_by_id = `
query MyQuery($id: Int!) {
  infobaustein_template(where: {id: {_eq: $id}}) {
    schluessel
    id
    bezeichnung
    ar_bausteineArray {
      infobaustein {
        bezeichnung
        id
        pflichtfeld
        schluessel
        wert
      }
    }
  }
}`;

queries.tkey_leuchtentyp = `
query MyQuery {
  tkey_leuchtentyp {
    vorschaltgeraet
    typenbezeichnung
    leuchtentyp
    leistung_reduziert
    leistung_brutto_reduziert
    leistung_brutto
    leistung2stufe
    leistung
    lampe
    id
    foto
    fabrikat
    einbau_vorschaltgeraet
    bestueckung
    dokumenteArray {
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            server
            prot_prefix
          }
        }
      }
    }
  }
}`;

queries.team = `
query MyQuery {
  team {
    id
    name
  }
}`;

queries.querschnitt = `
query MyQuery {
  querschnitt {
    groesse
    id
  }
}`;

queries.leuchtmittel = `
query MyQuery {
  leuchtmittel {
    lichtfarbe
    id
    hersteller
  }
}`;

queries.tkey_unterh_mast = `
query MyQuery {
  tkey_unterh_mast {
    id
    pk
    unterhalt_mast
  }
}`;

queries.material_mauerlasche = `
query MyQuery {
  material_mauerlasche {
    id
    bezeichnung
  }
}`;

queries.mauerlasche_by_id = `
query MyQuery($id: Int!) {
  mauerlasche(where: {id: {_eq: $id}}) {
    bemerkung
    erstellungsjahr
    dms_url {
      description
      id
      name
      typ
      url {
        id
        object_name
        url_base {
          server
          prot_prefix
          id
          path
        }
      }
    }
    dokumenteArray {
      dms_url {
        description
        id
        name
        url {
          object_name
          id
          url_base {
            server
            prot_prefix
            path
            id
          }
        }
        typ
      }
      id
      fk_dokument
      mauerlasche_reference
    }
    fk_geom
    fk_material
    fk_strassenschluessel
    foto
    geom {
      geo_field
      id
    }
    id
    is_deleted
    laufende_nummer
    material_mauerlasche {
      bezeichnung
      id
    }
    monteur
    pruefdatum
    tkey_strassenschluessel {
      id
      pk
      strasse
    }
  }
}`;

queries.schaltstelle_by_id = `
query MyQuery($id: Int!) {
  schaltstelle(where: {id: {_eq: $id}}) {
    bauart {
      bezeichnung
      id
    }
    bemerkung
    dms_url {
      description
      id
      name
      typ
      url {
        id
        object_name
        url_base {
          id
          path
          prot_prefix
          server
        }
      }
    }
    dokumenteArray {
      schaltstelle_reference
      id
      fk_dokument
      dms_url {
        description
        id
        name
        typ
        url {
          object_name
          id
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
    }
    einbaudatum_rs
    erstellungsjahr
    fk_bauart
    fk_geom
    fk_strassenschluessel
    foto
    geom {
      geo_field
      id
    }
    haus_nummer
    id
    is_deleted
    laufende_nummer
    monteur
    pruefdatum
    rundsteuerempfaenger
    rundsteuerempfaengerObject {
      anschlusswert
      foto
      herrsteller_rs
      id
      programm
      rs_typ
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
    }
    tkey_strassenschluessel {
      id
      pk
      strasse
    }
    zusaetzliche_standortbezeichnung
    schaltstellen_nummer
  }
}`;

queries.tdta_leuchten_by_id = `
query MyQuery($id: Int!) {
  tdta_leuchten(where: {id: {_eq: $id}}) {
    anschlussleistung_1dk
    anschlussleistung_2dk
    anzahl_1dk
    bemerkungen
    einbaudatum
    fk_dk1Object {
      beschreibung
      pk
      id
    }
    fk_dk1
    fk_dk2
    fk_dk2Object {
      beschreibung
      id
      pk
    }
    id
    inbetriebnahme_leuchte
    is_deleted
    kabeluebergangskasten_sk_ii
    lebensdauer
    leuchtennummer
    leuchtmittel
    leuchtmittelObject {
      hersteller
      id
      lichtfarbe
    }
    lfd_nummer
    montagefirma_leuchte
    monteur
    naechster_wechsel
    plz
    rundsteuerempfaenger
    rundsteuerempfaengerObject {
      anschlusswert
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
      foto
      id
      herrsteller_rs
      programm
      rs_typ
    }
    schaltstelle
    zaehler
    wechselvorschaltgeraet
    wechseldatum
    wartungszyklus
    vorschaltgeraet
    tkey_unterh_leuchte {
      id
      pk
      unterhaltspflichtiger_leuchte
    }
    anzahl_2dk
    dokumenteArray {
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
      fk_dokument
      id
      tdta_leuchte_reference
    }
    tkey_kennziffer {
      beschreibung
      id
      kennziffer
    }
    tkey_energielieferant {
      energielieferant
      id
      pk
    }
    tkey_strassenschluessel {
      id
      pk
      strasse
    }
    tkey_leuchtentyp {
      id
      fabrikat
      foto
      lampe
      leistung
      leistung2stufe
      leistung_brutto
      leistung_brutto_reduziert
      leistung_reduziert
      leuchtentyp
      typenbezeichnung
      vorschaltgeraet
      dokumenteArray {
        dms_url {
          description
          id
          name
          typ
          url {
            id
            object_name
            url_base {
              id
              path
              prot_prefix
              server
            }
          }
        }
      }
    }
    tdta_standort_mast {
      id
      leuchtenArray {
        id
      }
      dokumenteArray {
        dms_url {
          description
          id
          name
          typ
          url {
            id
            object_name
            url_base {
              id
              path
              prot_prefix
              server
            }
          }
        }
      }
    }
  }
}`;

queries.leitung_by_id = `
query MyQuery($id: Int!) {
  leitung(where: {id: {_eq: $id}}) {
    dokumenteArray {
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
      fk_dokument
      id
      leitung_reference
    }
    fk_geom
    fk_leitungstyp
    fk_material
    fk_querschnitt
    geom {
      geo_field
      id
    }
    id
    is_deleted
    leitungstyp {
      bezeichnung
      id
    }
    material_leitung {
      bezeichnung
      id
    }
    querschnitt {
      groesse
      id
    }
  }
}`;

queries.abzweigdose_by_id = `
query MyQuery($id: Int!) {
  abzweigdose(where: {id: {_eq: $id}}) {
    dokumenteArray {
      abzweigdose_reference
      fk_dokument
      id
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
    }
    fk_geom
    id
    is_deleted
  }
}`;

queries.tdta_standort_mast_by_id = `
query MyQuery($id: Int!) {
  tdta_standort_mast(where: {id: {_eq: $id}}) {
    anbauten
    anlagengruppe
    anstrichfarbe
    bemerkungen
    elek_pruefung
    erdung
    anlagengruppeObject {
      bezeichnung
      id
      nummer
    }
    dokumenteArray {
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
    }
    foto
    geom {
      geo_field
      id
    }
    gruendung
    haus_nr
    id
    inbetriebnahme_mast
    is_deleted
    ist_virtueller_standort
    letzte_aenderung
    lfd_nummer
    mastanstrich
    mastschutz
    montagefirma
    monteur
    naechstes_pruefdatum
    plz
    revision
    standortangabe
    standsicherheitspruefung
    verrechnungseinheit
    verfahren
    tkey_unterh_mast {
      unterhalt_mast
      pk
      id
    }
    tkey_strassenschluessel {
      id
      pk
      strasse
    }
    tkey_masttyp {
      bezeichnung
      foto
      hersteller
      id
      lph
      masttyp
      wandstaerke
      dokumenteArray {
        dms_url {
          description
          id
          name
          typ
          url {
            id
            object_name
            url_base {
              id
              path
              prot_prefix
              server
            }
          }
        }
      }
    }
    tkey_mastart {
      id
      mastart
      pk
    }
    tkey_klassifizierung {
      id
      klassifizierung
      pk
    }
    tkey_kennziffer {
      beschreibung
      id
      kennziffer
    }
    tkey_doppelkommando {
      beschreibung
      id
      pk
    }
    tkey_bezirk {
      bezirk
      id
      pk
    }
    leuchtenArray {
      anschlussleistung_1dk
      anschlussleistung_2dk
      anzahl_1dk
      anzahl_2dk
      bemerkungen
      einbaudatum
      fk_dk1Object {
        beschreibung
        id
        pk
      }
      fk_dk2Object {
        beschreibung
        id
        pk
      }
      id
      inbetriebnahme_leuchte
      is_deleted
      kabeluebergangskasten_sk_ii
      lebensdauer
      leuchtennummer
      leuchtmittel
      leuchtmittelObject {
        hersteller
        id
        lichtfarbe
      }
      lfd_nummer
      montagefirma_leuchte
      monteur
      naechster_wechsel
      plz
      rundsteuerempfaengerObject {
        anschlusswert
        foto
        herrsteller_rs
        id
        programm
        rs_typ
        dms_url {
          description
          id
          name
          typ
          url {
            id
            object_name
            url_base {
              id
              path
              prot_prefix
              server
            }
          }
        }
      }
      schaltstelle
      vorschaltgeraet
      wartungszyklus
      wechseldatum
      wechselvorschaltgeraet
      zaehler
      tkey_energielieferant {
        energielieferant
        id
        pk
      }
      tkey_kennziffer {
        beschreibung
        id
        kennziffer
      }
      tkey_unterh_leuchte {
        id
        pk
        unterhaltspflichtiger_leuchte
      }
      tkey_strassenschluessel {
        id
        pk
        strasse
      }
      tkey_leuchtentyp {
        bestueckung
        einbau_vorschaltgeraet
        fabrikat
        foto
        id
        lampe
        leistung
        leistung2stufe
        leistung_brutto
        leistung_brutto_reduziert
        leistung_reduziert
        leuchtentyp
        typenbezeichnung
        vorschaltgeraet
        dokumenteArray {
          dms_url {
            description
            id
            name
            typ
            url {
              id
              object_name
              url_base {
                id
                path
                prot_prefix
                server
              }
            }
          }
        }
      }
    }
  }
}`;

queries.arbeitsauftrag_by_id = `
query MyQuery($id: Int!) {
  arbeitsauftrag(where: {id: {_eq: $id}}) {
    angelegt_am
    angelegt_von
    zugewiesen_an_old
    zugewiesen_an
    team {
      id
      name
    }
    nummer
    is_deleted
    id
    ccnonce
    ar_protokolleArray {
      arbeitsprotokoll {
        bemerkung
        ccnonce
        datum
        defekt
        geometrie {
          id
          is_deleted
          bezeichnung
          geom {
            geo_field
            id
          }
        }
        id
        is_deleted
        material
        monteur
        protokollnummer
        veranlassungsnummer
        arbeitsprotokollstatus {
          bezeichnung
          id
          schluessel
        }
        abzweigdose {
          id
        }
        arbeitsprotokollaktionArray {
          aenderung
          alt
          ccnonce
          id
          neu
        }
        leitung {
          id
          is_deleted
          querschnitt {
            groesse
            id
          }
          material_leitung {
            bezeichnung
            id
          }
          leitungstyp {
            bezeichnung
            id
          }
          geom {
            geo_field
            id
          }
        }
        mauerlasche {
          bemerkung
          pruefdatum
          monteur
          tkey_strassenschluessel {
            id
            pk
            strasse
          }
          material_mauerlasche {
            bezeichnung
            id
          }
          laufende_nummer
          is_deleted
          id
          foto
          erstellungsjahr
        }
        schaltstelle {
          bauart {
            bezeichnung
            id
          }
          bemerkung
          einbaudatum_rs
          erstellungsjahr
          foto
          geom {
            geo_field
            id
          }
          haus_nummer
          id
          is_deleted
          laufende_nummer
          monteur
          pruefdatum
          schaltstellen_nummer
          tkey_strassenschluessel {
            id
            strasse
            pk
          }
          zusaetzliche_standortbezeichnung
        }
        veranlassung {
          id
          bemerkungen
          beschreibung
          bezeichnung
          datum
          nummer
          username
          veranlassungsart {
            bezeichnung
            id
            schluessel
          }
        }
        tdta_standort_mast {
          anbauten
          anlagengruppe
          anstrichfarbe
          bemerkungen
          elek_pruefung
          erdung
          lfd_nummer
          tkey_strassenschluessel {
            id
            pk
            strasse
          }
          tkey_masttyp {
            bezeichnung
            foto
            hersteller
            id
            lph
            masttyp
            wandstaerke
          }
          tkey_mastart {
            id
            mastart
            pk
          }
          id
        }
        tdta_leuchten {
          anschlussleistung_1dk
          anschlussleistung_2dk
          anzahl_1dk
          anzahl_2dk
          bemerkungen
          dokumente
          einbaudatum
          id
          inbetriebnahme_leuchte
          is_deleted
          kabeluebergangskasten_sk_ii
          lebensdauer
          leuchtennummer
          lfd_nummer
          montagefirma_leuchte
          naechster_wechsel
          monteur
          plz
          schaltstelle
          vorschaltgeraet
          wartungszyklus
          wechseldatum
          wechselvorschaltgeraet
          zaehler
          tkey_leuchtentyp {
            bestueckung
            einbau_vorschaltgeraet
            fabrikat
            foto
            id
            lampe
            leistung
            leistung2stufe
            leistung_brutto
            leistung_brutto_reduziert
            leistung_reduziert
            leuchtentyp
            typenbezeichnung
            vorschaltgeraet
          }
          tkey_strassenschluessel {
            id
            pk
            strasse
          }
        }
      }
    }
  }
}`;

queries.anlagengruppe = `
query MyQuery {
  anlagengruppe {
    bezeichnung
    id
    nummer
  }
}`;

queries.tkey_unterh_leuchte = `
query MyQuery {
  tkey_unterh_leuchte {
    id
    pk
    unterhaltspflichtiger_leuchte
  }
}`;

// queries.tkey_strassenschluessel = `
// query MyQuery {
//   tkey_strassenschluessel {
//     id
//     pk
//     strasse
//   }
// }`;

queries.tkey_energielieferant = `
query MyQuery {
  tkey_energielieferant {
    energielieferant
    id
    pk
  }
}`;

queries.tkey_bezirk = `
query MyQuery {
  tkey_bezirk {
    bezirk
    id
    pk
  }
}`;

queries.leitungstyp = `
query MyQuery {
  leitungstyp {
    id
    bezeichnung
  }
}`;

queries.arbeitsprotokollstatus = `
query MyQuery {
  arbeitsprotokollstatus {
    bezeichnung
    id
    schluessel
  }
}`;

queries.material_leitung = `
query MyQuery {
  material_leitung {
    bezeichnung
    id
  }
}`;

queries.tkey_kennziffer = `
query MyQuery {
  tkey_kennziffer {
    beschreibung
    id
    kennziffer
  }
}`;

queries.tkey_mastart = `
query MyQuery {
  tkey_mastart {
    pk
    mastart
    id
  }
}`;

queries.veranlassungsart = `
query MyQuery {
  veranlassungsart {
    bezeichnung
    id
    schluessel
  }
}`;

queries.tkey_klassifizierung = `
query MyQuery {
  tkey_klassifizierung {
    id
    klassifizierung
    pk
  }
}`;

queries.tkey_doppelkommando = `
query MyQuery {
  tkey_doppelkommando {
    beschreibung
    id
    pk
  }
}`;

queries.tkey_masttyp = `
query MyQuery {
  tkey_masttyp {
    bezeichnung
    wandstaerke
    masttyp
    lph
    id
    hersteller
    foto
    dokumenteArray {
      dms_url {
        description
        id
        name
        typ
        url {
          id
          object_name
          url_base {
            id
            path
            prot_prefix
            server
          }
        }
      }
    }
  }
}`;
