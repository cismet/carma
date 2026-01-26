/**
 * Route display utilities for MapLibre GL
 */
import maplibregl from "maplibre-gl";
import { planRoute } from "../services/motisService";

export interface DisplayRouteOptions {
  mapInstance: maplibregl.Map;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  time?: Date;
  sourceId?: string;
  lineLayerId?: string;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  fitBounds?: boolean;
  padding?: number;
}

export interface RouteLeg {
  legGeometry?: { points?: string; precision?: number };
  duration?: number;
  distance?: number;
  mode?: string;
}

export interface RouteOption {
  index: number;
  duration: number;
  distance: number;
  mode: string;
  legs: RouteLeg[];
  polyline: string;
  precision: number;
}

export interface FetchRouteOptionsParams {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  time?: Date;
}

/**
 * Decodes an encoded polyline string into an array of coordinates.
 */
export function decodePolyline(
  encoded: string,
  precision: number = 6
): [number, number][] {
  const factor = Math.pow(10, precision);
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let res = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      res |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += res & 1 ? ~(res >> 1) : res >> 1;

    shift = 0;
    res = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      res |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += res & 1 ? ~(res >> 1) : res >> 1;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

/**
 * Fetches available route options between two points without displaying them.
 * Returns an array of route options that can be presented to the user.
 */
export async function fetchRouteOptions(
  params: FetchRouteOptionsParams
): Promise<RouteOption[]> {
  const { from, to, time = new Date() } = params;

  try {
    const result = await planRoute({ from, to, time });
    const routes = (result.data as { direct?: unknown[] })?.direct || [];

    const routeOptions: RouteOption[] = [];

    routes.forEach((route: unknown, index: number) => {
      const r = route as {
        legs?: RouteLeg[];
        duration?: number;
        distance?: number;
        mode?: string;
      };
      if (!r?.legs?.[0]?.legGeometry?.points) {
        return;
      }

      const leg = r.legs[0];
      routeOptions.push({
        index,
        duration: r.duration || leg.duration || 0,
        distance: r.distance || leg.distance || 0,
        mode: r.mode || leg.mode || "CAR",
        legs: r.legs,
        polyline: leg.legGeometry!.points!,
        precision: leg.legGeometry!.precision || 6,
      });
    });

    return routeOptions;
  } catch (error) {
    console.error("Error fetching route options:", error);
    return [];
  }
}

export interface DisplaySelectedRouteOptions {
  mapInstance: maplibregl.Map;
  route: RouteOption;
  sourceId?: string;
  lineLayerId?: string;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  fitBounds?: boolean;
  padding?: number;
}

/**
 * Displays a selected route on the map.
 */
export function displaySelectedRouteOnMap(
  options: DisplaySelectedRouteOptions
): [number, number][] | null {
  const {
    mapInstance,
    route,
    sourceId = "routing-action-source",
    lineLayerId = "routing-action-line",
    lineColor = "#3b82f6",
    lineWidth = 5,
    lineOpacity = 0.8,
    fitBounds = true,
    padding = 50,
  } = options;

  try {
    const coordinates = decodePolyline(route.polyline, route.precision);

    // Clean up existing layers/sources
    if (mapInstance.getLayer(lineLayerId)) mapInstance.removeLayer(lineLayerId);
    if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId);

    mapInstance.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates },
          },
        ],
      },
    });

    mapInstance.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": lineOpacity,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });

    if (fitBounds) {
      const bounds = coordinates.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      mapInstance.fitBounds(bounds, { padding });
    }

    return coordinates;
  } catch (error) {
    console.error("Error displaying route:", error);
    return null;
  }
}

/**
 * Displays a route on the map between two points.
 * Fetches the route from the routing service, decodes the polyline, and renders it.
 */
export async function displayRouteOnMap(
  options: DisplayRouteOptions
): Promise<[number, number][] | null> {
  const {
    mapInstance,
    from,
    to,
    time = new Date(),
    sourceId = "routing-action-source",
    lineLayerId = "routing-action-line",
    lineColor = "#3b82f6",
    lineWidth = 5,
    lineOpacity = 0.8,
    fitBounds = true,
    padding = 50,
  } = options;

  try {
    const result = await planRoute({ from, to, time });

    const routes = (result.data as { direct?: unknown[] })?.direct || [];
    const route = routes[0] as {
      legs?: Array<{
        legGeometry?: { points?: string; precision?: number };
      }>;
    };

    if (!route?.legs?.[0]?.legGeometry?.points) {
      console.error("No route geometry found");
      return null;
    }

    const encoded = route.legs[0].legGeometry!.points!;
    const precision = route.legs[0].legGeometry!.precision || 6;
    const coordinates = decodePolyline(encoded, precision);

    // Clean up existing layers/sources
    if (mapInstance.getLayer(lineLayerId)) mapInstance.removeLayer(lineLayerId);
    if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId);

    mapInstance.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates },
          },
        ],
      },
    });

    mapInstance.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      filter: ["==", "$type", "LineString"],
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": lineOpacity,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });

    if (fitBounds) {
      const bounds = coordinates.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      mapInstance.fitBounds(bounds, { padding });
    }

    return coordinates;
  } catch (error) {
    console.error("Routing error:", error);
    return null;
  }
}
