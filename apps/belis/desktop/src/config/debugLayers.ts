import type { LayerSpecification } from "maplibre-gl";

/**
 * AP feature layer definitions for Arbeitsaufträge mode.
 * Colors reflect protokoll status; white stroke for visibility on any background.
 * source/source-layer are placeholders, overridden at runtime.
 */

const statusColor = [
  "match",
  ["get", "status"],
  "offen",
  "#F59E0B",
  "in_bearbeitung",
  "#3B82F6",
  "erledigt",
  "#10B981",
  "fehlmeldung",
  "#EF4444",
  "#9CA3AF",
] as unknown as string;

export const debugLayers: LayerSpecification[] = [
  {
    id: "leitungen",
    type: "line",
    source: "belis-source",
    "source-layer": "leitungen",
    paint: {
      "line-color": statusColor,
      "line-width": 3,
    },
  },
  {
    id: "leuchten",
    type: "circle",
    source: "belis-source",
    "source-layer": "leuchten",
    paint: {
      "circle-radius": 7,
      "circle-color": statusColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  },
  {
    id: "mast",
    type: "circle",
    source: "belis-source",
    "source-layer": "mast",
    paint: {
      "circle-radius": 7,
      "circle-color": statusColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  },
  {
    id: "abzweigdosen",
    type: "circle",
    source: "belis-source",
    "source-layer": "abzweigdosen",
    paint: {
      "circle-radius": 7,
      "circle-color": statusColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  },
  {
    id: "mauerlaschen",
    type: "circle",
    source: "belis-source",
    "source-layer": "mauerlaschen",
    paint: {
      "circle-radius": 7,
      "circle-color": statusColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  },
  {
    id: "schaltstelle",
    type: "circle",
    source: "belis-source",
    "source-layer": "schaltstelle",
    paint: {
      "circle-radius": 7,
      "circle-color": statusColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  },
];
