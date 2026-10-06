const wizardQueries = {};
export default wizardQueries;

wizardQueries.flurstueckArten = `query FlurstueckArten {
  flurstueck_art {
    id
    bezeichnung
  }
}`;

// Hasura has no conditional operators, so a null Nenner needs its own query
wizardQueries.schluesselByKeyWithNenner = `query SchluesselByKey($gemarkungId: Int!, $flur: Int!, $zaehler: Int!, $nenner: Int!) {
  flurstueck_schluessel(where: {
    fk_gemarkung: {_eq: $gemarkungId},
    flur: {_eq: $flur},
    flurstueck_zaehler: {_eq: $zaehler},
    flurstueck_nenner: {_eq: $nenner}
  }) {
    id
    flur
    flurstueck_zaehler
    flurstueck_nenner
    gueltig_bis
    war_staedtisch
    ist_gesperrt
    bemerkung_sperre
    datum_entstehung
    datum_letzter_stadtbesitz
    fk_gemarkung
    gemarkung { id schluessel bezeichnung }
    flurstueck_art { id bezeichnung }
  }
}`;

wizardQueries.schluesselByKeyWithoutNenner = `query SchluesselByKey($gemarkungId: Int!, $flur: Int!, $zaehler: Int!) {
  flurstueck_schluessel(where: {
    fk_gemarkung: {_eq: $gemarkungId},
    flur: {_eq: $flur},
    flurstueck_zaehler: {_eq: $zaehler},
    flurstueck_nenner: {_is_null: true}
  }) {
    id
    flur
    flurstueck_zaehler
    flurstueck_nenner
    gueltig_bis
    war_staedtisch
    ist_gesperrt
    bemerkung_sperre
    datum_entstehung
    datum_letzter_stadtbesitz
    fk_gemarkung
    gemarkung { id schluessel bezeichnung }
    flurstueck_art { id bezeichnung }
  }
}`;

// Nenner 0 and NULL both mean none; older rows carry NULL
wizardQueries.schluesselByKeyZeroNenner = `query SchluesselByKey($gemarkungId: Int!, $flur: Int!, $zaehler: Int!) {
  flurstueck_schluessel(where: {
    fk_gemarkung: {_eq: $gemarkungId},
    flur: {_eq: $flur},
    flurstueck_zaehler: {_eq: $zaehler},
    _or: [{flurstueck_nenner: {_eq: 0}}, {flurstueck_nenner: {_is_null: true}}]
  }) {
    id
    flur
    flurstueck_zaehler
    flurstueck_nenner
    gueltig_bis
    war_staedtisch
    ist_gesperrt
    bemerkung_sperre
    datum_entstehung
    datum_letzter_stadtbesitz
    fk_gemarkung
    gemarkung { id schluessel bezeichnung }
    flurstueck_art { id bezeichnung }
  }
}`;

wizardQueries.schluesselById = `query SchluesselById($id: Int!) {
  flurstueck_schluessel(where: {id: {_eq: $id}}) {
    id
    flur
    flurstueck_zaehler
    flurstueck_nenner
    gueltig_bis
    war_staedtisch
    ist_gesperrt
    bemerkung_sperre
    datum_entstehung
    datum_letzter_stadtbesitz
    fk_gemarkung
    gemarkung { id schluessel bezeichnung }
    flurstueck_art { id bezeichnung }
  }
}`;

wizardQueries.flurstueckBySchluesselId = `query FlurstueckBySchluesselId($schluesselId: Int!) {
  flurstueck(where: {fk_flurstueck_schluessel: {_eq: $schluesselId}}) {
    id
    bemerkung
    in_stadtbesitz
    fk_spielplatz
    fk_flurstueck_schluessel
    nutzungArrayRelationShip {
      id
      historisch
      nutzung_buchungArrayRelationShip {
        id
        gueltig_bis
      }
    }
    dms_urlArrayRelationShip { id }
    verwaltungsbereiche_eintragArrayRelationShip { id }
    ar_vertraegeArray { fk_vertrag }
    ar_baeumeArray { fk_baum }
  }
}`;

wizardQueries.nutzungenForFlurstueck = `query NutzungenForFlurstueck($flurstueckId: Int!) {
  nutzung(where: {fk_flurstueck: {_eq: $flurstueckId}}) {
    id
    historisch
    fk_flurstueck
    nutzung_buchungArrayRelationShip {
      id
      bemerkung
      flaeche
      gueltig_von
      gueltig_bis
      ist_buchwert
      quadratmeterpreis
      fk_nutzungsart
      fk_anlageklasse
      ar_bebauungenArray { fk_bebauung }
      ar_flaechennutzungenArray { fk_flaechennutzung }
    }
  }
}`;

wizardQueries.successorEdges = `query SuccessorEdges($flurstueckId: Int!) {
  flurstueck_historie(where: {fk_vorgaenger: {_eq: $flurstueckId}}) {
    id
    fk_nachfolger
  }
}`;

// the `sperre` view stays empty, so locks are read from cs_locks directly
wizardQueries.lockForObject = `query LockForObject($classId: Int!, $objectId: Int!) {
  cs_locks(where: {class_id: {_eq: $classId}, object_id: {_eq: $objectId}}) {
    id
    user_string
    additional_info
  }
}`;

wizardQueries.locksByUser = `query LocksByUser($userString: String!) {
  cs_locks(where: {user_string: {_eq: $userString}}) {
    id
  }
}`;

wizardQueries.rebeByGeo = `query RebeByGeo($geo: geometry) {
  rebe(where: {geom: {geo_field: {_st_intersects: $geo}}}) {
    id
    datum_loeschung
  }
}`;

wizardQueries.mipaByGeo = `query MipaByGeo($geo: geometry) {
  mipa(where: {geom: {geo_field: {_st_intersects: $geo}}}) {
    id
    vertragsende
  }
}`;

wizardQueries.mipaForEdit = `query MipaForEdit($geo: geometry) {
  mipa(where: {geom: {geo_field: {_st_intersects: $geo}}}, order_by: {id: asc}) {
    id
    lage
    aktenzeichen
    flaeche
    nutzer
    vertragsbeginn
    vertragsende
    bemerkung
    geom { geo_field }
    mipa_nutzung {
      id
      ausgewaehlte_nummer
      mipa_kategorie { id }
    }
    ar_mipa_merkmaleArray {
      mipa_merkmal { id }
    }
  }
}`;

wizardQueries.rebeForEdit = `query RebeForEdit($geo: geometry) {
  rebe(where: {geom: {geo_field: {_st_intersects: $geo}}}, order_by: {id: asc}) {
    id
    ist_recht
    beschreibung
    nummer
    datum_eintragung
    datum_loeschung
    bemerkung
    rebe_art { id }
    geom { geo_field }
  }
}`;

wizardQueries.rebeArten = `query RebeArten {
  rebe_art(order_by: {bezeichnung: asc}) {
    id
    bezeichnung
  }
}`;

wizardQueries.mipaStammdaten = `query MipaStammdaten {
  mipa_kategorie(order_by: {bezeichnung: asc}) {
    id
    bezeichnung
  }
  mipa_merkmal(order_by: {bezeichnung: asc}) {
    id
    bezeichnung
  }
}`;

wizardQueries.geometriesFromWuNDa = `query GeometriesFromWuNDa($alkisIds: [String!]) {
  flurstueck(where: {alkis_id: {_in: $alkisIds}}) {
    alkis_id
    extended_geom {
      area
      geo_field
    }
  }
}`;

wizardQueries.gemarkungen = `query Gemarkungen {
  gemarkung {
    id
    schluessel
    bezeichnung
  }
}`;

wizardQueries.dienststellen = `query Dienststellen {
  verwaltende_dienststelle {
    id
    abkuerzung_abteilung
    bezeichnung_abteilung
    ressort { abkuerzung }
    farbeArrayRelationShip { rgb_farbwert }
  }
}`;

wizardQueries.zusatzRolleArten = `query ZusatzRolleArten {
  zusatz_rolle_art {
    id
    name
  }
}`;

wizardQueries.adminDataBySchluesselId = `query AdminDataBySchluesselId($schluesselId: Int!) {
  flurstueck(where: {fk_flurstueck_schluessel: {_eq: $schluesselId}}) {
    bemerkung
    verwaltungsbereiche_eintragArrayRelationShip {
      id
      verwaltungsbereichArrayRelationShip {
        flaeche
        verwaltende_dienststelle { id }
        extended_geom { geo_field }
      }
    }
    zusatz_rolleArrayRelationShip {
      verwaltende_dienststelle { id }
      zusatz_rolle_art { id }
    }
    strassenfrontArrayRelationShip {
      strassenname
      laenge
    }
  }
}`;

wizardQueries.adminRowsBySchluesselId = `query AdminRowsBySchluesselId($schluesselId: Int!) {
  flurstueck(where: {fk_flurstueck_schluessel: {_eq: $schluesselId}}) {
    id
    bemerkung
    verwaltungsbereiche_eintragArrayRelationShip {
      id
      geaendert_am
      verwaltungsbereichArrayRelationShip {
        flaeche
        verwaltende_dienststelle { id }
        extended_geom { geo_field }
      }
    }
    zusatz_rolleArrayRelationShip {
      id
      verwaltende_dienststelle { id }
      zusatz_rolle_art { id }
    }
    strassenfrontArrayRelationShip {
      id
      strassenname
      laenge
    }
  }
}`;

wizardQueries.nutzungStammdaten = `query NutzungStammdaten {
  anlageklasse(order_by: {id: asc}) {
    id
    bezeichnung
    schluessel
  }
  nutzungsart {
    id
    bezeichnung
    schluessel
  }
}`;
