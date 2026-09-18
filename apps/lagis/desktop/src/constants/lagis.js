import { gql } from "graphql-request";
import queries from "../core/queries/online";

export const REST_SERVICE_LAGIS =
  import.meta.env.VITE_REST_SERVICE_LAGIS ||
  "https://lagis-cloud-blau-api.cismet.de";
export const LAGIS_DOMAIN = "LAGIS";

export const REST_SERVICE_WUNDA =
  import.meta.env.VITE_REST_SERVICE_WUNDA ||
  "https://wunda-ro-cloud-api.cismet.de";
export const WUNDA_DOMAIN = "WUNDA_BLAU";

export const REST_SERVICES = {
  LAGIS: REST_SERVICE_LAGIS,
  WUNDA_BLAU: REST_SERVICE_WUNDA,
};

export const APP_KEY = "lagis-desktop";
export const STORAGE_PREFIX = "1";

export const WUNDA_ENDPOINT =
  REST_SERVICE_WUNDA + "/graphql/" + WUNDA_DOMAIN + "/execute";

// Writes go through the generic cids actions, not through GraphQL — the
// /graphql/LAGIS/execute proxy only accepts queries. Same mechanism BelIS
// desktop and the WUNDA portals already use.
export const LAGIS_SAVE_ENDPOINT =
  REST_SERVICE_LAGIS +
  "/actions/" +
  LAGIS_DOMAIN +
  ".SaveObject/tasks?resultingInstanceType=result";

// cs_class is not exposed through the GraphQL proxy, so cids class ids come
// from the REST class listing instead.
export const LAGIS_CLASSES_ENDPOINT =
  REST_SERVICE_LAGIS +
  "/classes?domain=" +
  LAGIS_DOMAIN +
  "&limit=1000&offset=0&role=all";

export const LAGIS_DELETE_ENDPOINT =
  REST_SERVICE_LAGIS +
  "/actions/" +
  LAGIS_DOMAIN +
  ".DeleteObject/tasks?resultingInstanceType=result";

export const landparcelForPointGeomQuery = gql`
  ${queries.landparcelForPointGeom}
`;

// History navigation configuration
export const HISTORY_LIMIT = 10;
