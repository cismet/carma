const wizardQueries = {};
export default wizardQueries;

wizardQueries.flurstueckArten = `query FlurstueckArten {
  flurstueck_art {
    id
    bezeichnung
  }
}`;

// The nenner is nullable and Hasura has no conditional operators, so the two
// cases get their own document instead of one clever one.
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
    datum_entstehung
    datum_letzter_stadtbesitz
    fk_gemarkung
    gemarkung { id schluessel bezeichnung }
    flurstueck_art { id bezeichnung }
  }
}`;

// Nenner 0 and NULL both mean "no Nenner", so a lookup for 0 has to match
// either — older rows carry NULL where the wizard writes 0.
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

// Full nutzung tree, used as the source for the rename-time copy.
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

wizardQueries.lockForSchluessel = `query LockForSchluessel($schluesselId: Int!) {
  sperre(where: {fk_flurstueck_schluessel: {_eq: $schluesselId}}) {
    id
    user_string
    additional_info
  }
}`;

wizardQueries.rebeByGeo = `query RebeByGeo($geo: geometry) {
  rebe(where: {extended_geom: {geo_field: {_st_intersects: $geo}}}) {
    id
    datum_loeschung
  }
}`;

wizardQueries.mipaByGeo = `query MipaByGeo($geo: geometry) {
  mipa(where: {extended_geom: {geo_field: {_st_intersects: $geo}}}) {
    id
    vertragsende
  }
}`;

/* Geometrie */

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
