/**
 * Feature utilities for MapLibre GL
 *
 * TODO: The eval-based functions (functionToFeature, objectToFeature) should be
 * refactored to use @carma-commons/sandbox-eval for safer code evaluation.
 */

import type maplibregl from "maplibre-gl";

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

/**
 * Convert a function string to a feature object
 * WARNING: Uses eval - should be refactored to use SandboxedEvalProvider
 */
export const functionToFeature = (output: Record<string, unknown>, code: string) => {
  try {
    // eslint-disable-next-line no-eval
    const codeFunction = eval("(" + code + ")");
    const tmpInfo = codeFunction(output);

    if (!tmpInfo) {
      return undefined;
    }

    const properties = {
      ...tmpInfo,
      wmsProps: output,
    };

    return { properties };
  } catch (error) {
    console.error("Error in functionToFeature:", error);
    return undefined;
  }
};

/**
 * Convert an object to a feature using configuration lines
 * WARNING: Uses eval - should be refactored to use SandboxedEvalProvider
 */
export const objectToFeature = (jsonOutput: Record<string, unknown> | null, code: string) => {
  if (!jsonOutput) {
    return {
      properties: {
        title: "Keine Informationen gefunden",
      },
    };
  }

  const conf = code
    .split("\n")
    .filter((line) => line.trim() !== "" && line.trim() !== "undefined");

  let functionString = `(function(p) {
                    const info = {`;

  conf.forEach((rule) => {
    functionString += `${rule.trim()},\n`;
  });

  functionString += `
                                          };
                                          return info;
                    })`;

  // eslint-disable-next-line no-eval
  const tmpInfo = eval(functionString)(jsonOutput);

  const properties = {
    ...tmpInfo,
    wmsProps: jsonOutput,
  };

  return { properties };
};

export interface FeatureInfo {
  properties: Record<string, unknown>;
  geometry: GeoJSON.Geometry;
  id?: string | number;
  showMarker?: boolean;
}

export interface LayerMappingEntry {
  iconname?: string;
  tooltip?: string;
  routeAction?: boolean;
  getRouteParams?: () => { from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
}

/**
 * Create a feature object from a selected vector feature
 */
export const createFeature = (
  selectedVectorFeature: maplibregl.MapGeoJSONFeature,
  layerMapping: string[],
  _mapInstance?: maplibregl.Map,
  useRouting?: boolean
): FeatureInfo | undefined => {
  let feature: FeatureInfo | undefined = undefined;

  let properties: Record<string, unknown> = selectedVectorFeature.properties || {};
  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  const featureInfoZoom = 20;

  layerMapping.forEach((keyword) => {
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
      ? functionToFeature(properties, result)
      : objectToFeature(properties, result);

    if (!featureProperties) {
      return undefined;
    }

    const genericLinks = (featureProperties.properties.genericLinks as LayerMappingEntry[]) || [];

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
    };
  }
  return feature;
};
