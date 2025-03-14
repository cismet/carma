import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataForHochwasserkarteByCismet";

const endpoints = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
  ENDPOINT.EBIKES,
];

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "25832";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
