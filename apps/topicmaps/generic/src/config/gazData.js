import { createConfigWithoutCRS, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataForHochwasserkarteByCismet";

const endpoints = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
  ENDPOINT.BPKLIMASTANDORTE,
];

const host = "https://wunda-geoportal.cismet.de";
const crs = "-";

const sources = endpoints.map((endpoint) => {
  return createConfigWithoutCRS(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
