// @ts-nocheck

import {
  abzweigdose_fields,
  leitung_fields,
  leuchte_fields,
  leuchtentyp_fields,
  mast_fields,
  mauerlasche_fields,
  rundsteuerempfaenger_fields,
  schaltstelle_fields,
  veranlassung_fields,
} from "./parts";

const queries = {};

queries.abzweigdose = `{
  abzweigdose {${abzweigdose_fields}}
}`;

queries.leitung = `{
  leitung {${leitung_fields}}
}`;

queries.mauerlasche = `{
  mauerlasche { ${mauerlasche_fields}} 
}`;

queries.schaltstelle = `{
  schaltstelle { ${schaltstelle_fields}}
}
`;

queries.tdta_leuchten = `{
  tdta_leuchten  { ${leuchte_fields}}
}`;

queries.tdta_standort_mast = `{
  tdta_standort_mast(where: {_not: {leuchtenArray: {}}}) {
    ${mast_fields}
  }
}`;
queries.team = `{
  team {
    id
   name
  }
}
`;

queries.raw_point_index = `{
    raw_point_index {
      id
      oid
      tablename
      x
      y
  }
}`;

queries.arbeitsauftrag = `query q($teamId: Int!) {    
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
      mauerlasche { ${mauerlasche_fields} }
      leitung { ${leitung_fields} }
      abzweigdose { ${abzweigdose_fields} }
      schaltstelle { ${schaltstelle_fields} }
    }
  }
  }
}
`;

queries.tkey_leuchtentyp = `{
  tkey_leuchtentyp {
    ${leuchtentyp_fields}
  }
}`;

queries.leuchtmittel = `{
  leuchtmittel(where: {hersteller: {_is_null:false}}) {
  id
  hersteller
  lichtfarbe
  }
}`;
queries.rundsteuerempfaenger = `{
  rundsteuerempfaenger {
    ${rundsteuerempfaenger_fields}
  }  
}`;

export default queries;
