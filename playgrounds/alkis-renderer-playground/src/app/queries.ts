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
