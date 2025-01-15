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
      }
    }
    aid
    bbc
  }
}
`;
