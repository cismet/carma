#!/usr/bin/env node
/**
 * Reproducible OSM snapshot capture for Wuppertal transit/urban corridors.
 * Run from repository root; writes GeoJSON snapshots beside this script.
 * Source: OpenStreetMap contributors, ODbL 1.0.
 */
import { writeFile } from "node:fs/promises";

const endpoint = "https://overpass-api.de/api/interpreter";
const bbox = "51.20,7.05,51.32,7.25";
const query = `[out:json][timeout:120];(
  way[railway=monorail](${bbox});
  way[highway=primary][ref~"(^|;)B ?7($|;)"](${bbox});
);out tags geom;`;

const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
  signal: AbortSignal.timeout(45000),
  headers: {
    accept: "application/json",
    "user-agent": "carma-wuppertal-corridor-capture/1.0",
  },
});
if (!response.ok) throw new Error(`Overpass ${response.status}`);
const payload = await response.json();
const features = payload.elements.map((element) => ({
  type: "Feature",
  properties: { osmWayId: element.id, ...(element.tags ?? {}) },
  geometry: {
    type: "LineString",
    coordinates: (element.geometry ?? []).map(({ lon, lat }) => [lon, lat]),
  },
}));
const output = {
  type: "FeatureCollection",
  properties: {
    source: endpoint,
    query,
    capturedAt: new Date().toISOString(),
    // ODbL requires the attribution to travel with the data, so keep the
    // machine-readable notice Overpass returns rather than dropping it.
    license: "ODbL 1.0",
    attribution: payload.osm3s?.copyright ?? "© OpenStreetMap contributors",
  },
  features,
};
await writeFile(
  new URL("./wuppertal-corridors-osm.geojson", import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`
);
console.log(
  `Captured ${features.length} ways to wuppertal-corridors-osm.geojson`
);

const waterQuery =
  "[out:json][timeout:40];(way[natural=water][water=river](51.23,7.09,51.28,7.225);way[waterway=riverbank](51.23,7.09,51.28,7.225);relation[natural=water][water=river](51.23,7.09,51.28,7.225););out geom;";
const waterResponse = await fetch(
  `${endpoint}?data=${encodeURIComponent(waterQuery)}`,
  {
    signal: AbortSignal.timeout(50000),
    headers: {
      accept: "application/json",
      "user-agent": "carma-wuppertal-corridor-capture/1.0",
    },
  }
);
if (!waterResponse.ok)
  throw new Error(`Overpass water ${waterResponse.status}`);
await writeFile(
  new URL("./wuppertal-water-osm.json", import.meta.url),
  JSON.stringify({
    endpoint,
    query: waterQuery,
    payload: await waterResponse.json(),
  })
);
