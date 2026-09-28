import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTrafficNetwork, type TrafficNetwork } from "./traffic-network";
import {
  INVENTED_BUS_HOURLY_SHARE,
  INVENTED_HOURLY_SHARE,
  INVENTED_MIN_DAILY_LOAD,
  flowAt,
  hashUnit,
} from "./traffic-profile";
import {
  CLEARANCE_METERS,
  VEHICLE_BUS,
  VEHICLE_SIZE,
  createTrafficSim,
  type TrafficVehicle,
} from "./traffic-sim";

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

  it("gives a one-way road's only direction its whole load", () => {
    const twoWay = flowAt(
      { index: 0, bel: 20_000, bus: 400 },
      EVENING.instant,
      EVENING.minutesOfDay
    );
    const oneWay = flowAt(
      { index: 0, bel: 20_000, bus: 400, oneway: true },
      EVENING.instant,
      EVENING.minutesOfDay
    );
    expect(oneWay.car).toBeCloseTo(2 * twoWay.car, 6);
    expect(oneWay.bus).toBeCloseTo(2 * twoWay.bus, 6);
    expect(oneWay.truck).toBeCloseTo(2 * twoWay.truck, 6);
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

  it("takes a section as one-way only when it says so", () => {
    const network = parseTrafficNetwork({
      type: "FeatureCollection",
      features: [
        road(500, { name: "Rampe", from: 1, to: 2, oneway: true }),
        road(500, { name: "Straße", from: 2, to: 3 }),
        road(500, { name: "Gasse", from: 3, to: 4, oneway: "yes" }),
      ],
    }) as TrafficNetwork;

    expect(network.edges.map((edge) => edge.oneway)).toEqual([true, false, false]);
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

  it("keeps the vehicles in a lane apart at the size they are drawn", () => {
    const sizeScale = 3.5;
    const sim = createTrafficSim({
      network,
      clock: () => EVENING,
      random: seeded(7),
      sizeScale,
      densityScale: 3,
    });
    sim.step(0);
    for (let step = 0; step < 480; step++) sim.step(0.25);
    const byLane = new Map<string, TrafficVehicle[]>();
    for (const vehicle of sim.vehicles) {
      const key = `${vehicle.edge}|${vehicle.forward}|${vehicle.lane}`;
      byLane.set(key, [...(byLane.get(key) ?? []), vehicle]);
    }
    let pairs = 0;
    for (const lane of byLane.values()) {
      lane.sort((a, b) => b.travelled - a.travelled);
      for (let index = 1; index < lane.length; index++) {
        const ahead = lane[index - 1];
        const behind = lane[index];
        const gap =
          ((VEHICLE_SIZE[ahead.kind][0] + VEHICLE_SIZE[behind.kind][0]) / 2 +
            CLEARANCE_METERS) *
          sizeScale;
        // a vehicle waiting at a junction stands a centimetre short of the end
        expect(ahead.travelled - behind.travelled).toBeGreaterThan(gap - 0.02);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(20);
  });

  it("lets two merging roads zip in behind each other, apart at the drawn size", () => {
    const sizeScale = 3.5;
    const merge = parseTrafficNetwork({
      type: "FeatureCollection",
      exits: [1, 2, 4],
      features: [
        road(400, { name: "Rampe", bel: 30_000, from: 1, to: 3 }),
        road(400, { name: "Zubringer", bel: 30_000, from: 2, to: 3 }),
        road(400, { name: "Weiter", bel: 30_000, from: 3, to: 4 }, 7.15 + 400 / 69_700),
      ],
    }) as TrafficNetwork;
    const onward = merge.edges.find((edge) => edge.name === "Weiter");
    if (!onward) throw new Error("no onward road");
    let checked = 0;
    let tooClose = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = createTrafficSim({
        network: merge,
        clock: () => EVENING,
        random: seeded(seed),
        sizeScale,
        densityScale: 4,
      });
      sim.step(0);
      for (let step = 0; step < 480; step++) {
        sim.step(0.25);
        // everything bound for the onward road, on one line through the junction
        const line = sim.vehicles
          .filter((vehicle) =>
            vehicle.edge === onward.index
              ? vehicle.forward
              : vehicle.nextEdge === onward.index && vehicle.nextForward
          )
          .map((vehicle) => ({
            vehicle,
            at:
              vehicle.edge === onward.index
                ? vehicle.travelled
                : vehicle.travelled - merge.edges[vehicle.edge].length,
          }))
          .sort((a, b) => b.at - a.at);
        for (let index = 1; index < line.length; index++) {
          const ahead = line[index - 1];
          const behind = line[index];
          const gap =
            ((VEHICLE_SIZE[ahead.vehicle.kind][0] + VEHICLE_SIZE[behind.vehicle.kind][0]) /
              2 +
              CLEARANCE_METERS) *
            sizeScale;
          // further out the two roads are apart; they meet at the junction
          if (behind.at < -gap || ahead.at > gap) continue;
          checked++;
          if (ahead.at - behind.at < gap - 0.02) tooClose++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    // not none: one queued behind a vehicle that turns off joins the line
    // only once that one is gone, and may be too close by then (without the
    // zipping, 60 % of the pairs are)
    expect(tooClose / checked).toBeLessThan(0.01);
  });

  it("drives a one-way road only its way", () => {
    // the ramp runs into the junction, so a vehicle there must not turn into it
    const fork = parseTrafficNetwork({
      type: "FeatureCollection",
      exits: [1, 3, 4],
      features: [
        road(400, { name: "Zubringer", bel: 20_000, from: 1, to: 2 }),
        road(400, { name: "Rampe", bel: 10_000, from: 3, to: 2, oneway: true }),
        road(400, { name: "Weiter", bel: 20_000, from: 2, to: 4 }, 7.15 + 400 / 69_700),
      ],
    }) as TrafficNetwork;
    const ramp = fork.edges.find((edge) => edge.name === "Rampe");
    if (!ramp) throw new Error("no ramp");
    const sim = createTrafficSim({
      network: fork,
      clock: () => EVENING,
      random: seeded(4),
      densityScale: 3,
    });
    sim.step(0);
    let onRamp = 0;
    for (let step = 0; step < 480; step++) {
      sim.step(0.25);
      for (const vehicle of sim.vehicles) {
        if (vehicle.edge === ramp.index) {
          expect(vehicle.forward).toBe(true);
          onRamp++;
        }
        if (vehicle.nextEdge === ramp.index) expect(vehicle.nextForward).toBe(true);
      }
    }
    expect(onRamp).toBeGreaterThan(100);
  });

  it("keeps the model's network moving at the evening peak", () => {
    const sizeScale = 3.5;
    const model = parseTrafficNetwork(
      JSON.parse(
        readFileSync(
          join(
            __dirname,
            "../../../../../../apps/geoportal/public/assets/dz-b-prm/traffic/verkehrsnetz_modell.json"
          ),
          "utf8"
        )
      )
    ) as TrafficNetwork;
    const sim = createTrafficSim({
      network: model,
      clock: () => EVENING,
      random: seeded(2),
      sizeScale,
    });
    sim.step(0);
    const lastMoved = new Map<TrafficVehicle, { at: number; travelled: number; edge: number }>();
    let stuck = 0;
    for (let second = 0; second <= 600; second++) {
      for (let step = 0; step < 4; step++) sim.step(0.25);
      stuck = 0;
      for (const vehicle of sim.vehicles) {
        const last = lastMoved.get(vehicle);
        if (
          !last ||
          last.edge !== vehicle.edge ||
          Math.abs(last.travelled - vehicle.travelled) > 0.5
        ) {
          lastMoved.set(vehicle, {
            at: second,
            travelled: vehicle.travelled,
            edge: vehicle.edge,
          });
        } else if (second - last.at > 60) {
          stuck++;
        }
      }
    }
    expect(sim.stats().vehicles).toBeGreaterThan(1000);
    // a queue at a junction stands for a while, a circle waiting on itself for good
    expect(stuck).toBeLessThan(sim.stats().vehicles * 0.02);
  });

  it("puts fewer vehicles on a road than its load asks for when they do not fit", () => {
    const sim = createTrafficSim({
      network,
      clock: () => EVENING,
      random: seeded(9),
      sizeScale: 3.5,
      densityScale: 40,
    });
    sim.step(0);
    for (let second = 0; second < 20; second++) sim.step(1);
    const { vehicles, target } = sim.stats();
    expect(vehicles).toBeGreaterThan(50);
    expect(vehicles).toBeLessThan(target);
  });

  it("sends buses out only where buses run", () => {
    const sim = createTrafficSim({ network, clock: () => EVENING, random: seeded(5) });
    sim.step(0);
    const buses = sim.vehicles.filter((vehicle) => vehicle.kind === VEHICLE_BUS);
    expect(buses.length).toBeGreaterThan(0);
    for (const bus of buses) expect(bus.edge).toBe(0);
  });
});
