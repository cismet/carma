const queries = {};
export const geomFactories = {};
export default queries;

queries.jwtTestQuery = `
query Test {
  __typename ## Placeholder value
}`;

queries.kassenzeichenForPoint = `
query kassenzeichenForPoint($x: Float!, $y: Float!) {
  kassenzeichen(where: {_or: [
    {flaechenArray: {flaecheObject: {flaecheninfoObject: {geom: {geo_field: {_st_intersects: {type: "Point", crs: {type: "name", properties: {name: "urn:ogc:def:crs:EPSG::25832"}}, coordinates: [$x, $y]}}}}}}}, 
    {kassenzeichen_geometrienArray: {kassenzeichen_geometrieObject: {geom: {geo_field: {_st_intersects: {
                  type: "Point"
                  crs: {
                    type: "name"
                    properties: { name: "urn:ogc:def:crs:EPSG::25832" }
                  }
                  coordinates: [$x, $y]
  }}}}}}] }) {
    id
    kassenzeichennummer8
  }
}`;

queries.buchblatt = `
query MyQuery($grundbuchblattnummer: String) {
  view_alkis_buchungsblatt(where: {buchungsblattcode: {_eq: $grundbuchblattnummer}}) {
    buchungsblattcode
    geom
    id
  }
}`;

queries.crossReferences = `
query MyQuery($flaechenId: Int) {
  kassenzeichen(where: {flaechenArray: {flaecheObject: {flaecheninfoObject: {id: {_eq: $flaechenId}}}}}) {
    kassenzeichennummer8
    flaechenArray {
      flaecheObject {
        flaechenbezeichnung
      }
    }
  }
}`;

queries.kassenzeichenForBuchungsblatt = `
query MyQuery($intersectionGeom: geometry) {
  kassenzeichen(order_by: {kassenzeichennummer8: asc}, where: {kassenzeichen_geometrienArray: {kassenzeichen_geometrieObject: {geom: {geo_field: {_st_intersects: $intersectionGeom}}}}}) {
    id
    kassenzeichennummer8
  }
}`;

queries.geoFields = `
query geoFields($bbPoly: geometry) {
  kassenzeichen(where: {flaechenArray: {flaecheObject: {flaecheninfoObject: {geom: {geo_field: {_st_intersects: $bbPoly}}}}}}) {
    kassenzeichennummer8
    flaechenArray {
      flaecheObject {
        id
        flaechenbezeichnung
        flaecheninfoObject {
          geom {
            geo_field
          }
          id
          anschlussgradObject {
            grad
          }
        }
      }
    }
    frontenArray {
      frontObject {
        frontinfoObject {
          geom {
            geo_field
          }
          id
        }
        nummer
      }
    }
    kassenzeichen_geometrienArray {
      id
      kassenzeichen_geometrieObject {
        geom {
          geo_field
        }
        id
        name
      }
    }
  }
}`;

queries.flurstuecke = `
query MyQuery {
  view_alkis_landparcell {
    alkis_id
    pointOnSurface
    pointOnSurfaceX
    pointOnSurfaceY
  }
  gemarkung {
    gemarkungsnummer
    name
  }
}`;

queries.alkisLandparcel = `
query MyQuery($alkisId: String) {
  alkis_landparcel(where: {alkis_id: {_eq: $alkisId}}) {
    id
    flur
    bezeichnung
    adressen
    buchungsblaetter
    fstck_nenner
    fstck_zaehler
    gebaeude
    gemarkung
    geometrie
    groesse
  }
}`;

queries.kassenzeichenD = `
query Kassenzeichen($kassenzeichen: Int) {
  kassenzeichen(where: { kassenzeichennummer8: { _eq: $kassenzeichen } }) {
    id
    datum_erfassung
    bemerkung
    sperre
    kassenzeichennummer8
    frontenArray(
      order_by: {
        frontObject: {
          frontinfoObject: {
            lage_sr_satzung: { strassenreinigung: { key: asc } }
          }
        }
      }
    ) {
      frontObject {
        nummer
        id
        bearbeitet_durch
        erfassungsdatum
        frontinfoObject {
          anteil
          baulasten
          grunddienstbarkeit
          id
          geom {
            geo_field
          }
          laenge_grafik
          laenge_korrektur
          lage_sr_satzung {
            id
            sr_bem
            sr_klasse
            strasse
            strasseObject {
              id
              name
              schluessel
            }
            strassenreinigung {
              id
              key
              name
              schluessel
            }
            wd_bem
            winterdienst {
              id
              key
              name
              schluessel
            }
            wd_prio
          }
          lage_wd_satzung {
            id
            sr_klasse
            strasse
            strasseObject {
              id
              name
              schluessel
            }
            strassenreinigung {
              id
              key
              name
              schluessel
            }
            wd_bem
            winterdienst {
              key
              id
              name
              schluessel
            }
          }
          quadratwurzel
          sr_bem
          sr_klasse_or
          sr_veranlagung
          strasseObject {
            id
            name
            schluessel
          }
          wd_bem
          strassenreinigung {
            id
            key
            name
            schluessel
          }
          wd_prio_or
          wd_veranlagung
          winkel
          winterdienst {
            id
            key
            name
            schluessel
          }
          
        }
      }
    }
    flaechenArray(
      order_by: {
        flaecheObject: {
          flaecheninfoObject: { flaechenbeschreibung: { beschreibung: asc } }
        }
      }
    ) {
      flaecheObject {
        anteil
        bemerkung
        datum_erfassung
        datum_veranlagung
        flaechenbezeichnung
        id
        flaecheninfoObject {
          anschlussgradObject {
            grad
            grad_abkuerzung
            id
          }
          flaechenartObject {
            art
            art_abkuerzung
            id
          }
          groesse_aus_grafik
          groesse_korrektur
          id
          nachgewiesen
          flaechenbeschreibung {
            dachflaeche
            id
            beschreibung
          }
          beschreibung
          geom {
            geo_field
          }
        }
        flaecheninfo
      }
    }
    kassenzeichen_geometrienArray {
      id
      kassenzeichen_geometrieObject {
        id
        istfrei
        name
        geom {
          geo_field
          
        }
      }
    }
    kanalanschlussObject {
      rkangeschlossen
      mkrangeschlossen
      mksangeschlossen
      skangeschlossen
      rkvorhanden
      mkrvorhanden
      mksvorhanden
      skvorhanden
      sgvorhanden
      sgentleerung
      kkaentleerung
      kkavorhanden
      evg
      befreiungenunderlaubnisseArray {
        id
        befreiungerlaubnisObject {
          aktenzeichen
          antrag_vom
          gueltig_bis
          befreiungerlaubnis_nutzung {
            name
          }
          befreiungerlaubnis_geometrieArrayRelationShip {
            id
            befreiungerlaubnis_geometrie_typ_versickerung {
              name
            }
            befreiungerlaubnis_geometrie_typ_einleitung {
              name
            }
            bemerkung
            gewaessername           
            gutachten_vorhanden
            durchfluss
            geom {
              geo_field
            }
          }
        }
      }
    }
  }
  aenderungsanfrage(
    where: { kassenzeichen_nummer: { _eq: $kassenzeichen } }
  ) {
    aenderungsanfrage_status {
      name
    }
  }
}
`;

queries.kassenzeichenForGeom = `
query kassenzeichenForGeom($search_geom: geometry!) {
  kassenzeichen(where: {_or: [
    {flaechenArray: {flaecheObject: {flaecheninfoObject: {geom: {geo_field: {_st_intersects: $search_geom}}}}}}, 
    {kassenzeichen_geometrienArray: {kassenzeichen_geometrieObject: {geom: {geo_field: {_st_intersects: $search_geom}}}}}] }) {
    id
    kassenzeichennummer8
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

queries.landparcelSearch = `
query landparcelForName($name: String!) {
alkis_landparcel(where: {alkis_id: {_eq: $name}}) {
    id
    alkis_id
    bezeichnung
    gemarkung
    groesse
    adressenArray {
      alkis_adresse {
        strasse
        nummer
        gebaeude
      }
    }
    buchungsblaetterArray {
      alkis_buchungsblatt {
        id
        buchungsblattcode
      }
    }
    flur
    fstck_nenner
    fstck_zaehler
    extended_geom {
      geo_field
    }
  }
}
`;

queries.sheetSearch = `
query buchungsblattForName($name: String!) {
  alkis_buchungsblatt(where: {buchungsblattcode: {_eq: $name}}) {
    buchungsblattcode
    blattart
    id
    landparcelsArray {
      alkis_buchungsblatt_landparcel {
        landparcelcode
        id
        lfn
        extended_geom {
          geo_field
        }
      }
    }
    aid
    bbc
  }
}
`;
