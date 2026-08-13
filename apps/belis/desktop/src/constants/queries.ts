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
    sensorid
    sensorbetreiber
    sensorbetreiberObject {
      id
      beschreibung
      key
      name
      url
    }
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
    geom {
      geo_field
      id
    }
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
      sensorid
      sensorbetreiber
      sensorbetreiberObject {
        id
        beschreibung
        key
        name
        url
      }
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

queries.arbeitsauftraege_by_team = `
query ArbeitsauftraegeByTeam($teamId: Int!) {
  arbeitsauftrag(where: {
    _and: [
      { team: { id: { _eq: $teamId } } },
      { _or: [
        { is_deleted: { _is_null: true } },
        { is_deleted: { _eq: false } }
      ]},
      { _or: [
        { ar_protokolleArray: { arbeitsprotokoll: { fk_status: { _is_null: true } } } },
        { ar_protokolleArray: { arbeitsprotokoll: { arbeitsprotokollstatus: { schluessel: { _eq: "0" } } } } }
      ]},
      { _or: [
        { _and: [
          { ar_protokolleArray: { arbeitsprotokoll: { fk_geometrie: { _is_null: false } } } },
          { ar_protokolleArray: { arbeitsprotokoll: { geometrie: { fk_geom: { _is_null: false } } } } }
        ]},
        { ar_protokolleArray: { arbeitsprotokoll: { fk_leuchte: { _is_null: false } } } },
        { ar_protokolleArray: { arbeitsprotokoll: { fk_standort: { _is_null: false } } } },
        { ar_protokolleArray: { arbeitsprotokoll: { fk_mauerlasche: { _is_null: false } } } },
        { ar_protokolleArray: { arbeitsprotokoll: { fk_leitung: { _is_null: false } } } },
        { ar_protokolleArray: { arbeitsprotokoll: { fk_abzweigdose: { _is_null: false } } } },
        { ar_protokolleArray: { arbeitsprotokoll: { fk_schaltstelle: { _is_null: false } } } }
      ]}
    ]
  }) {
    id
    nummer
    angelegt_am
    angelegt_von
    team {
      id
      name
    }
    ar_protokolleArray {
      arbeitsprotokoll {
        id
        arbeitsprotokollstatus {
          id
          bezeichnung
          schluessel
        }
        geometrie {
          geom {
            geo_field
          }
        }
        tdta_leuchten {
          fk_standort: tdta_standort_mast {
            geom {
              geo_field
            }
          }
        }
        tdta_standort_mast {
          geom {
            geo_field
          }
        }
        schaltstelle {
          geom {
            geo_field
          }
        }
        mauerlasche {
          geom {
            geo_field
          }
        }
        leitung {
          geom {
            geo_field
          }
        }
        abzweigdose {
          geom {
            geo_field
          }
        }
      }
    }
  }
}`;

queries.arbeitsauftraege_by_ids = `
query ArbeitsauftraegeByIds($ids: [Int!]!) {
  arbeitsauftrag(where: {
    id: { _in: $ids }
  }) {
    id
    nummer
    angelegt_am
    angelegt_von
    team {
      id
      name
    }
    ar_protokolleArray {
      arbeitsprotokoll {
        id
        arbeitsprotokollstatus {
          id
          bezeichnung
          schluessel
        }
        geometrie {
          geom {
            geo_field
          }
        }
        tdta_leuchten {
          fk_standort: tdta_standort_mast {
            geom {
              geo_field
            }
          }
        }
        tdta_standort_mast {
          geom {
            geo_field
          }
        }
        schaltstelle {
          geom {
            geo_field
          }
        }
        mauerlasche {
          geom {
            geo_field
          }
        }
        leitung {
          geom {
            geo_field
          }
        }
        abzweigdose {
          geom {
            geo_field
          }
        }
      }
    }
  }
}`;

queries.arbeitsauftragById = `
query ArbeitsauftragById($aaId: Int!) {
  arbeitsauftrag(where: {id: {_eq: $aaId}}) {
    angelegt_am
    angelegt_von
    id
    ccnonce
    is_deleted
    nummer
    zugewiesen_an
    team {
      id
      name
    }
    ar_protokolleArray {
      arbeitsprotokoll {
        id
        ccnonce
        veranlassungsnummer
        veranlassung {
          id
          nummer
          bezeichnung
          veranlassungsart {
            bezeichnung
            schluessel
          }
          beschreibung
          username
          datum
          bemerkungen
          ar_dokumenteArray {
            dms_url {
              description
              id
              name
              url {
                id
                object_name
                url_base {
                  prot_prefix
                  server
                  path
                }
              }
            }
          }
        }
        protokollnummer
        is_deleted
        material
        monteur
        bemerkung
        defekt
        datum
        arbeitsprotokollstatus {
          id
          bezeichnung
          schluessel
        }
        arbeitsprotokollaktionArray {
          aenderung
          alt
          id
          neu
          ccnonce
        }
        geometrie {
          bezeichnung
          geom {
            geo_field
          }
        }
        tdta_leuchten {
          id
          leuchtennummer
          plz
          einbaudatum
          anschlussleistung_1dk
          vorschaltgeraet
          anschlussleistung_2dk
          schaltstelle
          anzahl_1dk
          anzahl_2dk
          lfd_nummer
          is_deleted
          wartungszyklus
          lebensdauer
          monteur
          naechster_wechsel
          wechselvorschaltgeraet
          wechseldatum
          zaehler
          montagefirma_leuchte
          inbetriebnahme_leuchte
          bemerkungen
          dokumenteArray {
            dms_url {
              description
              url {
                object_name
                url_base { path prot_prefix server }
              }
            }
          }
          fk_dk1: fk_dk1_tkey_doppelkommando { id pk beschreibung }
          fk_dk2: fk_dk2_tkey_doppelkommando { id pk beschreibung }
          rundsteuerempfaenger: rundsteuerempfaengerObject {
            id anschlusswert foto herrsteller_rs programm rs_typ
            dms_url {
              description
              url { object_name url_base { path prot_prefix server } }
            }
          }
          fk_strassenschluessel: tkey_strassenschluessel { id pk strasse }
          fk_kennziffer: tkey_kennziffer { id beschreibung kennziffer }
          fk_leuchttyp: tkey_leuchtentyp {
            bestueckung vorschaltgeraet typenbezeichnung leuchtentyp
            leistung_reduziert leistung_brutto_reduziert leistung_brutto
            leistung2stufe leistung lampe id foto fabrikat einbau_vorschaltgeraet
            dms_url {
              description
              url { object_name url_base { path prot_prefix server } }
            }
            dokumenteArray {
              dms_url {
                description
                url { object_name url_base { path prot_prefix server } }
              }
              tkey_leuchtentyp_reference id
            }
          }
          fk_unterhaltspflicht_leuchte: tkey_unterh_leuchte { id pk unterhaltspflichtiger_leuchte }
          fk_energielieferant: tkey_energielieferant { id pk energielieferant }
          leuchtmittel: leuchtmittelObject { id hersteller lichtfarbe }
          fk_standort: tdta_standort_mast {
            inbetriebnahme_mast letzte_aenderung id verrechnungseinheit standortangabe
            plz anbauten elek_pruefung revision standsicherheitspruefung lfd_nummer
            montagefirma is_deleted anstrichfarbe monteur bemerkungen gruendung
            verfahren erdung haus_nr naechstes_pruefdatum mastanstrich mastschutz
            ist_virtueller_standort
            geom { geo_field }
            fk_kennziffer: tkey_kennziffer { id beschreibung kennziffer }
            anlagengruppe: anlagengruppeObject { nummer bezeichnung }
            fk_stadtbezirk: tkey_bezirk { id bezirk pk }
            fk_klassifizierung: tkey_klassifizierung { id klassifizierung pk }
            dokumenteArray {
              dms_url { description url { object_name url_base { path prot_prefix server } } }
            }
            fk_masttyp: tkey_masttyp {
              bezeichnung foto hersteller id lph masttyp wandstaerke
              dms_url { description url { object_name url_base { path prot_prefix server } } }
              dokumenteArray {
                dms_url { description url { object_name url_base { path prot_prefix server } } }
                id tkey_masttyp
              }
            }
            fk_mastart: tkey_mastart { id pk mastart }
            fk_unterhaltspflicht_mast: tkey_unterh_mast { id pk unterhalt_mast }
            fk_strassenschluessel: tkey_strassenschluessel { id pk strasse }
          }
        }
        tdta_standort_mast {
          inbetriebnahme_mast letzte_aenderung id verrechnungseinheit standortangabe
          plz anbauten elek_pruefung revision standsicherheitspruefung lfd_nummer
          montagefirma is_deleted anstrichfarbe monteur bemerkungen gruendung
          verfahren erdung haus_nr naechstes_pruefdatum mastanstrich mastschutz
          ist_virtueller_standort
          geom { geo_field }
          fk_kennziffer: tkey_kennziffer { id beschreibung kennziffer }
          anlagengruppe: anlagengruppeObject { nummer bezeichnung }
          fk_stadtbezirk: tkey_bezirk { id bezirk pk }
          fk_klassifizierung: tkey_klassifizierung { id klassifizierung pk }
          dokumenteArray {
            dms_url { description url { object_name url_base { path prot_prefix server } } }
          }
          fk_masttyp: tkey_masttyp {
            bezeichnung foto hersteller id lph masttyp wandstaerke
            dms_url { description url { object_name url_base { path prot_prefix server } } }
            dokumenteArray {
              dms_url { description url { object_name url_base { path prot_prefix server } } }
              id tkey_masttyp
            }
          }
          fk_mastart: tkey_mastart { id pk mastart }
          fk_unterhaltspflicht_mast: tkey_unterh_mast { id pk unterhalt_mast }
          fk_strassenschluessel: tkey_strassenschluessel { id pk strasse }
        }
        schaltstelle {
          bemerkung id is_deleted laufende_nummer monteur pruefdatum
          schaltstellen_nummer zusaetzliche_standortbezeichnung erstellungsjahr
          einbaudatum_rs haus_nummer
          geom { geo_field }
          fk_bauart: bauart { id bezeichnung }
          fk_strassenschluessel: tkey_strassenschluessel { id pk strasse }
          foto: dms_url { description url { object_name url_base { path prot_prefix server } } }
          rundsteuerempfaenger: rundsteuerempfaengerObject {
            id anschlusswert foto herrsteller_rs programm rs_typ
            dms_url { description url { object_name url_base { path prot_prefix server } } }
          }
          dokumenteArray {
            dms_url { description url { object_name url_base { path prot_prefix server } } }
            id
          }
        }
        mauerlasche {
          bemerkung erstellungsjahr foto id is_deleted laufende_nummer monteur pruefdatum
          geom { geo_field }
          fk_strassenschluessel: tkey_strassenschluessel { id pk strasse }
          fk_material: material_mauerlasche { id bezeichnung }
          dokumenteArray {
            dms_url { description url { object_name url_base { path prot_prefix server } } }
          }
        }
        leitung {
          id is_deleted
          geom { geo_field }
          fk_leitungstyp: leitungstyp { id bezeichnung }
          fk_material: material_leitung { id bezeichnung }
          fk_querschnitt: querschnitt { id groesse }
          dokumenteArray {
            dms_url { description url { object_name url_base { path prot_prefix server } } }
          }
        }
        abzweigdose {
          id is_deleted
          geom { geo_field }
          dokumenteArray {
            dms_url { description url { object_name url_base { path prot_prefix server } } }
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

queries.tkey_strassenschluessel = `
query MyQuery {
  tkey_strassenschluessel {
    id
    pk
    strasse
  }
}`;

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

queries.sensorbetreiber = `
query MyQuery {
  sensorbetreiber {
    id
    beschreibung
    key
    name
    url
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
