type EndpointOptions = {
  crs: string;
  host: string;
};

export const ENDPOINTS = {
  ADRESSEN: "adressen",
  AENDERUNGSV: "aenderungsv",
  BEZIRKE: "bezirke",
  BPKLIMASTANDORTE: "bpklimastandorte",
  BPLAENE: "bplaene.v2",
  EBIKES: "ebikes",
  EMOB: "emob",
  GEPS: "geps",
  GEPS_REVERSE: "geps_reverse",
  KITAS: "kitas",
  PRBR: "prbr",
  NO2: "no2",
  QUARTIERE: "quartiere",
  POIS: "pois",
  VORHABEN: "vorhabenkarte",
} as const;

export type EndpointKey = (typeof ENDPOINTS)[keyof typeof ENDPOINTS];

export const NAMED_CATEGORIES: Partial<Record<EndpointKey, string>> = {
  [ENDPOINTS.POIS]: "POIS",
  [ENDPOINTS.BPKLIMASTANDORTE]: "Klimastandorte",
  [ENDPOINTS.KITAS]: "Kitas",
  [ENDPOINTS.BEZIRKE]: "Bezirke",
  [ENDPOINTS.QUARTIERE]: "Quartiere",
} as const;

// add default endpoints here
export const DEFAULT_GAZ_SOURCES: EndpointKey[] = [
  ENDPOINTS.ADRESSEN,
  ENDPOINTS.BEZIRKE,
  ENDPOINTS.QUARTIERE,
  ENDPOINTS.POIS,
  ENDPOINTS.KITAS,
  // ENDPOINT.VORHABEN,
];

export const DEFAULT_HOST = import.meta.env.VITE_WUPP_ASSET_BASEURL;
export const DEFAULT_PROJ = "3857";
export const DEFAULT_NRW_PROJ = "25832";

const AREA_ENDPOINTS: EndpointKey[] = [ENDPOINTS.BEZIRKE, ENDPOINTS.QUARTIERE];

export const isAreaType = (endpoint: EndpointKey) => {
  return AREA_ENDPOINTS.includes(endpoint);
};

const AREA_ENDPOINTS_GEP: EndpointKey[] = [
  ENDPOINTS.BEZIRKE,
  ENDPOINTS.QUARTIERE,
  ENDPOINTS.GEPS,
  ENDPOINTS.GEPS_REVERSE,
];

const DEFAULT_GAZ_PROJ = "25832";

export const isAreaTypeWithGEP = (endpoint: EndpointKey) => {
  return AREA_ENDPOINTS_GEP.includes(endpoint);
};

export const createGazEndpointUri = (
  endpoint: EndpointKey,
  { crs, host }: EndpointOptions
) => {
  if (crs === "" || crs === DEFAULT_GAZ_PROJ) {
    return `${host}/data/${endpoint}.json`;
  } else {
    return `${host}/data/${crs}/${endpoint}.json`;
  }
};

export const createGazEndpointUriWithoutCRS = (
  endpoint: EndpointKey,
  { crs, host }: EndpointOptions
) => {
  if (crs !== "") {
    return `${host}/data/${endpoint}.json`;
  }
  return `${host}/data/${crs}/${endpoint}.json`;
};

export const gazDataPrefix = "GazDataDefault";

export const createConfig = (
  endpoint: EndpointKey,
  options: EndpointOptions
) => ({
  topic: endpoint,
  url: createGazEndpointUri(endpoint, options),
  crs: options.crs,
});

export const createConfigWithoutCRS = (
  endpoint: EndpointKey,
  options: EndpointOptions
) => ({
  topic: endpoint,
  url: createGazEndpointUriWithoutCRS(endpoint, options),
  crs: options.crs,
});

export const defaultGazDataConfig = {
  crs: DEFAULT_PROJ,
  sources: DEFAULT_GAZ_SOURCES.map((endpoint: EndpointKey) => {
    return createConfig(endpoint, { crs: DEFAULT_PROJ, host: DEFAULT_HOST });
  }),
  prefix: gazDataPrefix,
};

export const isEndpoint = (value: string): value is EndpointKey => {
  return Object.values(ENDPOINTS).includes(value as EndpointKey);
};

export default ENDPOINTS;
