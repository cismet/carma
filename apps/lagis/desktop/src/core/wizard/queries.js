/**
 * GraphQL documents for the Flurstück-Assistent.
 *
 * Table and relationship names follow the ones already used in
 * core/queries/online.js. The mutation names assume the default Hasura naming
 * (insert_<table>_one / update_<table>_by_pk / ...); they are collected here so
 * that a rename on the server only has to be fixed in one place.
 */

const wizardQueries = {};
export default wizardQueries;

/* ------------------------------------------------------------------ reads */

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
  flurstueck_schluessel_by_pk(id: $id) {
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

wizardQueries.classIdForTable = `query ClassIdForTable($tableName: String!) {
  cs_class(where: {table_name: {_eq: $tableName}}) {
    id
    table_name
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

/* -------------------------------------------------------------- mutations */

wizardQueries.insertSchluessel = `mutation InsertSchluessel($object: flurstueck_schluessel_insert_input!) {
  insert_flurstueck_schluessel_one(object: $object) {
    id
  }
}`;

wizardQueries.updateSchluessel = `mutation UpdateSchluessel($id: Int!, $changes: flurstueck_schluessel_set_input!) {
  update_flurstueck_schluessel_by_pk(pk_columns: {id: $id}, _set: $changes) {
    id
  }
}`;

wizardQueries.deleteSchluessel = `mutation DeleteSchluessel($id: Int!) {
  delete_flurstueck_schluessel_by_pk(id: $id) {
    id
  }
}`;

wizardQueries.insertFlurstueck = `mutation InsertFlurstueck($object: flurstueck_insert_input!) {
  insert_flurstueck_one(object: $object) {
    id
  }
}`;

wizardQueries.updateFlurstueck = `mutation UpdateFlurstueck($id: Int!, $changes: flurstueck_set_input!) {
  update_flurstueck_by_pk(pk_columns: {id: $id}, _set: $changes) {
    id
  }
}`;

wizardQueries.deleteFlurstueck = `mutation DeleteFlurstueck($id: Int!) {
  delete_flurstueck_by_pk(id: $id) {
    id
  }
}`;

wizardQueries.insertHistoryEdge = `mutation InsertHistoryEdge($object: flurstueck_historie_insert_input!) {
  insert_flurstueck_historie_one(object: $object) {
    id
  }
}`;

wizardQueries.deleteHistoryEdge = `mutation DeleteHistoryEdge($id: Int!) {
  delete_flurstueck_historie_by_pk(id: $id) {
    id
  }
}`;

wizardQueries.insertNutzung = `mutation InsertNutzung($object: nutzung_insert_input!) {
  insert_nutzung_one(object: $object) {
    id
  }
}`;

wizardQueries.updateNutzung = `mutation UpdateNutzung($id: Int!, $changes: nutzung_set_input!) {
  update_nutzung_by_pk(pk_columns: {id: $id}, _set: $changes) {
    id
  }
}`;

wizardQueries.deleteNutzung = `mutation DeleteNutzung($id: Int!) {
  delete_nutzung_by_pk(id: $id) {
    id
  }
}`;

wizardQueries.updateNutzungBuchung = `mutation UpdateNutzungBuchung($id: Int!, $changes: nutzung_buchung_set_input!) {
  update_nutzung_buchung_by_pk(pk_columns: {id: $id}, _set: $changes) {
    id
  }
}`;

wizardQueries.updateDmsUrlFlurstueck = `mutation UpdateDmsUrlFlurstueck($id: Int!, $flurstueckId: Int!) {
  update_dms_url_by_pk(pk_columns: {id: $id}, _set: {fk_flurstueck: $flurstueckId}) {
    id
  }
}`;

wizardQueries.updateVerwaltungsbereichEintragFlurstueck = `mutation UpdateVerwaltungsbereichEintragFlurstueck($id: Int!, $flurstueckId: Int!) {
  update_verwaltungsbereiche_eintrag_by_pk(pk_columns: {id: $id}, _set: {fk_flurstueck: $flurstueckId}) {
    id
  }
}`;

wizardQueries.moveArVertraege = `mutation MoveArVertraege($fromFlurstueckId: Int!, $toFlurstueckId: Int!) {
  update_ar_vertraege(where: {fk_flurstueck: {_eq: $fromFlurstueckId}}, _set: {fk_flurstueck: $toFlurstueckId}) {
    affected_rows
  }
}`;

wizardQueries.moveArBaeume = `mutation MoveArBaeume($fromFlurstueckId: Int!, $toFlurstueckId: Int!) {
  update_ar_baeume(where: {fk_flurstueck: {_eq: $fromFlurstueckId}}, _set: {fk_flurstueck: $toFlurstueckId}) {
    affected_rows
  }
}`;

wizardQueries.updateRebe = `mutation UpdateRebe($id: Int!, $datumLoeschung: date) {
  update_rebe_by_pk(pk_columns: {id: $id}, _set: {datum_loeschung: $datumLoeschung}) {
    id
  }
}`;

wizardQueries.updateMipa = `mutation UpdateMipa($id: Int!, $vertragsende: date) {
  update_mipa_by_pk(pk_columns: {id: $id}, _set: {vertragsende: $vertragsende}) {
    id
  }
}`;

wizardQueries.insertLock = `mutation InsertLock($object: cs_locks_insert_input!) {
  insert_cs_locks_one(object: $object) {
    id
  }
}`;

wizardQueries.deleteLock = `mutation DeleteLock($id: Int!) {
  delete_cs_locks_by_pk(id: $id) {
    id
  }
}`;

/* --------------------------------------------------------------- Geometrie */

// The Swing client pulled these areas over WFS (GeometryWorker); here they come
// from the ALKIS view that the app already reads elsewhere.
wizardQueries.areasByAlkisIds = `query AreasByAlkisIds($alkisIds: [String!]) {
  extended_alkis_flurstueck(where: {alkis_id: {_in: $alkisIds}}) {
    alkis_id
    area
  }
}`;

wizardQueries.geometryByAlkisId = `query GeometryByAlkisId($alkisId: String!) {
  extended_alkis_flurstueck(where: {alkis_id: {_eq: $alkisId}}) {
    alkis_id
    area
    geometrie
  }
}`;

wizardQueries.gemarkungen = `query Gemarkungen {
  gemarkung {
    id
    schluessel
    bezeichnung
  }
}`;
