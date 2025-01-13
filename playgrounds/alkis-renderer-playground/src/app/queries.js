const queries = {};
export default queries;

queries.landparcelSearch = `
query landparcelForName($name: String!) {
  alkis_landparcel(where: {alkis_id: {_eq: $name}}) {
    id
    bezeichnung
    gemarkung
    groesse
    adressenArray {
      alkis_adresse {
        strasse
      }
    }
    buchungsblaetterArray {
      alkis_buchungsblatt {
        id
        buchungsblattcode
      }
    }
  }
}
`;
