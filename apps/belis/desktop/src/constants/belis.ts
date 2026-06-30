import queries from "./queries";
import { gql } from "graphql-request";
export const REST_SERVICE =
  import.meta.env.VITE_REST_SERVICE || "https://belis-cloud-api.cismet.de";

// RxDB offline-actions sync endpoints (Hasura GraphQL, http + websocket).
export const SYNC_HTTP_URL =
  import.meta.env.VITE_BELIS_DESKTOP_SYNC_HTTP_URL ||
  "https://offline-actions-belis-cloud.cismet.de/v1/graphql";
export const SYNC_WS_URL =
  import.meta.env.VITE_BELIS_DESKTOP_SYNC_WS_URL ||
  "wss://offline-actions-belis-cloud.cismet.de/v1/graphql";

// Secure document store (read-only: preview/download of attachments).
export const SECRES_BASE_URL =
  import.meta.env.VITE_BELIS_DESKTOP_SECRES_URL ||
  "https://belis-cloud.cismet.de/belis2/api/secres";

// "Brand new"/updated features GeoJSON: same-day creations not yet in the main
// vector tiles. Default (dev) serves brand.new.features.json; live sets the env
// var to updated.features.json. The `.md5` sidecar is derived from this URL.
export const BELIS_BRAND_NEW_FC_URL =
  import.meta.env.VITE_BELIS_DESKTOP_BRAND_NEW_FC_URL ||
  "https://tiles.cismet.de/belis/brand.new.features.json";

// Print style prefix for the "brand new"/updated feature styles, derived from the
// FC URL's filename stem so it tracks the dev/live switch automatically (dev:
// "brand.new.features.", live: "updated.features."). No separate env var needed:
// the print styles can never drift from the data source they colour.
export const BELIS_BRAND_NEW_STYLE_PREFIX =
  (BELIS_BRAND_NEW_FC_URL.split("/").pop() ?? "").replace(/\.json$/, "") + ".";

export const DOMAIN = "BELIS2";
export const ENDPOINT = REST_SERVICE + `/graphql/` + DOMAIN + "/execute";
export const SAVE_ENDPOINT =
  REST_SERVICE +
  "/actions/" +
  DOMAIN +
  ".SaveObject/tasks?resultingInstanceType=result";

export const DELETE_ENDPOINT =
  REST_SERVICE +
  "/actions/" +
  DOMAIN +
  ".DeleteObject/tasks?resultingInstanceType=result";

export const buildActionEndpoint = (actionName: string) =>
  REST_SERVICE +
  "/actions/" +
  DOMAIN +
  "." +
  actionName +
  "/tasks?resultingInstanceType=result";

export const UPLOAD_DOCUMENT_ENDPOINT =
  REST_SERVICE +
  "/actions/" +
  DOMAIN +
  ".uploadBelisDocument/tasks?resultingInstanceType=result";

export const jwtTestQuery = gql`
  ${queries.jwtTestQuery}
`;

export const bauartQuery = gql`
  ${queries.bauart}
`;

export const teamQuery = gql`
  ${queries.team}
`;

export const querschnittQuery = gql`
  ${queries.querschnitt}
`;

export const leuchtmittelQuery = gql`
  ${queries.leuchtmittel}
`;

export const tkeyUnterhaltMastQuery = gql`
  ${queries.tkey_unterh_mast}
`;

export const materialMauerlascheQuery = gql`
  ${queries.material_mauerlasche}
`;

export const anlagengruppeQuery = gql`
  ${queries.anlagengruppe}
`;

export const tkeyUnterhaltLeuchteQuery = gql`
  ${queries.tkey_unterh_leuchte}
`;

export const tkeyStrassenschluesselQuery = gql`
  ${queries.tkey_strassenschluessel}
`;

export const tkeyEnergielieferantQuery = gql`
  ${queries.tkey_energielieferant}
`;

export const tkeyBezirkQuery = gql`
  ${queries.tkey_bezirk}
`;

export const leitungstypQuery = gql`
  ${queries.leitungstyp}
`;

export const arbeitsprotokollstatusQuery = gql`
  ${queries.arbeitsprotokollstatus}
`;

export const materialLeitungQuery = gql`
  ${queries.material_leitung}
`;

export const tkeyKennzifferQuery = gql`
  ${queries.tkey_kennziffer}
`;

export const tkeyMastartQuery = gql`
  ${queries.tkey_mastart}
`;

export const veranlassungsartQuery = gql`
  ${queries.veranlassungsart}
`;

export const tkeyKlassifizierungQuery = gql`
  ${queries.tkey_klassifizierung}
`;

export const tkeyDoppelkommandoQuery = gql`
  ${queries.tkey_doppelkommando}
`;

export const masttypQuery = gql`
  ${queries.tkey_masttyp}
`;

export const leuchtentypQuery = gql`
  ${queries.tkey_leuchtentyp}
`;

export const rundsteuerempfaengerQuery = gql`
  ${queries.rundsteuerempfaenger}
`;

export const infobausteinTemplateQuery = gql`
  ${queries.infobaustein_template}
`;

export const infobausteinTemplateByIdQuery = gql`
  ${queries.infobaustein_template_by_id}
`;

export const mauerlascheByIdQuery = gql`
  ${queries.mauerlasche_by_id}
`;

export const schaltstelleByIdQuery = gql`
  ${queries.schaltstelle_by_id}
`;

export const tdtaLeuchtenByIdQuery = gql`
  ${queries.tdta_leuchten_by_id}
`;

export const leitungByIdQuery = gql`
  ${queries.leitung_by_id}
`;

export const abzweigdoseByIdQuery = gql`
  ${queries.abzweigdose_by_id}
`;

export const tdtaStandortMastByIdQuery = gql`
  ${queries.tdta_standort_mast_by_id}
`;

export const arbeitsauftraegeByTeamQuery = gql`
  ${queries.arbeitsauftraege_by_team}
`;

export const arbeitsauftraegeByIdsQuery = gql`
  ${queries.arbeitsauftraege_by_ids}
`;

export const arbeitsauftragByIdQuery = gql`
  ${queries.arbeitsauftragById}
`;

/**
 * Shared animation duration for mini-map view transitions (ms).
 * Matches the default used by useDatasheetMiniMap for the Fachobjekte
 * mini-map, so the Arbeitsaufträge mini-map feels equally snappy.
 */
export const MINI_MAP_TRANSITION_MS = 200;

/**
 * Fixed zoom level for the Fachobjekte mini-map. On each feature selection
 * the mini-map eases to this zoom; the user can temporarily adjust via
 * mousewheel, but the next feature selection resets to this value.
 */
export const MINI_MAP_TARGET_ZOOM = 20;
