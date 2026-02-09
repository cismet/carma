import { createConfig, ENDPOINT } from "@carma-commons/resources";

const prefix = "GazDataForHochwasserkarteByCismet";
const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "3857";

export const defaultEndpoints = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
];

export const buildGazDataConfig = (endpoints) => {
  const sources = endpoints.map((ep) => createConfig(ep, { crs, host }));
  return { crs, prefix, sources };
};

export const gazDataConfig = buildGazDataConfig(defaultEndpoints);
