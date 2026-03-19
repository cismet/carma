import type { LayerSpecification } from "maplibre-gl";

/**
 * Small status-indicator overlay layers for AP mode.
 * These render on top of the native Fachobjekte vector tile layers
 * to show Protokoll status as small colored dots (points) or thin
 * colored lines (Leitungen).
 *
 * Source: "ap-features-source" (GeoJSON from buildApGeoJson).
 */

const AP_SOURCE = "ap-features-source";

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

const selectedStatusColor = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  "#2563EB",
  statusColor,
] as unknown as string;

// Small dot radius: 4 at low zoom, 6 at high zoom, larger when selected
const dotRadius = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  9,
  [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    3,
    16,
    5,
    20,
    8,
  ],
] as unknown as number;

// Offset the dot slightly up-right so it doesn't cover the icon center
const dotOffset = [0, -8] as [number, number];

const selectedDotOffset = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  ["literal", [0, -10]],
  ["literal", dotOffset],
] as unknown as [number, number];

export const apStatusOverlayLayers: LayerSpecification[] = [
  // White border line beneath status line for contrast
  {
    id: "ap-status-line-border",
    type: "line",
    source: AP_SOURCE,
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": "#ffffff",
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        7,
        5,
      ] as unknown as number,
      "line-opacity": 0.8,
    },
  },
  // Thin colored line for Leitungen
  {
    id: "ap-status-line",
    type: "line",
    source: AP_SOURCE,
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": selectedStatusColor,
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        5,
        3,
      ] as unknown as number,
      "line-opacity": 0.7,
    },
  },
  // Small colored circle for point features
  {
    id: "ap-status-dot",
    type: "circle",
    source: AP_SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": dotRadius,
      "circle-color": selectedStatusColor,
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2.5,
        1.5,
      ] as unknown as number,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.85,
      "circle-translate": selectedDotOffset,
    },
  },
];
