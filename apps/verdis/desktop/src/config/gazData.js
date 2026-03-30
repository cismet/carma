import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataForHitzeinderstadtByCismet";

const endpoints = [ENDPOINT.ADRESSEN, ENDPOINT.POIS, ENDPOINT.KITAS];

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "3857";

const sources = endpoints.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});

const landParcelUrl = "https://wunda-geoportal.cismet.de/data/4326/fstck.json";

export const gazDataConfig = { crs, prefix, sources, landParcelUrl };
