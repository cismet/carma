import { createConfig, ENDPOINTS } from "@carma/resources";

export const prefix = "GazDataForStadtplanCreatedByCismet";

const sources = [
  ENDPOINTS.GEPS,
  ENDPOINTS.GEPS_REVERSE,
  ENDPOINTS.ADRESSEN,
  ENDPOINTS.BEZIRKE,
  ENDPOINTS.QUARTIERE,
  ENDPOINTS.POIS,
  ENDPOINTS.KITAS,
];
const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const crs = "25832";

export const sourcesConfig = sources.map((endpoint) => {
  return createConfig(endpoint, { crs, host });
});
