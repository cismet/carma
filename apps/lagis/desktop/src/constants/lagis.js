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

// Intranet document server for non-http DMS links. The host changes between
// deployments (was s10222, now sl0548).
export const DMS_DOCUMENT_SERVER =
  import.meta.env.VITE_LAGIS_DESKTOP_DMS_DOCUMENT_SERVER ||
  "http://dokumente.sl0548.wuppertal-intra.de";

export const APP_KEY = "lagis-desktop";
export const STORAGE_PREFIX = "1";

export const WUNDA_ENDPOINT =
  REST_SERVICE_WUNDA + "/graphql/" + WUNDA_DOMAIN + "/execute";

export const landparcelForPointGeomQuery = gql`
  ${queries.landparcelForPointGeom}
`;

// History navigation configuration
export const HISTORY_LIMIT = 10;
