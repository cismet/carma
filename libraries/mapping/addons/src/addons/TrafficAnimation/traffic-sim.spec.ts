import { describe, expect, it } from "vitest";

import { parseTrafficNetwork, type TrafficNetwork } from "./traffic-network";
import {
  INVENTED_BUS_HOURLY_SHARE,
  INVENTED_HOURLY_SHARE,
  INVENTED_MIN_DAILY_LOAD,
  flowAt,
  hashUnit,
} from "./traffic-profile";
import { VEHICLE_BUS, createTrafficSim } from "./traffic-sim";

/** a straight road of about `meters` running east from 7.15°E, 51.26°N */
const road = (
  meters: number,
  properties: Record<string, unknown>,
  startLon = 7.15
) => ({
  type: "Feature",
  properties,
  geometry: {
    type: "LineString",
    coordinates: [
      [startLon, 51.26],
      [startLon + meters / 69_700, 51.26],
    ],
  },
});

/** a seeded [0, 1) sequence, so a fleet comes out the same every run */
const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

/** 17:30 on some day, as the clock the sim is steered by reads it */
const EVENING = { instant: Date.UTC(2026, 8, 24, 15, 30), minutesOfDay: 1050 };
const NIGHT = { instant: Date.UTC(2026, 8, 24, 1, 30), minutesOfDay: 210 };

describe("traffic profile (invented)", () => {
  it("spreads a whole day over the hours", () => {
    expect(sum(INVENTED_HOURLY_SHARE)).toBeCloseTo(1, 10);
    expect(sum(INVENTED_BUS_HOURLY_SHARE)).toBeCloseTo(1, 10);
  });

  it("gives the same past hour the same traffic every time", () => {
    expect(hashUnit(493_000, 4)).toBe(hashUnit(493_000, 4));
    expect(hashUnit(493_000, 4)).not.toBe(hashUnit(493_001, 4));
  });

  it("has more traffic at the evening peak than at night", () => {
    const edge = { index: 0, bel: 20_000, bus: 0 };
    const evening = flowAt(edge, EVENING.instant, EVENING.minutesOfDay);
    const night = flowAt(edge, NIGHT.instant, NIGHT.minutesOfDay);
    expect(evening.car + evening.truck).toBeGreaterThan(
      5 * (night.car + night.truck)
    );
  });

  it("drives a street the model counts nothing on at its minimum load", () => {
    const edge = { index: 0, bel: 0, bus: 0 };
    const counted = { index: 0, bel: INVENTED_MIN_DAILY_LOAD, bus: 0 };
    expect(flowAt(edge, EVENING.instant, EVENING.minutesOfDay)).toEqual(
      flowAt(counted, EVENING.instant, EVENING.minutesOfDay)
    );
  });

  it("runs no bus in the small hours", () => {
    const edge = { index: 0, bel: 20_000, bus: 400 };
    expect(flowAt(edge, NIGHT.instant, NIGHT.minutesOfDay).bus).toBe(0);
  });
});

describe("parseTrafficNetwork", () => {
  it("joins sections at their node ids and marks the listed exits", () => {
    const network = parseTrafficNetwork({
      type: "FeatureCollection",
      exits: [1],
      features: [
        road(500, { name: "A", bel: 10_000, from: 1, to: 2 }),
        road(500, { name: "B", bel: 8_000, from: 2, to: 3 }, 7.15 + 500 / 69_700),
      ],
    }) as TrafficNetwork;

    expect(network.edges).toHaveLength(2);
    expect(network.nodes).toHaveLength(3);
    expect(network.nodes.map((node) => node.exit)).toEqual([true, false, false]);
    expect(network.edges[0].length).toBeGreaterThan(450);
    expect(network.edges[0].length).toBeLessThan(550);
  });

  it("returns null for anything without a line", () => {
    expect(parseTrafficNetwork({ type: "FeatureCollection", features: [] })).toBe(
      null
    );
    expect(parseTrafficNetwork("nope")).toBe(null);
  });
});

describe("createTrafficSim", () => {
  const network = parseTrafficNetwork({
    type: "FeatureCollection",
    features: [
      road(2000, { name: "Hauptstr.", bel: 30_000, bus: 300, lanes: 2, from: 1, to: 2 }),
      road(1000, { name: "Nebenstr.", bel: 2_000, from: 2, to: 3 }, 7.15 + 2000 / 69_700),
    ],
  }) as TrafficNetwork;

  it("fills the network to its target at the first step", () => {
    const sim = createTrafficSim({ network, clock: () => EVENING, random: seeded() });
    sim.step(0);
    const { vehicles, target } = sim.stats();
    expect(target).toBeGreaterThan(10);
    expect(vehicles).toBe(target);
  });

  it("thins the traffic out when the moment moves to the night", () => {
    let moment = EVENING;
    const sim = createTrafficSim({ network, clock: () => moment, random: seeded() });
    sim.step(0);
    const evening = sim.stats().vehicles;
    moment = NIGHT;
    for (let second = 0; second < 30; second++) sim.step(1);
    expect(sim.stats().vehicles).toBeLessThan(evening / 3);
  });

  it("scales the fleet down to its cap and says so", () => {
    const sim = createTrafficSim({
      network,
      clock: () => EVENING,
      random: seeded(),
      maxVehicles: 5,
    });
    sim.step(0);
    expect(sim.stats()).toMatchObject({ vehicles: 5, target: 5, capped: true });
  });

  it("keeps the vehicles on the network as they drive", () => {
    const sim = createTrafficSim({ network, clock: () => EVENING, random: seeded(3) });
    sim.step(0);
    for (let second = 0; second < 120; second++) sim.step(0.25);
    for (const vehicle of sim.vehicles) {
      const edge = network.edges[vehicle.edge];
      expect(vehicle.travelled).toBeGreaterThanOrEqual(0);
      expect(vehicle.travelled).toBeLessThan(edge.length);
      expect(vehicle.lane).toBeLessThan(edge.lanes);
    }
  });

  it("sends buses out only where buses run", () => {
    const sim = createTrafficSim({ network, clock: () => EVENING, random: seeded(5) });
    sim.step(0);
    const buses = sim.vehicles.filter((vehicle) => vehicle.kind === VEHICLE_BUS);
    expect(buses.length).toBeGreaterThan(0);
    for (const bus of buses) expect(bus.edge).toBe(0);
  });
});
