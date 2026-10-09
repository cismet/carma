import type { Positions } from "@carma-mapping/map-controls-layout";

import type { RouteMode } from "../Routing/routeMode";

/**
 * One fixed route to test the navigation on. Only the two ends are kept: the
 * line is asked for live when the scenario is picked, so it always has the
 * routing service's steps of today.
 */
export type RouteScenario = {
  id: string;
  /** the name in the list, and the route's label on the card */
  label: string;
  mode: RouteMode;
  /** where the pretend user is put, `[lng, lat]` */
  from: [number, number];
  /** the destination, `[lng, lat]` */
  to: [number, number];
  /** what the route is made to exercise; shown under the name */
  tests?: string;
};

export type RouteScenariosConfig = {
  /** replaces the built-in list, so another city gets its own */
  scenarios?: RouteScenario[];
  /** default top right */
  controlPosition?: Positions;
  controlOrder?: number;
};

export const DEFAULT_CONTROL_POSITION: Positions = "topright";
export const DEFAULT_CONTROL_ORDER = 60;

/** Wuppertal main station, where most of the scenarios start */
const HBF: [number, number] = [7.1494, 51.2547];
const OELBERG: [number, number] = [7.142, 51.26];

/**
 * The scenarios of `docs/navigation-improvements-plan.md`, checked against the
 * live MOTIS server on 2026-10-02. The wheelchair one (2) waits for a
 * wheelchair mode in the routing lib; the scripted ones (7 to 11) come with
 * the phases whose features they test.
 */
export const DEFAULT_SCENARIOS: RouteScenario[] = [
  {
    id: "treppen-suedstadt",
    label: "Treppen Südstadt",
    mode: "walk",
    from: HBF,
    to: [7.158, 51.25],
    tests: "1,3 km, 9× Treppe: Treppen in Karte, Warnungen, Schrittliste",
  },
  {
    id: "kurz-zu-fuss",
    label: "Kurz zu Fuß",
    mode: "walk",
    from: HBF,
    to: [7.152, 51.2565],
    tests: "410 m: Ankunft, Ankunftszeit; bei 4× in einer Minute durch",
  },
  {
    id: "nordbahntrasse",
    label: "Nordbahntrasse",
    mode: "bike",
    from: [7.16, 51.269],
    to: [7.215, 51.279],
    tests: "5 km Radweg geradeaus: Rad-Schwellen, Zoom nach Tempo",
  },
  {
    id: "a46-haan",
    label: "A 46 nach Haan",
    mode: "car",
    from: HBF,
    to: [7.013, 51.193],
    tests: "13,7 km, Stadt dann Autobahn: Zoomstufen, lange Fahrt",
  },
  {
    id: "oelberg-kurven",
    label: "Ölberg Kurven",
    mode: "car",
    from: OELBERG,
    to: [7.1335, 51.2645],
    tests: '1 km, kurze Abschnitte: die "dann"-Zeile',
  },
];
