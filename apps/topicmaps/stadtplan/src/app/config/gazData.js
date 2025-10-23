import { createConfig, ENDPOINT } from "@carma-commons/resources";

export const prefix = "GazDataForStadtplanCreatedByCismet";

const sources = [
  ENDPOINT.GEPS,
  ENDPOINT.GEPS_REVERSE,
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
];
const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "25832";

export const sourcesConfig = sources.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});
