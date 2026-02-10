/**
 * Feature utilities for MapLibre GL
 */

import type maplibregl from "maplibre-gl";
import { functionToFeature, objectToFeature } from "@carma-mapping/utils";

/**
 * Get coordinates from a GeoJSON geometry
 */
export const getCoordinates = (geometry: GeoJSON.Geometry): number[] => {
  switch (geometry.type) {
    case "Polygon":
      return (geometry as GeoJSON.Polygon).coordinates[0][0];
    case "MultiPolygon":
      return (geometry as GeoJSON.MultiPolygon).coordinates[0][0][0];
    case "LineString":
      return (geometry as GeoJSON.LineString).coordinates[1];
    case "Point":
      return (geometry as GeoJSON.Point).coordinates;
    case "MultiPoint":
      return (geometry as GeoJSON.MultiPoint).coordinates[0];
    case "MultiLineString":
      return (geometry as GeoJSON.MultiLineString).coordinates[0][0];
    default:
      // GeometryCollection - return empty array as fallback
      return [];
  }
};

/**
 * Truncate a string to a maximum length with ellipsis
 */
export const truncateString = (text: string, num: number): string => {
  if (text.length > num) {
    return text.slice(0, num) + "...";
  }
  return text;
};

export interface FeatureInfo {
  properties: Record<string, unknown>;
  geometry: GeoJSON.Geometry;
  id?: string | number;
  showMarker?: boolean;
  targetProperties?: Record<string, unknown>;
  carmaInfo?: Record<string, unknown>;
}

export interface LayerMappingEntry {
  iconname?: string;
  tooltip?: string;
  action?: () => void;
  routeAction?: boolean;
  getRouteParams?: () => {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  } | null;
}

/**
 * Create a feature object from a selected vector feature
 */
export const createFeature = async (
  selectedVectorFeature: maplibregl.MapGeoJSONFeature,
  layerMapping: string[],
  _mapInstance?: maplibregl.Map,
  useRouting?: boolean,
  onOpenDatasheet?: () => void
): Promise<FeatureInfo | undefined> => {
  let feature: FeatureInfo | undefined = undefined;

  let properties: Record<string, unknown> =
    selectedVectorFeature.properties || {};

  // Build carmaInfo: spread full carmaConf from layer metadata (for infoboxMapping etc.)
  // then add source identifiers. This matches the original react-cismap behavior.
  const layerMetadata = selectedVectorFeature.layer?.metadata as
    | Record<string, unknown>
    | undefined;
  const carmaConf = (layerMetadata?.carmaConf as Record<string, unknown>) || {};

  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
    carmaInfo: {
      ...carmaConf,
      sourceLayer: selectedVectorFeature.sourceLayer,
      source: selectedVectorFeature.source,
      layerId: selectedVectorFeature.layer?.id,
    },
  };
  let result = "";
  const featureInfoZoom = 20;

  layerMapping.forEach((keyword) => {
    // Skip known control flags (not part of the infobox mapping template)
    if (keyword.startsWith("openDatasheet:")) {
      return;
    }
    result += keyword + "\n";
  });

  if (result) {
    if (result.includes("function")) {
      // remove every line that is not a function
      result = result
        .split("\n")
        .filter((line) => line.includes("function"))
        .join("\n");
    }

    const featureProperties = result.includes("function")
      ? await functionToFeature(properties, result)
      : await objectToFeature(properties, result);

    if (!featureProperties) {
      return undefined;
    }

    const genericLinks =
      (featureProperties.properties.genericLinks as LayerMappingEntry[]) || [];

    if (useRouting) {
      genericLinks.unshift({
        iconname: "car",
        tooltip: "Route berechnen",
        routeAction: true,
        getRouteParams: () => {
          // Get endpoint coordinates from feature geometry
          const geometry = selectedVectorFeature.geometry;
          let endLat: number, endLng: number;

          if (geometry.type === "Point") {
            [endLng, endLat] = geometry.coordinates as [number, number];
          } else if (
            geometry.type === "Polygon" ||
            geometry.type === "MultiPolygon"
          ) {
            // Use centroid for polygons (simplified: use first coordinate)
            const coords =
              geometry.type === "Polygon"
                ? (geometry as GeoJSON.Polygon).coordinates[0][0]
                : (geometry as GeoJSON.MultiPolygon).coordinates[0][0][0];
            [endLng, endLat] = coords as [number, number];
          } else {
            return null;
          }

          // TODO: Get start location from user's current location or config
          const startLat = 51.2725699;
          const startLng = 7.199918;

          return {
            from: { lat: startLat, lng: startLng },
            to: { lat: endLat, lng: endLng },
          };
        },
      });
    }

    if (onOpenDatasheet && featureProperties.properties.datasheet) {
      genericLinks.push({
        iconname: "info",
        tooltip: "Datenblatt",
        action: onOpenDatasheet,
      });
    }

    // Preserve targetProperties and carmaInfo at TOP level of feature
    // (AlkisSIM.tsx expects feature.targetProperties, not feature.properties.targetProperties)
    const targetProperties = properties.targetProperties as
      | Record<string, unknown>
      | undefined;
    const carmaInfo = properties.carmaInfo as
      | Record<string, unknown>
      | undefined;

    feature = {
      properties: {
        ...featureProperties.properties,
        genericLinks: [...genericLinks],
        zoom: featureInfoZoom,
      },
      geometry: selectedVectorFeature.geometry,
      id: selectedVectorFeature.id,
      showMarker:
        selectedVectorFeature.geometry.type === "Polygon" ||
        selectedVectorFeature.geometry.type === "MultiPolygon",
      targetProperties,
      carmaInfo,
    };
  }
  return feature;
};
