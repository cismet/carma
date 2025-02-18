const queries = {};
export const geomFactories = {};
export default queries;

queries.first = `query q($gemarkung: String, $flur: Int, $fstkZaehler: Int, $fstkNenner: Int){
    flurstueck(where: {flurstueck_schluessel: {_and: {gemarkung: {bezeichnung: {_eq: $gemarkung}},
                                                      flur: {_eq: $flur}, 
                                                      flurstueck_zaehler: {_eq: $fstkZaehler}, 
                                                      flurstueck_nenner: {_eq: $fstkNenner}
                                    }}}) {
      id
      flurstueck_schluessel {
        flurstueck_zaehler
        flurstueck_nenner
        flur
        flurstueck_art {
          bezeichnung
        }
        bemerkung_sperre
        datum_entstehung
        datum_letzter_stadtbesitz
        gemarkung {
          bezeichnung
          schluessel
        }
        ist_gesperrt
        letzte_bearbeitung
        letzter_bearbeiter
        war_staedtisch
      }
      ar_vertraegeArray {
        vertrag {
          aktenzeichen
          bemerkung
          beschlussArrayRelationShip {
            beschlussart {
              bezeichnung
            }
            datum
            vertrag {
              gesamtpreis
              bemerkung
              aktenzeichen
              datum_auflassung
              datum_eintragung
              quadratmeterpreis
              vertragspartner
              vertragsart {
                bezeichnung
              }
            }
          }
        }
      }
    }
}
`;

queries.keys = `query Keys {
    gemarkung {
      id
      schluessel
      bezeichnung
    }
    kategorie {
      abkuerzung
      bezeichnung
      id
    }
   
    nutzungsart {
      bezeichnung
      id
      schluessel
    }
    oberkategorie {
      abkuerzung
      bezeichnung
      id
    }
    rebe_art {
      bezeichnung
      id
    }
    vertragsart {
      bezeichnung
      id
    }
  }
  `;

export const exampleQueryParameter = {
  gemarkung: "Barmen",
  flur: 1,
  fstkZaehler: 367,
  fstkNenner: 0,
};

queries.gemarkung = `query MyQuery{
  gemarkung{
    schluessel
    bezeichnung
  }
}
`;

queries.flur = `query q($gemarkung)`;

queries.zaehler = `query q($gemarkung_id: Int) {
  flurstueck_schluessel(distinct_on: flurstueck_zaehler, where: {fk_gemarkung: {_eq: $gemarkung_id}}) {
    flurstueck_zaehler
  }
}`;

queries.nenner = `query q($gemarkung_id: Int, $zaehler: Int) {
  flurstueck_schluessel(distinct_on: flurstueck_nenner, where: {_and: {flurstueck_zaehler: {_eq: $zaehler}, fk_gemarkung: {_eq: $gemarkung_id}}}) {
    flurstueck_nenner
  }
}
`;

queries.flurstuecke = `query MyQuery {
  view_flurstueck_schluessel {
    alkis_id
    schluessel_id
    flurstueckart
    historisch
  }
  gemarkung {
    bezeichnung
    schluessel
  }
}`;

queries.getLagisLandparcelByFlurstueckSchluesselId = `query MyQuery($schluessel_id: Int, $alkis_id: String) {
  extended_alkis_flurstueck(where: {alkis_id: {_eq: $alkis_id}}) {
    alkis_id
    geometrie
    area
  }
  flurstueck(where: {flurstueck_schluessel: {_and: {id: {_eq: $schluessel_id}}}}) {
    id
    flurstueck_schluessel {
      gemarkung {
        bezeichnung
      }
      flur
      flurstueck_zaehler
      flurstueck_nenner
      bemerkung_sperre
      datum_entstehung
      datum_letzter_stadtbesitz
      war_staedtisch
      letzter_bearbeiter
      letzte_bearbeitung
      gueltig_bis
      ist_gesperrt
    }
    ar_baeumeArray {
      baum {
        alte_nutzung
        ar_baum_merkmale
        ar_baum_merkmaleArray {
          baum_merkmal {
            bezeichnung
            id
          }
        }
        auftragnehmer
        baum_nutzung {
          baum_kategorie {
            bezeichnung
            id
            ar_kategorie_auspraegungenArray {
              baum_kategorie_auspraegung {
                bezeichnung
                id
              }
            }
          }
          baum_kategorie_auspraegung {
            id
            bezeichnung
          }
          id
        }
        baumnummer
        bemerkung
        erfassungsdatum
        faelldatum
        flaeche
        lage
        id
        extended_geom {
          area
          geo_field
        }
      }
    }
    ar_vertraegeArray {
      vertrag {
        id
        vertragspartner
        quadratmeterpreis
        vertragsart {
          bezeichnung
          id
        }
        gesamtpreis
        datum_eintragung
        datum_auflassung
        bemerkung
        aktenzeichen
        beschlussArrayRelationShip {
          datum
          beschlussart {
            bezeichnung
            id
          }
          fk_vertrag
        }
        kostenArrayRelationShip {
          kostenart {
            bezeichnung
            id
            ist_nebenkostenart
          }
          datum
          betrag
          fk_vertrag
        }
      }
    }
    bemerkung
    in_stadtbesitz
    kassenzeichenArrayRelationShip {
      id
      kassenzeichennummer
      zugeordnet_am
      zugeordnet_von
    }
    nutzungArrayRelationShip {
      id
      nutzung_buchungArrayRelationShip(order_by: {gueltig_von: asc}) {
        quadratmeterpreis
        ist_buchwert
        gueltig_von
        gueltig_bis
        flaeche
        bemerkung
        nutzungsart {
          bezeichnung
          id
          schluessel
        }
        anlageklasse {
          bezeichnung
          id
          schluessel
        }
        ar_bebauungenArray {
          bebauung {
            bezeichnung
            id
          }
        }
        ar_flaechennutzungenArray {
          flaechennutzung {
            bezeichnung
            id
          }
        }
      }
    }
    spielplatz {
      id
      ist_klettergeruest_wartung_erforderlich
      ist_rutsche_wartung_erforderlich
      ist_sandkasten_wartung_erforderlich
      ist_schaukel_wartung_erforderlich
      ist_wippe_wartung_erforderlich
      klettergeruest_vorhanden
      rutsche_vorhanden
      sandkasten_vorhanden
      schaukel_vorhanden
      wippe_vorhanden
    }
    strassenfrontArrayRelationShip {
      strassenname
      laenge
      id
    }
    verwaltungsbereiche_eintragArrayRelationShip {
      id
      geaendert_von
      geaendert_am
      verwaltungsbereichArrayRelationShip {
        extended_geom {
          area
          geo_field
        }
        verwaltende_dienststelle {
          abkuerzung_abteilung
          bezeichnung_abteilung
          email_adresse
          farbeArrayRelationShip {
            rgb_farbwert
            stil {
              bezeichnung
            }
          }
          ressort {
            abkuerzung
            bezeichnung
            id
          }
        }
        verwaltungsgebrauch {
          abkuerzung
          bezeichnung
          unterabschnitt
          kategorie {
            abkuerzung
            bezeichnung
            oberkategorie {
              abkuerzung
              bezeichnung
              id
            }
          }
        }
        flaeche
      }
    }
    zusatz_rolleArrayRelationShip {
      extended_geom {
        area
        geo_field
      }
      verwaltende_dienststelle {
        abkuerzung_abteilung
        bezeichnung_abteilung
        email_adresse
        farbeArrayRelationShip {
          rgb_farbwert
          stil {
            bezeichnung
            id
          }
        }
        ressort {
          abkuerzung
          bezeichnung
          id
        }
      }
      zusatz_rolle_art {
        id
        name
        schluessel
      }
    }
    dms_urlArrayRelationShip {
      name
      typ
      url {
        object_name
        url_base {
          path
          prot_prefix
          server
          id
        }
        id
      }
      beschreibung
      id
    }
  }
}`;

queries.getRebeByGeo = `query MyQuery($geo: geometry) {
  rebe(where: {geom: {geo_field: {_st_intersects: $geo}}}) {
    bemerkung
    beschreibung
    datum_eintragung
    datum_loeschung
    ist_recht
    nummer
    rebe_art {
      bezeichnung
    }
    extended_geom {
      area
      geo_field
    }
  }
}`;

queries.getQuerverweiseByVertragId = `query MyQuery ($vertag_id: Int) {
  flurstueck(where: {ar_vertraegeArray: {fk_vertrag: {_eq: $vertag_id}}}) {
    flurstueck_schluessel {
      gemarkung {
        bezeichnung
      }
      flur
      flurstueck_zaehler
      flurstueck_nenner
    }
  }
}`;

queries.getMipaByGeo = `query MyQuery($geo: geometry) {
  mipa(where: {geom: {geo_field: {_st_intersects: $geo}}}) {
    aktenzeichen
    bemerkung
    flaeche
    extended_geom {
      area
      geo_field
    }
    lage
    vertragsende
    vertragsbeginn
    nutzung
    nutzer
    mipa_nutzung {
      ausgewaehlte_nummer
      mipa_kategorie {
        bezeichnung
      }
    }
    ar_mipa_merkmaleArray {
      mipa_merkmal {
        bezeichnung
      }
    }
  }
}`;

queries.history = `query MyQuery($schluessel_id: Int) {
  cs_calc_history(args: {schluesselid: $schluessel_id}) {
    alkis_id
    level
    nachfolger_alkis_id
    nachfolger_name
    nachfolger_schluessel_id
    schluessel_id
    vorgaenger_alkis_id
    vorgaenger_name
    vorgaenger_schluessel_id
  }
}`;

queries.getGeomFromWuNDA = `query q($alkis_id: String) {
  flurstueck(where: {alkis_id: {_eq: $alkis_id}}) {
    alkis_id
    extended_geom {
      area
      geo_field
    }
  }
}
`;

queries.getFlurstuckelByContractFileNumber = `query MyQuery($aktz: String) {
  flurstueck(where: {ar_vertraegeArray: {vertrag: {aktenzeichen: {_ilike: $aktz}}}}) {
    id
    flurstueck_schluessel {
      flur
      flurstueck_zaehler
      flurstueck_nenner
      gemarkung {
        schluessel
        bezeichnung
      }
      flurstueck_art {
        bezeichnung
      }
      gueltig_bis
    }
  }
}`;

queries.getFlurstuckelByMipaFileNumber = `query MyQuery($aktz: String) {
  view_mipa_by_aktenzeichen(where: {aktenzeichen: {_ilike: $aktz}}, distinct_on: id) {
    gemarkung
    flur
    flurstueck_nenner
    flurstueck_zaehler
    id
    schluessel
    historisch
    flurstueck_art
  }
}`;

queries.getFstckForPoint = `query q($x: Float!, $y: Float!) {
  flurstueck(where: {geom: {geo_field: {_st_intersects: {type: "Point", crs: {type: "name", properties: {name: "urn:ogc:def:crs:EPSG::25832"}}, coordinates: [$x, $y]}}}, historisch: {_is_null: true}}) {
    alkis_id
    historisch
    geom { 
      geo_field
    }
  }
}
`;

queries.landparcelForPointGeom = `
query landparcelForPoint($x: Float!, $y: Float!) {
  alkis_landparcel(where: {geom: {geo_field: {_st_intersects: {type: "Point", crs: {type: "name", properties: {name: "urn:ogc:def:crs:EPSG::25832"}}, coordinates: [$x, $y]}}}}) {
    id
    alkis_id
  }
}
`;
