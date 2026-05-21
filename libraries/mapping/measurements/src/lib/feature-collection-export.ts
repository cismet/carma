import area from "@turf/area";
import length from "@turf/length";
import { COLORS_HEX } from "@carma-commons/utils";
import type { MeasurementLayerInfoOverrides } from "@carma-commons/measurements";
import type { Feature, Polygon, LineString, Point, Position } from "geojson";

import { formatAreaSquareMeters, formatMeters } from "./labels";

type LabelFeature = {
  type: "Feature";
  id: number | string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { kind: "label"; label: string };
};

function midpoint(a: Position, b: Position): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function segmentLengthMeters(a: Position, b: Position): number {
  return length(
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [a, b] },
      properties: {},
    },
    { units: "meters" }
  );
}

function lineLengthMeters(coords: Position[]): number {
  if (coords.length < 2) {
    return 0;
  }
  return length(
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    },
    { units: "meters" }
  );
}

function polygonRingLengthMeters(ring: Position[]): number {
  if (!ring || ring.length < 2) {
    return 0;
  }
  let meters = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    meters += segmentLengthMeters(ring[i], ring[i + 1]);
  }
  return meters;
}

export function buildFeatureTitle(order: number, isPolygon: boolean): string {
  return `${isPolygon ? "Fläche" : "Linienzug"} #${order}`;
}

export function buildLineSubtitle(coords: Position[]): string {
  const meters = lineLengthMeters(coords);
  if (meters <= 0) {
    return "";
  }
  return `Strecke: ${formatMeters(meters)}`;
}

export function buildPolygonSubtitle(polygon: Feature<Polygon>): string {
  const ring = polygon.geometry.coordinates[0] ?? [];
  const perimeterMeters = polygonRingLengthMeters(ring);
  const areaSquareMeters = area(polygon);
  const parts: string[] = [];
  if (perimeterMeters > 0) {
    parts.push(`Umfang: ${formatMeters(perimeterMeters)}`);
  }
  if (areaSquareMeters > 0) {
    parts.push(`Fläche: ${formatAreaSquareMeters(areaSquareMeters)}`);
  }
  return parts.join(" | ");
}

function buildLineLabels(
  id: number | string,
  coords: Position[]
): LabelFeature[] {
  const labels: LabelFeature[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const meters = segmentLengthMeters(coords[i], coords[i + 1]);
    if (meters <= 0) {
      continue;
    }
    labels.push({
      type: "Feature",
      id,
      geometry: {
        type: "Point",
        coordinates: midpoint(coords[i], coords[i + 1]),
      },
      properties: { kind: "label", label: formatMeters(meters) },
    });
  }
  return labels;
}

function buildPolygonLabels(
  id: number | string,
  polygon: Feature<Polygon>
): LabelFeature[] {
  const labels: LabelFeature[] = [];
  const ring = polygon.geometry.coordinates[0] ?? [];
  for (let i = 0; i < ring.length - 1; i++) {
    const meters = segmentLengthMeters(ring[i], ring[i + 1]);
    if (meters <= 0) {
      continue;
    }
    labels.push({
      type: "Feature",
      id,
      geometry: { type: "Point", coordinates: midpoint(ring[i], ring[i + 1]) },
      properties: { kind: "label", label: formatMeters(meters) },
    });
  }
  if (ring.length >= 4) {
    const polyArea = area(polygon);
    if (polyArea > 0) {
      // Centroid via average of unique vertices is good enough for label
      // anchoring; turf/centroid would introduce another dep for no win.
      let sx = 0;
      let sy = 0;
      const unique = ring.length - 1;
      for (let i = 0; i < unique; i++) {
        sx += ring[i][0];
        sy += ring[i][1];
      }
      labels.push({
        type: "Feature",
        id,
        geometry: {
          type: "Point",
          coordinates: [sx / unique, sy / unique],
        },
        properties: { kind: "label", label: formatAreaSquareMeters(polyArea) },
      });
    }
  }
  return labels;
}

// Build the same maplibre style spec that `shapesToFeatureCollection`
// produces for the leaflet path, but from the terra-draw `Feature[]`
// snapshot used in the libreMap path. Output is shape-compatible with the
// `vectorStyle` JSON stored on saved measurement layers, so the geoportal
// can render them and export them as downloadable JSON unchanged.
export function featuresToFeatureCollection(
  features: ReadonlyArray<Feature>,
  layerInfoOverrides?: MeasurementLayerInfoOverrides
) {
  const labelFeatures: LabelFeature[] = [];

  const outFeatures = features
    .filter((f) => {
      const t = f.geometry?.type;
      return t === "LineString" || t === "Polygon" || t === "Point";
    })
    .map((feature, index) => {
      const order = index + 1;
      const id = order;

      if (feature.geometry.type === "Point") {
        const pt = feature as Feature<Point>;
        return {
          type: "Feature" as const,
          id,
          geometry: pt.geometry,
          properties: {
            info: {
              headerColor: COLORS_HEX.ACCENT_MEASUREMENTS,
              title: `Punkt #${order}`,
              subtitle: "",
              actions: [{ name: "zoomToFeature" }, {}],
            },
          },
        };
      }

      if (feature.geometry.type === "Polygon") {
        const poly = feature as Feature<Polygon>;
        labelFeatures.push(...buildPolygonLabels(id, poly));
        return {
          type: "Feature" as const,
          id,
          geometry: poly.geometry,
          properties: {
            info: {
              headerColor: COLORS_HEX.ACCENT_MEASUREMENTS,
              title: buildFeatureTitle(order, true),
              subtitle: buildPolygonSubtitle(poly),
              actions: [{ name: "zoomToFeature" }, {}],
            },
          },
        };
      }

      const line = feature as Feature<LineString>;
      labelFeatures.push(...buildLineLabels(id, line.geometry.coordinates));
      return {
        type: "Feature" as const,
        id,
        geometry: line.geometry,
        properties: {
          info: {
            headerColor: COLORS_HEX.ACCENT_MEASUREMENTS,
            title: buildFeatureTitle(order, false),
            subtitle: buildLineSubtitle(line.geometry.coordinates),
            actions: [{ name: "zoomToFeature" }, {}],
          },
        },
      };
    });

  return {
    version: 8,
    glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
    metadata: {
      carmaConf: {
        instant: true,
        layerInfo: {
          title: "Messungen",
          icon: "measurement",
          description: "",
          metaDataText: `Messungs-Steuerelemente stellen eine oder mehrere Messungsgeometrien zur Verfügung, die eine Nutzerin bzw. ein Nutzer unter einer selbst gewählten Bezeichnung abgespeichert hat. Ihre eigenen Messungen werden für Sie bis zum Löschen des Cache-Speichers Ihres Browsers im Dialog "Karteninhalte hinzufügen" unter "Objekte / Meine Messungen" festgehalten. Eine andere Nutzerin / ein anderer Nutzer kann Ihnen Messungen über einen mit der Funktion "Teilen" erzeugten Link bereitstellen. Diese Messungen sind zunächst nur über das Messungs-Steuerelement für Sie verfügbar. Benutzen Sie die Favorisieren-Funktion im Messungs-Steuerelement, um die Messungen längerfristig zu speichern. Sie sind dann auch verfügbar, wenn Sie das Geoportal nicht über den spezifischen Teilen-Link öffnen.`,
          keywords: ["carmaconf://lazyInfoBox"],
          ...layerInfoOverrides,
        },
      },
    },
    sources: {
      adhoc: {
        type: "geojson",
        data: {
          type: "FeatureCollection" as const,
          features: [...outFeatures, ...labelFeatures],
        },
      },
    },
    layers: [
      {
        id: "adhoc-polygons-fill",
        type: "fill",
        source: "adhoc",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#267bdc",
          "fill-opacity": 0.3,
        },
      },
      {
        id: "adhoc-polygons-outline",
        type: "line",
        source: "adhoc",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "line-color": "gray",
          "line-width": 2,
        },
      },
      {
        id: "adhoc-lines",
        type: "line",
        source: "adhoc",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "gray",
          "line-width": 3,
        },
      },
      {
        id: "adhoc-points",
        type: "circle",
        source: "adhoc",
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          ["!=", ["get", "kind"], "label"],
        ],
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "rgba(38, 123, 220, 0.83)",
            "gray",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      {
        id: "selection-line",
        type: "line",
        source: "adhoc",
        filter: ["==", ["geometry-type"], "LineString"],
        minzoom: 0,
        maxzoom: 24,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "rgba(38, 123, 220, 0.83)",
          "line-width": 4,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
        },
      },
      {
        id: "selection-polygon",
        type: "line",
        source: "adhoc",
        filter: ["==", ["geometry-type"], "Polygon"],
        minzoom: 0,
        maxzoom: 24,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "rgba(38, 123, 220, 0.83)",
          "line-width": 4,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
        },
      },
      {
        id: "selection-measurement-labels",
        type: "symbol",
        source: "adhoc",
        filter: ["==", ["get", "kind"], "label"],
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold"],
          "text-size": 12,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#000000",
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 2,
          "text-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
        },
      },
    ],
  };
}
