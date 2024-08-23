import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

// TODO find place for common endpoint logic in carma monorepo
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

const buildHostUri = (host: string, endpoint: ENDPOINT, crs: string) => {
  return `${host}/data/${crs}/${endpoint}.json`;
};

export const getGazData = async (
  host: string,
  {
    crs = "3857",
    prefix = "GazData",
    endpoints = [
      ENDPOINT.ADRESSEN,
      ENDPOINT.BEZIRKE,
      ENDPOINT.QUARTIERE,
      ENDPOINT.POIS,
      ENDPOINT.KITAS,
    ],
  }: {
    crs?: string;
    prefix?: string;
    endpoints?: ENDPOINT[];
  } = {},
) => {
  const sources: Record<ENDPOINT, string> = Object.fromEntries(
    await Promise.all(
      endpoints.map(async (endpoint) => [
        endpoint,
        await md5FetchText(prefix, buildHostUri(host, endpoint, crs)),
      ]),
    ),
  );
  return getGazDataForTopicIds(sources, endpoints);
};

export function cn(...inputs: string[]) {
  return twMerge(clsx(inputs));
}

export const parseDescription = (description: string) => {
  const result = { inhalt: "", sichtbarkeit: "", nutzung: "" };
  const keywords = ["Inhalt:", "Sichtbarkeit:", "Nutzung:"];

  if (!description) {
    return result;
  }

  function extractTextAfterKeyword(input: string, keyword: string) {
    const index = input.indexOf(keyword);
    if (index !== -1) {
      const startIndex = index + keyword.length;
      let endIndex = input.length;
      for (const nextKeyword of keywords) {
        const nextIndex = input.indexOf(nextKeyword, startIndex);
        if (nextIndex !== -1 && nextIndex < endIndex) {
          endIndex = nextIndex;
        }
      }
      return input.slice(startIndex, endIndex).trim();
    }
    return "";
  }

  result.inhalt = extractTextAfterKeyword(description, "Inhalt:");
  result.sichtbarkeit = extractTextAfterKeyword(description, "Sichtbarkeit:");
  result.nutzung = extractTextAfterKeyword(description, "Nutzung:");

  return result;
};

export function paramsToObject(entries: URLSearchParams) {
  const result: { [key: string]: string } = {};
  for (const [key, value] of entries) {
    // each 'entry' is a [key, value] tupple
    result[key] = value;
  }
  return result;
}
