import { isNaN } from "lodash";

import type { FeatureInfoProperties } from "@carma/types";
import { extractCarmaConfig } from "@carma-commons/utils";
import envelope from "@turf/envelope";
import L from "leaflet";
import { sandboxedEvalExternal } from "../components/SandboxedEvalProvider";

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

export const getFunctionRegex = () => {
  return /(function\s*\([^)]*\)\s*\{[^}]*\})|(\([^)]*\)\s*=>\s*[^}]*)/g;
};

export const parseHeader = async (
  header: string,
  properties?: FeatureInfoProperties
) => {
  if (!header) return "";

  if (getFunctionRegex().test(header)) {
    try {
      const result = await sandboxedEvalExternal(
        "(" + header + ")",
        properties
      );
      return (result as any).toString();
    } catch (error) {
      console.error("Error parsing header function:", error);
      return header;
    }
  }

  return header;
};
