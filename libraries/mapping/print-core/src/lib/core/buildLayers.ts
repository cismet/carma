// Translate layer descriptors into MapFish layer specs. Pure data, no engine.

import type { MapFishLayer } from "./types";

/**
 * Derive the tgl4printing style key from a vector style URL.
 * /poi/style.json            -> poi-style
 * /poi/bildung.style.json    -> poi-bildung-style
 * Returns null for local (non-http) styles, which cannot be printed.
 */
export function getStyleName(vectorStyle: string): string | null {
  if (!vectorStyle) {
    throw new Error("vectorStyle is undefined or null.");
  }
  if (!/^https?:\/\//.test(vectorStyle)) {
    return null;
  }

  const parts = vectorStyle.replace("https://", "").split("/");
  const folderName = parts[parts.length - 2];
  const fileName = parts[parts.length - 1].split(".").slice(0, -1).join(".");

  let styleKey =
    fileName === "style" ? `${folderName}-style` : `${folderName}-${fileName}`;

  return styleKey.replace(/[^a-zA-Z0-9-]/g, "-");
}

export const buildWMSPrint = (
  baseURL: string,
  name: string,
  opacity = 1
): MapFishLayer => ({
  imageFormat: "image/png",
  baseURL,
  customParams: {
    EXCEPTIONS: "INIMAGE",
    TRANSPARENT: "true",
  },
  layers: [name],
  type: "WMS",
  opacity,
  failOnError: true,
});

export const buildVectorStylePrint = (
  vectorLayerName: string,
  opacity = 1,
  scalefactor = 1,
  sizefactor = 1
): MapFishLayer =>
  buildWMSPrint(
    `https://tsgl4printing-wms.cismet.de/tgl-wms/${scalefactor}x/${sizefactor}/`,
    vectorLayerName,
    opacity
  );

/**
 * Print a complete, self-contained MapLibre style (data inlined as a geojson
 * source) via the tgl-wms "inline" renderer. Instead of naming a hosted style,
 * the whole style is POSTed in customParams.style and `layers:["inline"]` tells
 * the renderer to use it verbatim — so nothing is fetched at render time.
 */
export const buildInlineStylePrint = (
  style: Record<string, unknown>,
  opacity = 1,
  scalefactor = 2,
  sizefactor = 1
): MapFishLayer => ({
  imageFormat: "image/png",
  baseURL: `https://tsgl4printing-wms.cismet.de/tgl-wms/${scalefactor}x/${sizefactor}/`,
  method: "POST",
  customParams: { style },
  layers: ["inline"],
  type: "WMS",
  opacity,
  failOnError: true,
});

export const buildOSMPrint = (baseURL: string): MapFishLayer => ({
  baseURL,
  type: "OSM",
  imageExtension: "png",
  tileMatrixSet: "zxy",
});

export const buildTilesPrint = (url: string, opacity = 1): MapFishLayer => {
  let baseURL = url.replace("{z}", "{TileMatrix}");
  baseURL = baseURL.replace("{x}", "{TileCol}");
  baseURL = baseURL.replace("{y}", "{TileRow}");

  return {
    baseURL,
    type: "WMTS",
    layer: "--can-be-ignored-since-it-is-already-in-the-baseURL--",
    style: "default",
    imageFormat: "image/png",
    opacity,
    matrixSet: "webmercator_hq",
    matrices: WEBMERCATOR_HQ_MATRICES,
  } as MapFishLayer;
};

// identifier "00".."20"; level 00 = 1x1 tiles at 512px. Each level halves the
// scale denominator and doubles the matrix size. Matches the original literal table.
const WEBMERCATOR_HQ_BASE_SCALE = 279541132.0143588;
const WEBMERCATOR_HQ_MATRICES = Array.from({ length: 21 }, (_, z) => ({
  identifier: String(z).padStart(2, "0"),
  scaleDenominator: WEBMERCATOR_HQ_BASE_SCALE / 2 ** z,
  tileSize: [512, 512],
  topLeftCorner: [-20037508.342789244, 20037508.342789244],
  matrixSize: [2 ** z, 2 ** z],
}));
