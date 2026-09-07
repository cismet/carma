/**
 * The DOM and geometry of the "you are here" display: the dot with its
 * heading arrow, and the accuracy circle around it.
 */

import type { Marker } from "maplibre-gl";

const LOCATE_COLOR = "#4285f4";

export interface LocateMarkerElement {
  /** the element to hand to the maplibre marker */
  element: HTMLElement;
  /**
   * Show the arrow pointing to `heading` (degrees from north), or hide it for
   * null. Needs the marker once it exists, because the whole marker is turned
   * and maplibre owns its transform.
   */
  setHeading: (heading: number | null, marker: Marker | null) => void;
}

export const LOCATE_MARKER_OPTIONS = {
  rotationAlignment: "map",
  pitchAlignment: "viewport",
} as const;

export const createLocateMarkerElement = (): LocateMarkerElement => {
  const element = document.createElement("div");
  element.className = "libre-locate-marker";
  element.style.cssText = `
    position: relative;
    width: 18px;
    height: 18px;
    background: ${LOCATE_COLOR};
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
  `;

  // the arrow sits above the dot; absolutely positioned so it does not grow
  // the element and shift the dot off the position. The whole marker is
  // rotated to the heading, so "up" is "ahead".
  const arrow = document.createElement("div");
  arrow.className = "libre-locate-marker-heading";
  arrow.style.cssText = `
    position: absolute;
    left: 50%;
    bottom: 100%;
    margin-bottom: 2px;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 8px solid ${LOCATE_COLOR};
    filter: drop-shadow(0 0 1px white);
    display: none;
  `;
  element.appendChild(arrow);

  const setHeading = (heading: number | null, marker: Marker | null) => {
    arrow.style.display = heading === null ? "none" : "";
    if (marker && heading !== null) {
      marker.setRotation(heading);
    }
  };

  return { element, setHeading };
};

/** a polygon approximating the circle of `radiusInMeters` around the point */
export const createAccuracyCircleGeoJSON = (
  lng: number,
  lat: number,
  radiusInMeters: number
): GeoJSON.FeatureCollection => {
  const points = 64;
  const coords: [number, number][] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusInMeters * Math.cos(angle);
    const dy = radiusInMeters * Math.sin(angle);

    // Convert meters to degrees (approximate)
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    const dLat = dy / 110540;

    coords.push([lng + dLng, lat + dLat]);
  }
  coords.push(coords[0]);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      },
    ],
  };
};
