import { describe, expect, it } from "vitest";

import { networkLines } from "./traffic-network-lines";
import { parseTrafficNetwork } from "./traffic-network";

const COORDINATES: [number, number][] = [
  [7.12, 51.24],
  [7.125, 51.2425],
  [7.13, 51.245],
];

describe("networkLines", () => {
  it("draws every edge back at the lon/lat it came from", () => {
    const network = parseTrafficNetwork({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "A", bel: 1000 },
          geometry: { type: "LineString", coordinates: COORDINATES },
        },
      ],
    });
    expect(network).not.toBeNull();
    if (!network) return;

    const lines = networkLines(network);
    expect(lines.features).toHaveLength(1);
    const [line] = lines.features;
    expect(line.properties).toEqual({ name: "A", oneway: false });
    line.geometry.coordinates.forEach(([lon, lat], i) => {
      expect(lon).toBeCloseTo(COORDINATES[i][0], 9);
      expect(lat).toBeCloseTo(COORDINATES[i][1], 9);
    });
  });
});
