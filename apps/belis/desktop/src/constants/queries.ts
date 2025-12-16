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
