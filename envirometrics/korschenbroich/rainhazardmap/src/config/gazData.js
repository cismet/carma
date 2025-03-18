import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataStarkregenHurth";

const endpoints = [];

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "3857";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

export const gazDataConfig = { crs, prefix, sources };
