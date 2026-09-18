/**
 * The DOM and geometry of the "you are here" display: the dot with its
 * heading arrow, the navigation arrow that stands in for the dot while the
 * user travels along a route, and the accuracy circle around it.
 */

import type { Marker } from "maplibre-gl";

const LOCATE_COLOR = "#4285f4";
/** the navigation arrow's box; the dot is smaller and centred in it */
const TRAVEL_SIZE = 30;

export interface LocateMarkerElement {
  /** the element to hand to the maplibre marker */
  element: HTMLElement;
  /**
   * Show the arrow pointing to `heading` (degrees from north), or hide it for
   * null. Needs the marker once it exists, because the whole marker is turned
   * and maplibre owns its transform.
   */
  setHeading: (heading: number | null, marker: Marker | null) => void;
  /**
   * Show the navigation arrow turned to `heading` (degrees from north) in
   * place of the dot, or the dot again for null. Where the user is going, as
   * against where the device is facing: the two are the same in a car and not
   * on foot, and a navigation wants the first. Takes precedence over the
   * compass heading while set.
   */
  setTravelHeading: (heading: number | null, marker: Marker | null) => void;
}

export const LOCATE_MARKER_OPTIONS = {
  rotationAlignment: "map",
  pitchAlignment: "viewport",
} as const;

export const createLocateMarkerElement = (): LocateMarkerElement => {
  // the container is the arrow's size and centred on the position, so the
  // dot and the arrow swap without either shifting off it
  const element = document.createElement("div");
  element.className = "libre-locate-marker";
  element.style.cssText = `
    position: relative;
    width: ${TRAVEL_SIZE}px;
    height: ${TRAVEL_SIZE}px;
  `;

  const dot = document.createElement("div");
  dot.className = "libre-locate-marker-dot";
  dot.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    width: 18px;
    height: 18px;
    transform: translate(-50%, -50%);
    background: ${LOCATE_COLOR};
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
  `;
  element.appendChild(dot);

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
  dot.appendChild(arrow);

  // the navigation arrow: a chevron with its tip up, white-edged like the dot
  const travel = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  travel.setAttribute("class", "libre-locate-marker-travel");
  travel.setAttribute("viewBox", "0 0 24 24");
  travel.setAttribute("width", `${TRAVEL_SIZE}`);
  travel.setAttribute("height", `${TRAVEL_SIZE}`);
  travel.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    display: none;
    filter: drop-shadow(0 0 3px rgba(0,0,0,0.35));
  `;
  const chevron = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  chevron.setAttribute("d", "M12 2 L21 21 L12 16.5 L3 21 Z");
  chevron.setAttribute("fill", LOCATE_COLOR);
  chevron.setAttribute("stroke", "white");
  chevron.setAttribute("stroke-width", "2");
  chevron.setAttribute("stroke-linejoin", "round");
  travel.appendChild(chevron);
  element.appendChild(travel);

  let travelHeading: number | null = null;
  let compassHeading: number | null = null;

  /** what the marker shows, from the two headings */
  const apply = (marker: Marker | null) => {
    const travelling = travelHeading !== null;
    travel.style.display = travelling ? "" : "none";
    dot.style.display = travelling ? "none" : "";
    arrow.style.display = compassHeading === null ? "none" : "";
    const rotation = travelling ? travelHeading : compassHeading;
    if (marker && rotation !== null) {
      marker.setRotation(rotation);
    }
  };

  const setHeading = (heading: number | null, marker: Marker | null) => {
    compassHeading = heading;
    apply(marker);
  };

  const setTravelHeading = (heading: number | null, marker: Marker | null) => {
    travelHeading = heading;
    apply(marker);
  };

  return { element, setHeading, setTravelHeading };
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
