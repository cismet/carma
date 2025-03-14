import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataForHitzeinderstadtByCismet";

const endpoints = [ENDPOINT.ADRESSEN, ENDPOINT.POIS, ENDPOINT.KITAS];

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "3857";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
