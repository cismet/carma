type EndpointOptions = {
  crs: string;
  host: string;
};

export enum ENDPOINT {
  ADRESSEN = "adressen",
  AENDERUNGSV = "aenderungsv",
  BEZIRKE = "bezirke",
  BPKLIMASTANDORTE = "bpklimastandorte",
  BPLAENE = "bplaene",
  EBIKES = "ebikes",
  EMOB = "emob",
  GEPS = "geps",
  GEPS_REVERSE = "geps_reverse",
  KITAS = "kitas",
  PRBR = "prbr",
  NO2 = "no2",
  QUARTIERE = "quartiere",
  POIS = "pois",
}

export type NamedCategory = Record<ENDPOINT, string>;

export const NAMED_CATEGORIES: Partial<NamedCategory> = Object.freeze({
  [ENDPOINT.POIS]: "POIS",
  [ENDPOINT.BPKLIMASTANDORTE]: "Klimastandorte",
  [ENDPOINT.KITAS]: "Kitas",
  [ENDPOINT.BEZIRKE]: "Bezirke",
  [ENDPOINT.QUARTIERE]: "Quartiere",
  [ENDPOINT.ADRESSEN]: "Adressen",
  // todo to be confirmed
  /*
    aenderungsv: "Änderungsverfahren",
    bplaene: "Bebauungs-Pläne",
    emob: "Elektromobilität",
    ebikes: "E-Bikes",
    geps: "GEPS",
    geps_reverse: "GEPS",
    prbr: "PR BR",
    no2: "NO2",
    */
});

// add default endpoints here
export const DEFAULT_GAZ_SOURCES: ENDPOINT[] = [
  ENDPOINT.ADRESSEN,
  ENDPOINT.BEZIRKE,
  ENDPOINT.QUARTIERE,
  ENDPOINT.POIS,
  ENDPOINT.KITAS,
];

export const DEFAULT_HOST = "https://wupp-topicmaps-data.cismet.de";
export const DEFAULT_PROJ = "3857";
export const DEFAULT_NRW_PROJ = "25832";

const AREA_ENDPOINTS = [ENDPOINT.BEZIRKE, ENDPOINT.QUARTIERE];

export const isAreaType = (endpoint: ENDPOINT) => {
  return AREA_ENDPOINTS.includes(endpoint);
};

export const createGazEndpointUri = (
  endpoint: ENDPOINT,
  { crs, host }: EndpointOptions
) => {
  return `${host}/data/${crs}/${endpoint}.json`;
};

export const gazDataPrefix = "GazDataDefault";

export const createConfig = (endpoint: ENDPOINT, options: EndpointOptions) => ({
  topic: endpoint,
  url: createGazEndpointUri(endpoint, options),
  crs: options.crs,
});

export const defaultGazDataConfig = {
  crs: DEFAULT_PROJ,
  sources: DEFAULT_GAZ_SOURCES.map((endpoint) => {
    return createConfig(endpoint, { crs: DEFAULT_PROJ, host: DEFAULT_HOST });
  }),
  prefix: gazDataPrefix,
};

export const isEndpoint = (value: string): value is ENDPOINT => {
  return Object.values(ENDPOINT).includes(value as ENDPOINT);
};

export default ENDPOINT;
