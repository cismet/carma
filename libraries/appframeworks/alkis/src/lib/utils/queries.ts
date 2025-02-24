const queries: Record<string, string> = {};
export default queries;

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

queries.landparcelForPointGeom = `
query landparcelForPoint($x: Float!, $y: Float!) {
  alkis_landparcel(where: {geom: {geo_field: {_st_intersects: {type: "Point", crs: {type: "name", properties: {name: "urn:ogc:def:crs:EPSG::25832"}}, coordinates: [$x, $y]}}}}) {
    id
    alkis_id
  }
}
`;
