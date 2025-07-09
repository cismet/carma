// @ts-nocheck

import {
  abzweigdose_fields,
  leitung_fields,
  leuchte_fields,
  mast_fields,
  mauerlasche_fields,
  schaltstelle_fields,
  veranlassung_fields,
} from "./parts";

const queries = {};
export const geomFactories = {};
export const fragments = [];
const defaultGeomFactory = (object) => object.geom.geo_field;

queries.abzweigdose = `
abzweigdose(where: {geom: {geo_field: {_st_intersects: $bbPoly}}}) {
    ${abzweigdose_fields}
  }
`;
geomFactories.abzweigdose = defaultGeomFactory;

queries.leitung = `
leitung(where: {geom: {geo_field: {_st_intersects: $bbPoly}}}) {
  ${leitung_fields}
  }
`;
geomFactories.leitung = defaultGeomFactory;

queries.mauerlasche = `
mauerlasche(where: {geom: {geo_field: {_st_intersects: $bbPoly}}}) {
    ${mauerlasche_fields}
  } 
`;
geomFactories.mauerlasche = defaultGeomFactory;

queries.schaltstelle = `
  schaltstelle(where: {geom: {geo_field: {_st_intersects: $bbPoly}}}) {
    ${schaltstelle_fields}
  }
`;
geomFactories.schaltstelle = defaultGeomFactory;

queries.tdta_leuchten = `
tdta_leuchten(where: {tdta_standort_mast: {geom: {geo_field: {_st_intersects: $bbPoly}}}}) {
  ${leuchte_fields}
}
`;
geomFactories.tdta_leuchten = (o) => o.fk_standort.geom.geo_field;

queries.tdta_standort_mast = `
tdta_standort_mast(where: {_and: {_not: {leuchtenArray: {}}}, geom: {geo_field: {_st_intersects: $bbPoly}}}) {
  ${mast_fields}
}

`;
geomFactories.tdta_standort_mast = defaultGeomFactory;

queries.arbeitsauftraege_by_team_only_protocolgeoms = `

arbeitsauftrag(where: 
  {_and: [
    {team: {id: {_eq: $teamId}}} ,
    {_or:[
      {is_deleted:{_is_null:true}},
      {is_deleted:{_eq:false}}
    ]},
    {_or:[
      {ar_protokolleArray:{arbeitsprotokoll:{fk_status:{_is_null:true}}}},
      {ar_protokolleArray:{arbeitsprotokoll:{arbeitsprotokollstatus:{schluessel:{_eq:"0"}}}}},
     ]},
     {_or:[
       { _and :[
        {ar_protokolleArray: {arbeitsprotokoll:{fk_geometrie:{_is_null:false}}}},
        {ar_protokolleArray: {arbeitsprotokoll: {geometrie: {fk_geom: {_is_null: false}}}}},
        ]}, 
       {ar_protokolleArray:{arbeitsprotokoll:{fk_leuchte:{_is_null:false}}}},
       {ar_protokolleArray:{arbeitsprotokoll:{fk_standort:{_is_null:false}}}},
       {ar_protokolleArray:{arbeitsprotokoll:{fk_mauerlasche:{_is_null:false}}}},
       {ar_protokolleArray:{arbeitsprotokoll:{fk_leitung:{_is_null:false}}}},
       {ar_protokolleArray:{arbeitsprotokoll:{fk_abzweigdose:{_is_null:false}}}},
       {ar_protokolleArray:{arbeitsprotokoll:{fk_schaltstelle:{_is_null:false}}}},
     ]}
  ]}) {
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



`;

queries.full_arbeitsauftrag_by_id = `
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
        ${veranlassung_fields}
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
      tdta_leuchten { ${leuchte_fields} }
      tdta_standort_mast { ${mast_fields} }
      schaltstelle { ${schaltstelle_fields} }
      mauerlasche {${mauerlasche_fields}}
      leitung {${leitung_fields}}
      abzweigdose {${abzweigdose_fields}}
    }
  }
}

`;
export default queries;

geomFactories.geometrie = defaultGeomFactory;
