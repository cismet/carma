import type { LayerSpecification } from "maplibre-gl";

/**
 * AP feature layer definitions for Arbeitsaufträge mode.
 * Colors reflect protokoll status; white stroke for visibility on any background.
 * Selected features (via feature-state) get enlarged with a blue stroke.
 * source/source-layer are placeholders, overridden at runtime.
 */

/** Simple infobox mapping for AA features (object-style) */
export const aaInfoboxMapping: string[] = [
  "header: 'Arbeitsauftrag mit ' + p.total_protokolle + ' Protokollen'",
  "title: 'AA-' + p.nummer",
  "headerColor: '#c30000'",
  "subtitle: (p.angelegt_von || '') + (p.angelegt_am ? ' · ' + p.angelegt_am : '')",
  "additionalInfo: (p.team ? 'Team: ' + p.team : '')",
  "datasheet: true",
];

/** Simple infobox mapping for AP features (object-style) */
export const apInfoboxMapping: string[] = [
  "header: 'Arbeitsprotokoll'",
  "title: '#' + p.protokollnummer + ' - ' + p.shortname",
  "headerColor: p.headerColor",
  "subtitle: p.datum || ''",
  "additionalInfo: p.veranlassung || ''",
  "datasheet: true",
];

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

const circleRadius = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  11,
  7,
] as unknown as number;

const strokeColor = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  "#2563EB",
  "#ffffff",
] as unknown as string;

const strokeWidth = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  3,
  2,
] as unknown as number;

const lineWidth = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  5,
  3,
] as unknown as number;

const circlePaint = {
  "circle-radius": circleRadius,
  "circle-color": statusColor,
  "circle-stroke-width": strokeWidth,
  "circle-stroke-color": strokeColor,
};

export const debugLayers: LayerSpecification[] = [
  {
    id: "leitungen",
    type: "line",
    source: "belis-source",
    "source-layer": "leitungen",
    paint: {
      "line-color": statusColor,
      "line-width": lineWidth,
    },
  },
  {
    id: "leuchten",
    type: "circle",
    source: "belis-source",
    "source-layer": "leuchten",
    paint: circlePaint,
  },
  {
    id: "mast",
    type: "circle",
    source: "belis-source",
    "source-layer": "mast",
    paint: circlePaint,
  },
  {
    id: "abzweigdosen",
    type: "circle",
    source: "belis-source",
    "source-layer": "abzweigdosen",
    paint: circlePaint,
  },
  {
    id: "mauerlaschen",
    type: "circle",
    source: "belis-source",
    "source-layer": "mauerlaschen",
    paint: circlePaint,
  },
  {
    id: "schaltstelle",
    type: "circle",
    source: "belis-source",
    "source-layer": "schaltstelle",
    paint: circlePaint,
  },
];
