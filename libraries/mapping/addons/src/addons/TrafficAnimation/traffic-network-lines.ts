import type { Map as MapLibreMap } from "maplibre-gl";

import { sceneToLonLat, type TrafficNetwork } from "./traffic-network";

/**
 * The network the vehicles drive on, drawn as plain lines: an admin's check
 * of where the cars are attached, behind `?ff=admin` in the ribbon.
 *
 * Drawn from the parsed edges rather than from the fetched file, so a section
 * the parser dropped is missing here too, and the lines are exactly the
 * centre lines the sim moves along.
 */

export const TRAFFIC_NETWORK_LAYER_ID = "traffic-animation-network";
const SOURCE_ID = "traffic-animation-network";

type NetworkLineProperties = { name: string; oneway: boolean };

export type NetworkLines = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: NetworkLineProperties;
    geometry: { type: "LineString"; coordinates: [number, number][] };
  }[];
};

/** every edge of `network` as a lon/lat LineString */
export const networkLines = (network: TrafficNetwork): NetworkLines => ({
  type: "FeatureCollection",
  features: network.edges.map((edge) => {
    const coordinates: [number, number][] = [];
    for (let i = 0; i < edge.points.length; i += 2) {
      coordinates.push(
        sceneToLonLat(network, edge.points[i], edge.points[i + 1])
      );
    }
    return {
      type: "Feature",
      properties: { name: edge.name, oneway: edge.oneway },
      geometry: { type: "LineString", coordinates },
    };
  }),
});

/**
 * Put the lines on `map` and keep them there across style swaps. Returns the
 * function that takes them off again.
 */
export const attachNetworkLines = (
  map: MapLibreMap,
  network: TrafficNetwork
): (() => void) => {
  const data = networkLines(network);

  const attach = (): void => {
    try {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: "geojson", data });
      }
      if (!map.getLayer(TRAFFIC_NETWORK_LAYER_ID)) {
        map.addLayer({
          id: TRAFFIC_NETWORK_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#e6007e",
            "line-width": 1.5,
            "line-opacity": 0.9,
          },
        });
      }
    } catch {
      // no style yet; its `styledata` brings the next try
    }
  };

  map.on("styledata", attach);
  attach();

  return () => {
    map.off("styledata", attach);
    try {
      if (map.getLayer(TRAFFIC_NETWORK_LAYER_ID)) {
        map.removeLayer(TRAFFIC_NETWORK_LAYER_ID);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    } catch {
      // the map is already gone
    }
  };
};
