import { WUPPERTAL_CAMERA_FLIGHTS } from "@carma-commons/resources";

export type NightTrafficPathKind = "car" | "schwebebahn" | "train";

export type NightTrafficPath = Readonly<{
  id: string;
  kind: NightTrafficPathKind;
  coordinates: readonly (readonly [longitude: number, latitude: number])[];
  osmWayId: number;
}>;

export type NightTrafficSignal = Readonly<{
  id: string;
  pathId: string;
  coordinate: readonly [longitude: number, latitude: number];
  osmNodeId: number;
}>;

/**
 * Small WGS84 OSM extracts for a deterministic Barmen night scene.
 * Geometry provenance and derivation limits are recorded in night-traffic-source.md.
 * Vehicle motion and signal phases are deliberately not source observations.
 */
export const NIGHT_TRAFFIC_PATHS: readonly NightTrafficPath[] = [
  {
    id: "car-berliner-strasse",
    kind: "car",
    osmWayId: 24404476,
    coordinates: [
      [7.2069222, 51.2729563],
      [7.2069826, 51.2730059],
      [7.2070459, 51.2730518],
      [7.2072213, 51.2731632],
      [7.2073759, 51.2732447],
      [7.2075387, 51.27332],
      [7.2077053, 51.2733952],
      [7.2078715, 51.2734677],
      [7.2080044, 51.2735254],
      [7.2082668, 51.2736295],
      [7.2086689, 51.273756],
      [7.2090507, 51.2738733],
      [7.2093945, 51.2739588],
      [7.2097006, 51.2740009],
      [7.2100741, 51.2740393],
      [7.2111526, 51.274152],
    ],
  },
  {
    id: "car-friedrich-engels-allee",
    kind: "car",
    osmWayId: 35067224,
    coordinates: [
      [7.1928577, 51.2680623],
      [7.1927079, 51.2679947],
      [7.1924636, 51.267875],
      [7.1919142, 51.2676022],
      [7.1915001, 51.2674199],
      [7.1910714, 51.267248],
      [7.1907395, 51.2671375],
      [7.1906447, 51.2671056],
      [7.1903785, 51.267021],
      [7.1902845, 51.2669897],
    ],
  },
  {
    id: "car-hoehne",
    kind: "car",
    osmWayId: 543132399,
    coordinates: [
      [7.2067449, 51.2729841],
      [7.2065892, 51.2728453],
      [7.2065162, 51.2727712],
      [7.2063967, 51.2726395],
      [7.2063418, 51.2725569],
      [7.2062866, 51.2724671],
      [7.206238, 51.2723819],
      [7.2061166, 51.2721647],
      [7.2060797, 51.2721047],
      [7.2060373, 51.272044],
      [7.2060069, 51.2720087],
      [7.2059634, 51.2719598],
      [7.2059128, 51.2719115],
      [7.2058686, 51.2718744],
      [7.2057977, 51.2718148],
    ],
  },
  {
    id: "schwebebahn-barmen",
    kind: "schwebebahn",
    osmWayId: 37195413,
    coordinates: WUPPERTAL_CAMERA_FLIGHTS.schwebebahn.coordinates,
  },
  {
    id: "train-db-2525-barmen",
    kind: "train",
    osmWayId: 6052315,
    coordinates: [
      [7.2131578, 51.2728073],
      [7.2097545, 51.2720953],
      [7.2059583, 51.2707728],
      [7.200914, 51.2687988],
      [7.1926345, 51.2662399],
      [7.1872939, 51.2647108],
    ],
  },
] as const;

export const NIGHT_TRAFFIC_SIGNALS: readonly NightTrafficSignal[] = [
  {
    id: "signal-berliner-strasse",
    pathId: "car-berliner-strasse",
    coordinate: [7.2086689, 51.273756],
    osmNodeId: 2497096960,
  },
  {
    id: "signal-friedrich-engels-allee",
    pathId: "car-friedrich-engels-allee",
    coordinate: [7.1906447, 51.2671056],
    osmNodeId: 7247902052,
  },
  {
    id: "signal-hoehne",
    pathId: "car-hoehne",
    coordinate: [7.2063967, 51.2726395],
    osmNodeId: 451712501,
  },
] as const;
