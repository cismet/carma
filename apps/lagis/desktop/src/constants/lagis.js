import { gql } from "graphql-request";
import queries from "../core/queries/online";

export const REST_SERVICE_LAGIS = "https://lagis-api.cismet.de";
export const LAGIS_DOMAIN = "LAGIS";

export const REST_SERVICE_WUNDA = "https://wunda-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";

export const REST_SERVICES = {
  LAGIS: REST_SERVICE_LAGIS,
  WUNDA_BLAU: REST_SERVICE_WUNDA,
};

export const APP_KEY = "lagis-desktop";
export const STORAGE_PREFIX = "1";

export const WUNDA_ENDPOINT =
  REST_SERVICE_WUNDA + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const landparcelForPointGeomQuery = gql`
  ${queries.landparcelForPointGeom}
`;
