import ENDPOINT, { DEFAULT_GAZ_SOURCES } from "./endpoints";

export const host = "https://wupp-topicmaps-data.cismet.de";
export const DEFAULT_PROJ = "3857";
export const DEFAULT_SRC_PROJ = "25832";

const createUrl = (endpoint: ENDPOINT, crs: string = DEFAULT_PROJ) =>
  `${host}/data/${crs}/${endpoint}.json`;

export const gazDataPrefix = "GazDataForStories";

const createConfig = (endpoint: ENDPOINT, crs = DEFAULT_PROJ) => ({
  topic: endpoint,
  url: createUrl(endpoint, crs),
  crs,
});

export const sourcesConfig = DEFAULT_GAZ_SOURCES.map((endpoint) =>
  createConfig(endpoint),
);

export const isEndpoint = (value: string): value is ENDPOINT => {
  return Object.values(ENDPOINT).includes(value as ENDPOINT);
};
