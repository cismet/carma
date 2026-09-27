import type { TrafficEdge, TrafficNetwork } from "./traffic-network";
import { flowFor, profileAt, type TrafficFlow } from "./traffic-profile";

/**
 * The vehicles on the road network: where each one is, how fast it goes, and
 * how many there should be.
 *
 * How many is a density question. A road carrying `flow` vehicles an hour at
 * `speed` km/h holds `flow / speed` vehicles per kilometre, so the profile's
 * flow for the moment shown (`traffic-profile.ts`) gives every direction of
 * every edge a target count. The fleet is steered towards the sum of those,
 * not edge by edge: vehicles are placed where the targets are and then drive,
 * and at every node they pick their next road weighted by its load, which
 * keeps the busy roads busy on their own.
 *
 * About once a second the fleet is rebalanced. Below the target, new vehicles
 * appear: first where others drove off the model (a vehicle leaving through
 * an exit is replaced by one entering through an exit), the rest anywhere,
 * each picked by the target counts, fading in over a moment. Above the target,
 * random ones fade out. A jump from day to night therefore thins the traffic
 * out over a few seconds rather than in one frame.
 *
 * Vehicles do not see each other. There is no following distance, no queue at
 * a junction, no overtaking: at the densities the loads give, one car every
 * 50 m or more on the busiest road, that is rarely visible on the model, and
 * it keeps a vehicle's step a few additions.
 *
 * The fleet is capped (`maxVehicles`, default 2500). Above the cap every
 * target is scaled down by the same factor, so the traffic keeps its shape and
 * only gets thinner; the cap is reported so a panel can say so. At the 2020
 * loads the model's network wants about 1500 vehicles at the evening peak, so
 * the cap only bites with a `densityScale` above 1.
 *
 * Everything that is chance or time comes in from outside: `random` and the
 * `clock`, so a test can run the fleet step by step.
 */

export const VEHICLE_CAR = 0;
export const VEHICLE_BUS = 1;
export const VEHICLE_TRUCK = 2;
export type VehicleKind =
  | typeof VEHICLE_CAR
  | typeof VEHICLE_BUS
  | typeof VEHICLE_TRUCK;

/**
 * INVENTED. Driving speeds in km/h, averages including stops at lights. A
 * main road is one with more than `MAIN_ROAD_DAILY_LOAD` vehicles a day or
 * two lanes or more per direction; buses also stop at their stops.
 */
export const INVENTED_SPEEDS_KMH = {
  mainRoad: 50,
  sideRoad: 35,
  bus: 30,
  truck: 45,
} as const;
export const MAIN_ROAD_DAILY_LOAD = 20000;
/** INVENTED. Each vehicle drives this much faster or slower than its road, at most */
export const SPEED_SPREAD = 0.1;

export const DEFAULT_MAX_VEHICLES = 2500;
/** how long a vehicle takes to appear or to go, in seconds */
export const DEFAULT_FADE_SECONDS = 1.2;
/** seconds between two rebalances */
export const REBALANCE_SECONDS = 1;
/**
 * The share of the gap to the target closed per rebalance. The first one,
 * with no vehicle out yet, closes it at once.
 */
export const REBALANCE_SHARE = 0.4;

/** the road speed of an edge for cars, in km/h */
export const roadSpeedKmh = (edge: Pick<TrafficEdge, "bel" | "lanes">): number =>
  edge.bel > MAIN_ROAD_DAILY_LOAD || edge.lanes >= 2
    ? INVENTED_SPEEDS_KMH.mainRoad
    : INVENTED_SPEEDS_KMH.sideRoad;

/** how fast a vehicle of `kind` drives on `edge`, in km/h, before its own spread */
export const speedKmhOf = (
  kind: VehicleKind,
  edge: Pick<TrafficEdge, "bel" | "lanes">
): number => {
  const road = roadSpeedKmh(edge);
  if (kind === VEHICLE_BUS) return Math.min(INVENTED_SPEEDS_KMH.bus, road);
  if (kind === VEHICLE_TRUCK) return Math.min(INVENTED_SPEEDS_KMH.truck, road);
  return road;
};

export type TrafficVehicle = {
  /** stable for the vehicle's life, e.g. to pick its colour */
  id: number;
  kind: VehicleKind;
  edge: number;
  /** driving along the edge's point order */
  forward: boolean;
  /** metres driven on the current edge, from where it entered it */
  travelled: number;
  /** its own factor on the road speed, around 1 */
  pace: number;
  /** metres per second on the current edge */
  speed: number;
  /** 0 is the lane next to the kerb */
  lane: number;
  /** 0 invisible, 1 fully there */
  fade: number;
  /** 1 fading in, -1 fading out (and gone at 0), 0 steady */
  fading: -1 | 0 | 1;
};

/** the moment the fleet is steered for */
export type TrafficClockReading = {
  /** epoch milliseconds of the moment shown */
  instant: number;
  /** its local time of day in minutes, on the model's clock */
  minutesOfDay: number;
};

export type TrafficSimOptions = {
  network: TrafficNetwork;
  /** the moment shown; read at every rebalance */
  clock: () => TrafficClockReading;
  /** [0, 1), Math.random unless a test pins it */
  random?: () => number;
  maxVehicles?: number;
  /** a factor on every target, for a show that wants more or less. Default 1 */
  densityScale?: number;
  fadeSeconds?: number;
};

export type TrafficSimStats = {
  /** vehicles on the map, including those fading in or out */
  vehicles: number;
  /** vehicles the moment asks for, after the cap */
  target: number;
  /** what the moment asked for before the cap */
  wanted: number;
  capped: boolean;
};

export type TrafficSim = {
  readonly vehicles: readonly TrafficVehicle[];
  /** move everything on by `seconds`, rebalancing whenever one is due */
  step: (seconds: number) => void;
  /** read the clock again now, e.g. after the offset changed */
  retarget: () => void;
  /** close part of the gap to the target now; `step` calls it every second */
  rebalance: () => void;
  stats: () => TrafficSimStats;
  /** the fastest a vehicle drives, in m/s, for how often a frame is worth drawing */
  maxSpeed: () => number;
};

/** targets per direction of one edge, as vehicle counts */
type DirectionTarget = {
  edge: number;
  forward: boolean;
  car: number;
  bus: number;
  truck: number;
  total: number;
};

/** index of the first entry of `cumulative` above `value`, by bisection */
const pickIndex = (cumulative: Float64Array, value: number): number => {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] > value) high = middle;
    else low = middle + 1;
  }
  return low;
};

export const createTrafficSim = ({
  network,
  clock,
  random = Math.random,
  maxVehicles = DEFAULT_MAX_VEHICLES,
  densityScale = 1,
  fadeSeconds = DEFAULT_FADE_SECONDS,
}: TrafficSimOptions): TrafficSim => {
  const { edges, nodes } = network;
  const vehicles: TrafficVehicle[] = [];
  let nextId = 1;

  /** two per edge: index 2e is along the point order, 2e + 1 against it */
  const targets: DirectionTarget[] = edges.flatMap((edge) => [
    { edge: edge.index, forward: true, car: 0, bus: 0, truck: 0, total: 0 },
    { edge: edge.index, forward: false, car: 0, bus: 0, truck: 0, total: 0 },
  ]);
  const targetCumulative = new Float64Array(targets.length);
  let targetTotal = 0;
  let wantedTotal = 0;

  /** the directions that enter the network at an exit node, and their weights */
  const entries = targets.filter((target) => {
    const edge = edges[target.edge];
    const start = target.forward ? edge.from : edge.to;
    return nodes[start].exit;
  });
  const entryCumulative = new Float64Array(entries.length);
  let entryTotal = 0;

  /** vehicles that drove off the model since the last rebalance */
  let exitedSinceRebalance = 0;
  let sinceRebalance = 0;
  let isFirstRebalance = true;

  const flow: TrafficFlow = { car: 0, bus: 0, truck: 0 };

  const retarget = (): void => {
    const { instant, minutesOfDay } = clock();
    const moment = profileAt(instant, minutesOfDay);
    wantedTotal = 0;
    for (const target of targets) {
      const edge = edges[target.edge];
      flowFor(edge, moment, flow);
      const kilometres = (edge.length / 1000) * densityScale;
      target.car = (flow.car / speedKmhOf(VEHICLE_CAR, edge)) * kilometres;
      target.bus = (flow.bus / speedKmhOf(VEHICLE_BUS, edge)) * kilometres;
      target.truck = (flow.truck / speedKmhOf(VEHICLE_TRUCK, edge)) * kilometres;
      target.total = target.car + target.bus + target.truck;
      wantedTotal += target.total;
    }
    const scale =
      wantedTotal > maxVehicles && wantedTotal > 0
        ? maxVehicles / wantedTotal
        : 1;
    let sum = 0;
    targets.forEach((target, index) => {
      if (scale !== 1) {
        target.car *= scale;
        target.bus *= scale;
        target.truck *= scale;
        target.total *= scale;
      }
      sum += target.total;
      targetCumulative[index] = sum;
    });
    targetTotal = sum;
    entryTotal = 0;
    entries.forEach((entry, index) => {
      entryTotal += entry.total;
      entryCumulative[index] = entryTotal;
    });
  };

  const pickKind = (target: DirectionTarget): VehicleKind => {
    const roll = random() * target.total;
    if (roll < target.bus) return VEHICLE_BUS;
    if (roll < target.bus + target.truck) return VEHICLE_TRUCK;
    return VEHICLE_CAR;
  };

  const setSpeed = (vehicle: TrafficVehicle, edge: TrafficEdge): void => {
    vehicle.speed = (speedKmhOf(vehicle.kind, edge) / 3.6) * vehicle.pace;
  };

  /** a new vehicle on `target`, `travelled` metres in, fading in */
  const spawn = (target: DirectionTarget, travelled: number): void => {
    const edge = edges[target.edge];
    const vehicle: TrafficVehicle = {
      id: nextId++,
      kind: pickKind(target),
      edge: edge.index,
      forward: target.forward,
      travelled,
      pace: 1 + SPEED_SPREAD * (2 * random() - 1),
      speed: 0,
      lane: Math.min(edge.lanes - 1, Math.floor(random() * edge.lanes)),
      fade: 0,
      fading: 1,
    };
    setSpeed(vehicle, edge);
    vehicles.push(vehicle);
  };

  const spawnAnywhere = (): boolean => {
    if (targetTotal <= 0) return false;
    const target = targets[pickIndex(targetCumulative, random() * targetTotal)];
    spawn(target, random() * edges[target.edge].length);
    return true;
  };

  const spawnAtEntry = (): boolean => {
    if (entryTotal <= 0) return false;
    const entry = entries[pickIndex(entryCumulative, random() * entryTotal)];
    spawn(entry, 0);
    return true;
  };

  /** vehicles that count towards the target: all but those on their way out */
  const stayingCount = (): number => {
    let count = 0;
    for (const vehicle of vehicles) if (vehicle.fading !== -1) count++;
    return count;
  };

  const rebalance = (): void => {
    const staying = stayingCount();
    const target = Math.round(targetTotal);
    const gap = target - staying;
    if (gap > 0) {
      let count = isFirstRebalance
        ? gap
        : Math.max(1, Math.ceil(gap * REBALANCE_SHARE));
      // replace what drove off first, where it drives in
      const atEntries = Math.min(count, exitedSinceRebalance);
      for (let i = 0; i < atEntries; i++) {
        if (spawnAtEntry()) count--;
      }
      for (let i = 0; i < count; i++) {
        if (!spawnAnywhere()) break;
      }
    } else if (gap < 0) {
      let count = Math.max(1, Math.ceil(-gap * REBALANCE_SHARE));
      // random picks among those staying; a few tries each, then give up
      for (let tries = 0; count > 0 && tries < count * 8; tries++) {
        const vehicle = vehicles[Math.floor(random() * vehicles.length)];
        if (vehicle && vehicle.fading !== -1) {
          vehicle.fading = -1;
          count--;
        }
      }
    }
    exitedSinceRebalance = 0;
    isFirstRebalance = false;
  };

  /** the weight of turning into `edge`: its buses for a bus that can, else its load */
  const turnWeight = (edge: TrafficEdge, byBus: boolean): number =>
    byBus ? edge.bus : Math.max(edge.bel, 1);

  /**
   * The vehicle reached the end of its edge at `nodeIndex`. It leaves through
   * an exit, turns round at a dead end, and otherwise takes another road,
   * weighted by load. Returns false when it has left the network.
   */
  const turn = (vehicle: TrafficVehicle, nodeIndex: number): boolean => {
    const node = nodes[nodeIndex];
    if (node.exit) return false;
    const current = vehicle.edge;
    // a loop is listed twice at its node and may be taken either way
    const options: { edge: number; forward: boolean }[] = [];
    node.edges.forEach((edgeIndex, position) => {
      const edge = edges[edgeIndex];
      const isLoop = edge.from === edge.to;
      if (edgeIndex === current && !isLoop) return;
      const forward = isLoop
        ? node.edges.indexOf(edgeIndex) === position
        : edge.from === nodeIndex;
      if (edgeIndex === current && forward !== vehicle.forward) return;
      options.push({ edge: edgeIndex, forward });
    });
    let next: { edge: number; forward: boolean };
    if (options.length === 0) {
      next = { edge: current, forward: !vehicle.forward };
    } else {
      const byBus =
        vehicle.kind === VEHICLE_BUS &&
        options.some((option) => edges[option.edge].bus > 0);
      let total = 0;
      for (const option of options) total += turnWeight(edges[option.edge], byBus);
      let roll = random() * total;
      next = options[options.length - 1];
      for (const option of options) {
        roll -= turnWeight(edges[option.edge], byBus);
        if (roll < 0) {
          next = option;
          break;
        }
      }
    }
    const edge = edges[next.edge];
    vehicle.edge = next.edge;
    vehicle.forward = next.forward;
    vehicle.lane = Math.min(vehicle.lane, edge.lanes - 1);
    setSpeed(vehicle, edge);
    return true;
  };

  const advance = (seconds: number): void => {
    const fadeStep = fadeSeconds > 0 ? seconds / fadeSeconds : 1;
    for (let index = vehicles.length - 1; index >= 0; index--) {
      const vehicle = vehicles[index];
      let gone = false;
      if (vehicle.fading !== 0) {
        vehicle.fade += vehicle.fading * fadeStep;
        if (vehicle.fade >= 1) {
          vehicle.fade = 1;
          vehicle.fading = 0;
        } else if (vehicle.fade <= 0) {
          gone = true;
        }
      }
      if (!gone) {
        vehicle.travelled += vehicle.speed * seconds;
        // a short edge may be crossed several times in a long step; the
        // count keeps a zero-length ring from spinning forever
        for (let hops = 0; !gone && hops < 16; hops++) {
          const edge = edges[vehicle.edge];
          if (vehicle.travelled < edge.length) break;
          const rest = vehicle.travelled - edge.length;
          const at = vehicle.forward ? edge.to : edge.from;
          if (turn(vehicle, at)) {
            vehicle.travelled = rest;
          } else {
            gone = true;
            exitedSinceRebalance++;
          }
        }
      }
      if (gone) {
        // order does not matter, so the last one takes the free place
        const last = vehicles.pop();
        if (last && index < vehicles.length) vehicles[index] = last;
      }
    }
  };

  retarget();

  return {
    vehicles,
    step: (seconds) => {
      const elapsed = seconds > 0 ? seconds : 0;
      if (elapsed > 0) advance(elapsed);
      sinceRebalance += elapsed;
      // the first step fills the network at once, whatever its length
      if (isFirstRebalance || sinceRebalance >= REBALANCE_SECONDS) {
        sinceRebalance = isFirstRebalance
          ? 0
          : sinceRebalance % REBALANCE_SECONDS;
        retarget();
        rebalance();
      }
    },
    retarget,
    rebalance,
    stats: () => ({
      vehicles: vehicles.length,
      target: Math.round(targetTotal),
      wanted: Math.round(wantedTotal),
      capped: wantedTotal > maxVehicles,
    }),
    maxSpeed: () =>
      (INVENTED_SPEEDS_KMH.mainRoad / 3.6) * (1 + SPEED_SPREAD),
  };
};
