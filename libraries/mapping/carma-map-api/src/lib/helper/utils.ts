import { extractCarmaConfig } from "@carma-commons/utils";
import type { Item, Layer } from "@carma/types";

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

const parseZoom = (
  vectorStyles: {
    id: string;
    maxzoom: number;
    minzoom: number;
  }[],
  sourceZoom: {
    minzoom: number;
    maxzoom: number;
  }
) => {
  let maxzoom = sourceZoom.maxzoom;
  let minzoom = sourceZoom.minzoom;

  if (vectorStyles.length > 0) {
    const maxzoomVector = vectorStyles.reduce((acc, cur) => {
      if (cur.maxzoom > acc) {
        return cur.maxzoom;
      }
      return acc;
    }, 0);
    const minzoomVector = vectorStyles.reduce((acc, cur) => {
      if (cur.minzoom < acc) {
        return cur.minzoom;
      }
      return acc;
    }, 24);

    maxzoom = Math.max(maxzoom, maxzoomVector);
    minzoom = Math.max(minzoom, minzoomVector);
  }

  return { maxzoom, minzoom };
};
