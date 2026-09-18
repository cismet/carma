// Reproduce the preset from the captured basemap water surface, not a rail offset.
// Run: node <this-file> [source-water-geojson]; emits the derived bank GeoJSON.
import { readFileSync } from "node:fs";

const source = JSON.parse(
  readFileSync(
    process.argv[2] ??
      new URL("./wupper-barmen-water-surface.geojson", import.meta.url),
    "utf8"
  )
);
if (
  source.geometry.type !== "Polygon" ||
  source.geometry.coordinates.length !== 1
)
  throw new Error("Expected one connected water surface without holes");
const ring = source.geometry.coordinates[0].slice(0, -1);
const west = Math.min(...ring.map((point) => point[0]));
const east = Math.max(...ring.map((point) => point[0]));
const northernEnd = (longitude) =>
  ring.reduce(
    (chosen, point, index) =>
      Math.abs(point[0] - longitude) < 1e-10 &&
      (chosen < 0 || point[1] > ring[chosen][1])
        ? index
        : chosen,
    -1
  );
const start = northernEnd(west);
const end = northernEnd(east);
const arc = (step) => {
  const path = [];
  for (
    let index = start;
    ;
    index = (index + step + ring.length) % ring.length
  ) {
    path.push(ring[index]);
    if (index === end) return path;
  }
};
// Closed water ring yields two arcs. The northern arc has the greater
// longitude-weighted latitude; no sorting of shoreline vertices or offsetting.
const score = (path) =>
  path.slice(1).reduce((sum, b, index) => {
    const a = path[index];
    return sum + ((b[0] - a[0]) * (a[1] + b[1])) / 2;
  }, 0);
const forward = arc(1);
const backward = arc(-1);
const coordinates = score(forward) > score(backward) ? forward : backward;
console.log(
  JSON.stringify(
    {
      type: "Feature",
      properties: {
        name: "Wupper north bank, Barmen",
        source: source.properties.source,
        sourceLayer: "Gewaesserflaeche",
        sourceFilter: "name=Wupper; kennung=2736000000000000000",
        captured: source.properties.captured,
        attribution: source.properties.attribution,
        derivation:
          "Northern boundary arc of the unioned/clipped water polygons. Source vertices retained; no Schwebebahn offset. Heights are not part of this 2D source.",
      },
      geometry: { type: "LineString", coordinates },
    },
    null,
    2
  )
);
