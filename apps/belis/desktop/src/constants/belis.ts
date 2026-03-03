import queries from "./queries";
import { gql } from "graphql-request";

export const REST_SERVICE = "https://belis-cloud-api.cismet.de";
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

// export const tkeyStrassenschluesselQuery = gql`
//   ${queries.tkey_strassenschluessel}
// `;

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
