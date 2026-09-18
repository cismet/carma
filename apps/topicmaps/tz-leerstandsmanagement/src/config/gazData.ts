import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataTZLeerstandsmanagement";

const endpoints = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
];

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "3857";

const sources = endpoints.map((endpoint) =>
  createConfig(endpoint, { crs, host })
);

export const gazDataConfig = { crs, prefix, sources };
