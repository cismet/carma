#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const OUTPUT_FILE = resolve(
  PROJECT_ROOT,
  "src/data/georadar-road-centerlines.json"
);

// wuppertal-oelberg-georadar-2025-09-11.copc.laz header, transformed from
// EPSG:25832 to WGS84. Keep the extraction tied to the delivered artifact.
const BBOX = [7.1318586563, 51.2555352413, 7.1425448676, 51.2626900255];
const [west, south, east, north] = BBOX;
const TILEJSON_URL =
  "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/tiles/v2/bm_web_de_3857/bm_web_de_3857.json";
const SOURCE_LAYER = "Verkehrslinie";

const fetchResponse = async (url, timeoutMs = 45_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CARMA pointcloud-stories road-centerline snapshot",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const clipSegment = ([x0, y0], [x1, y1]) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const tests = [
    [-dx, x0 - west],
    [dx, east - x0],
    [-dy, y0 - south],
    [dy, north - y0],
  ];

  for (const [p, q] of tests) {
    if (p === 0 && q < 0) return null;
    if (p === 0) continue;
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }

  return [
    [x0 + t0 * dx, y0 + t0 * dy],
    [x0 + t1 * dx, y0 + t1 * dy],
  ];
};

const lngLatToTile = (lng, lat, zoom) => {
  const scale = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * scale);
  const latitude = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * scale
  );
  return [x, y];
};

const tileJson = await (await fetchResponse(TILEJSON_URL)).json();
const tileTemplate = tileJson.tiles?.[0];
if (!tileTemplate) throw new Error(`No tile template in ${TILEJSON_URL}`);
const zoom = Math.min(16, tileJson.maxzoom ?? 16);
const scheme = tileJson.scheme ?? "xyz";
const [minX, maxY] = lngLatToTile(west, south, zoom);
const [maxX, minY] = lngLatToTile(east, north, zoom);
const roads = new Map();

for (let x = minX; x <= maxX; x += 1) {
  for (let y = minY; y <= maxY; y += 1) {
    const tileY = scheme === "tms" ? 2 ** zoom - 1 - y : y;
    const url = tileTemplate
      .replace("{z}", String(zoom))
      .replace("{x}", String(x))
      .replace("{y}", String(tileY));
    const bytes = new Uint8Array(
      await (await fetchResponse(url)).arrayBuffer()
    );
    const layer = new VectorTile(new Pbf(bytes)).layers[SOURCE_LAYER];
    if (!layer) continue;

    for (let featureIndex = 0; featureIndex < layer.length; featureIndex += 1) {
      const feature = layer.feature(featureIndex).toGeoJSON(x, y, zoom);
      const name = feature.properties?.name?.trim();
      if (!name) continue;
      const lines =
        feature.geometry?.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry?.type === "MultiLineString"
          ? feature.geometry.coordinates
          : [];
      if (lines.length === 0) continue;

      const road = roads.get(name) ?? {
        classes: new Set(),
        shortNames: new Set(),
        widths: new Set(),
        segments: new Map(),
      };
      if (feature.properties.klasse) road.classes.add(feature.properties.klasse);
      if (feature.properties.name_kurz) {
        road.shortNames.add(feature.properties.name_kurz);
      }
      if (feature.properties.breite) road.widths.add(feature.properties.breite);

      for (const line of lines) {
        for (let index = 1; index < line.length; index += 1) {
          const clipped = clipSegment(line[index - 1], line[index]);
          if (!clipped) continue;
          const forward = clipped
            .flat()
            .map((value) => value.toFixed(8))
            .join(",");
          const reverse = [...clipped]
            .reverse()
            .flat()
            .map((value) => value.toFixed(8))
            .join(",");
          road.segments.set(forward < reverse ? forward : reverse, clipped);
        }
      }
      roads.set(name, road);
    }
  }
}

const features = [...roads.entries()]
  .filter(([, road]) => road.segments.size > 0)
  .sort(([nameA], [nameB]) => nameA.localeCompare(nameB, "de"))
  .map(([name, road]) => ({
    type: "Feature",
    properties: {
      name,
      shortNames: [...road.shortNames].sort(),
      classes: [...road.classes].sort(),
      widths: [...road.widths].sort((a, b) => a - b),
    },
    geometry: {
      type: "MultiLineString",
      coordinates: [...road.segments.values()],
    },
  }));

const collection = {
  type: "FeatureCollection",
  bbox: BBOX,
  metadata: {
    source: "basemap.de Web Vektor",
    sourceTileJson: TILEJSON_URL,
    sourceLayer: SOURCE_LAYER,
    sourceZoom: zoom,
    attribution: tileJson.attribution ?? "",
    generatedAt: new Date().toISOString(),
  },
  features,
};

await mkdir(dirname(OUTPUT_FILE), { recursive: true });
await writeFile(OUTPUT_FILE, `${JSON.stringify(collection, null, 2)}\n`);
console.log(
  `Wrote ${features.length} named basemap.de roads to ${OUTPUT_FILE}`
);
