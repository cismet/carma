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
      };
    case "standorte":
      return {
        id: r.id,
        mastart: r.tkey_mastart?.mastart,
        masttyp: r.tkey_masttyp?.masttyp,
        lfd_nummer: r.lfd_nummer,
        strassenschluessel: r.tkey_strassenschluessel?.pk,
        strasse: r.tkey_strassenschluessel?.strasse,
      };
    case "mauerlaschen":
      return {
        id: r.id,
        bezeichnung: r.material_mauerlasche?.bezeichnung,
        laufende_nummer: r.laufende_nummer,
        strassenschluessel: r.tkey_strassenschluessel?.pk,
        strasse: r.tkey_strassenschluessel?.strasse,
      };
    case "leitungen":
      return {
        id: r.id,
        bezeichnung: r.leitungstyp?.bezeichnung,
        leitungstyp: r.leitungstyp?.bezeichnung,
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
