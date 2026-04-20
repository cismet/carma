import localforage from "localforage";
import { COLORS_HEX } from "@carma-commons/utils";

export const setFromLocalforage = async (
  lfKey: string,
  setter: (value: any) => void,
  fallbackValue?: any,
  forceFallback?: boolean
) => {
  try {
    const value = await localforage.getItem(lfKey);
    if (value !== undefined && value !== null) {
      setter(value);
    } else if (fallbackValue !== undefined || forceFallback === true) {
      setter(fallbackValue);
    }
  } catch (error) {
    console.warn(`Failed to load ${lfKey} from localStorage:`, error);
    if (fallbackValue !== undefined || forceFallback === true) {
      setter(fallbackValue);
    }
  }
};

export const saveToLocalforage = async (lfKey: string, value: any) => {
  try {
    await localforage.setItem(lfKey, value);
  } catch (error) {
    console.warn(`Failed to save ${lfKey} to localStorage:`, error);
  }
};

export const adjustClickPosition = (
  domEvent: MouseEvent,
  closestPoint: any,
  eventType: string,
  leafletMap: any,
  currentDrawHandler?: any
) => {
  const containerPoint = leafletMap.mouseEventToContainerPoint(domEvent);
  const shiftedContainerPoint = L.point(containerPoint.x, containerPoint.y);
  // Use closestPoint if available, otherwise use shifted click position
  if (!closestPoint) {
    return false;
  }

  const [lng, lat] = closestPoint.geometry.coordinates;
  const finalLatLng = L.latLng(lat, lng);

  // Check if we're drawing and snapped to first vertex (polygon closure)
  // ONLY trigger if the snap source is the drawing-in-progress (not external features)
  if (
    currentDrawHandler &&
    currentDrawHandler._poly &&
    currentDrawHandler._poly._latlngs
  ) {
    const latlngs = currentDrawHandler._poly._latlngs;
    if (latlngs.length >= 3) {
      const firstVertex = latlngs[0];
      const snappedCoord = closestPoint.geometry.coordinates;
      // Trigger polygon closure if snapped coordinates EXACTLY match the first vertex
      // Use very tight threshold (1e-10) to ensure it's the exact same point, not just nearby
      const exactMatchThreshold = 1e-10;
      if (
        Math.abs(snappedCoord[1] - firstVertex.lat) < exactMatchThreshold &&
        Math.abs(snappedCoord[0] - firstVertex.lng) < exactMatchThreshold
      ) {
        // Try to find and click the first vertex marker directly
        // The vertex markers are in _markers array with customHandle property
        if (
          currentDrawHandler._markers &&
          currentDrawHandler._markers.length > 0
        ) {
          const firstMarker = currentDrawHandler._markers[0];
          if (firstMarker) {
            // Fire click event on the first vertex marker, not the map
            firstMarker.fire("click", {
              latlng: firstVertex,
              target: firstMarker,
            });
            return true; // Don't fire synthetic map event
          }
        }
      }
    }
  }

  // Fire a new click event with shifted coordinates on the map
  leafletMap.fire(eventType, {
    latlng: finalLatLng,
    containerPoint: shiftedContainerPoint,
    originalEvent: domEvent,
  });

  return false;
};

export interface MeasurementShapeData {
  shapeId: number | string;
  number: number;
  shapeType: "line" | "polygon" | string;
  coordinates: [number, number][];
  distance?: string;
  area?: string;
  customTitle?: string;
}

function buildFeatureTitle(
  shape: MeasurementShapeData,
  order: number
): string {
  const label = shape.customTitle || (shape.area ? "Fläche" : "Linienzug");
  return `${label} #${order}`;
}

function buildFeatureSubtitle(shape: MeasurementShapeData): string {
  const parts: string[] = [];
  if (shape.distance) {
    parts.push(`${shape.area ? "Umfang" : "Strecke"}: ${shape.distance}`);
  }
  if (shape.area) {
    parts.push(`Fläche: ${shape.area}`);
  }
  return parts.join(" | ");
}

export function shapesToFeatureCollection(shapes: MeasurementShapeData[]) {
  const features = shapes
    .map((shape, index) => ({ shape, order: index + 1 }))
    .filter(({ shape }) => shape.shapeId !== 5555)
    .map(({ shape, order }) => {
      const geoJsonCoords = shape.coordinates.map(
        ([lat, lng]) => [lng, lat] as [number, number]
      );

      const isPolygon = shape.shapeType === "polygon";

      return {
        type: "Feature" as const,
        id: shape.shapeId,
        geometry: isPolygon
          ? {
              type: "Polygon" as const,
              coordinates: [geoJsonCoords],
            }
          : {
              type: "LineString" as const,
              coordinates: geoJsonCoords,
            },
        properties: {
          info: {
            headerColor: COLORS_HEX.ACCENT_MEASUREMENTS,
            title: buildFeatureTitle(shape, order),
            subtitle: buildFeatureSubtitle(shape),
            actions: [{ name: "zoomToFeature" }, {}],
          },
        },
      };
    });

  return {
    version: 8,
    metadata: {
      carmaConf: {
        instant: true,
        layerInfo: {
          title: "Messungen",
          icon: "measurement",
          keywords: ["carmaconf://lazyInfoBox"],
        },
      },
    },
    sources: {
      adhoc: {
        type: "geojson",
        data: {
          type: "FeatureCollection" as const,
          features,
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
          "line-color": "#267bdc",
          "line-width": 2,
        },
      },
      {
        id: "adhoc-lines",
        type: "line",
        source: "adhoc",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#267bdc",
          "line-width": 3,
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
          "line-color": "#3A7CEB",
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
          "line-color": "#3A7CEB",
          "line-width": 4,
          "line-opacity": [
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

// Prepare a Leaflet LatLng from a GeoJSON Point-like feature with coordinates [lng, lat]
export const toLatLngFromClosestPoint = (closestPoint: any) => {
  if (
    !closestPoint ||
    !closestPoint.geometry ||
    !closestPoint.geometry.coordinates
  ) {
    return null;
  }
  const [lng, lat] = closestPoint.geometry.coordinates;
  return L.latLng(lat, lng);
};
