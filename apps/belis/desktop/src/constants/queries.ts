const queries: Record<string, string> = {};
export default queries;

queries.jwtTestQuery = `
query Test {
  __typename ## Placeholder value
}`;

queries.bauart = `
query MyQuery {
  bauart {
    bezeichnung
    id
  }
}`;

queries.team = `
query MyQuery {
  team {
    id
    name
  }
}`;

queries.querschnitt = `
query MyQuery {
  querschnitt {
    groesse
    id
  }
}`;

queries.leuchtmittel = `
query MyQuery {
  leuchtmittel {
    lichtfarbe
    id
    hersteller
  }
}`;

queries.tkey_unterh_mast = `
query MyQuery {
  tkey_unterh_mast {
    id
    pk
    unterhalt_mast
  }
}`;

queries.material_mauerlasche = `
query MyQuery {
  material_mauerlasche {
    id
    bezeichnung
  }
}`;
