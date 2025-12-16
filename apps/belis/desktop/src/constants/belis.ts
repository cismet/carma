import queries from "./queries";
import { gql } from "graphql-request";

export const REST_SERVICE = "https://belis-cloud-api.cismet.de";
export const DOMAIN = "BELIS2";
export const ENDPOINT = REST_SERVICE + `/graphql/` + DOMAIN + "/execute";
export const SAVE_ENDPOINT =
  REST_SERVICE +
  "/actions/WUNDA_BLAU.SaveObject/tasks?resultingInstanceType=result";

export const jwtTestQuery = gql`
  ${queries.jwtTestQuery}
`;

export const bauartQuery = gql`
  ${queries.bauart}
`;
