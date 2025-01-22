import { createConfig, ENDPOINT } from "@carma-commons/resources";

export const prefix = "GazDataForHochwasserkarteByCismet";

const sources = [
  ENDPOINT.GEPS,
  ENDPOINT.GEPS_REVERSE,
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
];
const host = "https://wunda-geoportal.cismet.de";
const crs = "3857";

export const sourcesConfig = sources.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});
