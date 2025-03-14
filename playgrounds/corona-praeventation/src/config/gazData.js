import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataForHochwasserkarteByCismet";

const endpoints = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.EMOB,
  ENDPOINT.KITAS,
];

const host = "https://wupp-digitaltwin-assets.cismet.de";
const crs = "25832";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
