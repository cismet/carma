import { createConfig, ENDPOINTS } from "@carma/resources";

const prefix = "GazDataForBelIS-OnlineByCismet";

const endpoints = [
  ENDPOINTS.ADRESSEN,
  ENDPOINTS.BEZIRKE,
  ENDPOINTS.QUARTIERE,
  ENDPOINTS.POIS,
  ENDPOINTS.KITAS,
];

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "3857";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
