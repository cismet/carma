import { createConfig, ENDPOINT } from "@carma-commons/resources";

export const prefix = "GazDataForStadtplanCreatedByCismet";

const sources = [
  ENDPOINT.GEPS,
  ENDPOINT.GEPS_REVERSE,
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
];
const host = "https://wupp-topicmaps-data.cismet.de";
const crs = "25832";

export const sourcesConfig = sources.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});
