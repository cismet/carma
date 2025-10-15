import { createConfig, ENDPOINTS } from "@carma/resources";

const prefix = "GazDataForHochwasserkarteByCismet";

const endpoints = [
  ENDPOINTS.ADRESSEN,
  ENDPOINTS.BEZIRKE,
  ENDPOINTS.QUARTIERE,
  ENDPOINTS.POIS,
  ENDPOINTS.KITAS,
  ENDPOINTS.BPLAENE,
];
const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "25832";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
