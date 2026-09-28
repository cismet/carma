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
 * keeps the busy roads busy on their own. A one-way edge has a target only in
 * its direction, and no vehicle turns into it the other way.
 *
 * About once a second the fleet is rebalanced. Below the target, new vehicles
 * appear: first where others drove off the model (a vehicle leaving through
 * an exit is replaced by one entering through an exit), the rest anywhere,
 * each picked by the target counts, fading in over a moment. Above the target,
 * random ones fade out. A jump from day to night therefore thins the traffic
 * out over a few seconds rather than in one frame.
 *
 * Vehicles keep their distance in their lane. The bodies are drawn
 * `sizeScale` times their real size (`traffic-layer.ts`), so the distance is
 * worked out at that size: half of each body plus a clearance, all enlarged.
 * A faster vehicle closes up behind a slower one and stays there; there is no
 * overtaking. A vehicle knows the road it takes next from the moment it
 * enters an edge, so near the end it looks at that road too: it takes the
 * lane with the most room there, and waits at the junction while none has
 * enough. Where roads merge, the vehicles heading for the same lane zip in by
 * how close each is to the junction. New vehicles only appear where there is
 * room, so a road the enlarged bodies fill carries fewer than its load asks
 * for.
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

/** real vehicle sizes in metres, before `sizeScale`: length, width */
export const VEHICLE_SIZE: Record<VehicleKind, readonly [number, number]> = {
  0: [4.5, 1.8],
  1: [12, 2.55],
  2: [12, 2.5],
};
/** INVENTED. Clear space between two vehicles in a lane, real metres */
export const CLEARANCE_METERS = 2;
/** a new vehicle looks this many times for a place with room */
const SPAWN_TRIES = 4;
/** where a vehicle waiting at a junction stands at most, short of its edge's end, in metres */
const WAIT_SHORT_OF_END = 0.01;

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
  /** the edge it takes at the end of this one; -1 leaves the network there */
  nextEdge: number;
  nextForward: boolean;
  /**
   * The edge it came from, -1 when it started on this one, and its lane
   * there. Only for drawing: the rear of a vehicle that just turned is still
   * on it.
   */
  previousEdge: number;
  previousForward: boolean;
  previousLane: number;
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
  /** how many times their real size the bodies are drawn, for the distances. Default 1 */
  sizeScale?: number;
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
  sizeScale = 1,
}: TrafficSimOptions): TrafficSim => {
  const { edges, nodes } = network;
  const vehicles: TrafficVehicle[] = [];
  let nextId = 1;

  /** centre to centre, the closest `behind` may come to `ahead` in a lane */
  const gapBetween = (ahead: VehicleKind, behind: VehicleKind): number =>
    ((VEHICLE_SIZE[ahead][0] + VEHICLE_SIZE[behind][0]) / 2 + CLEARANCE_METERS) *
    sizeScale;
  /**
   * How far before a junction the vehicles bound for one lane there line up,
   * in metres: two of the longest distances two vehicles keep. The roads
   * that merge are taken to be apart before that.
   */
  const mergeZone = 2 * gapBetween(VEHICLE_TRUCK, VEHICLE_TRUCK);

  /**
   * The vehicles in each lane of each direction of each edge, front first.
   * Filled anew for every step; the arrays are kept to spare the garbage.
   */
  const lanes = new Map<number, TrafficVehicle[]>();
  const laneKey = (edge: number, forward: boolean, lane: number): number =>
    (edge * 2 + (forward ? 0 : 1)) * 8 + Math.min(lane, 7);
  const laneOf = (edge: number, forward: boolean, lane: number) =>
    lanes.get(laneKey(edge, forward, lane));
  const sortLanes = (): void => {
    for (const list of lanes.values()) list.length = 0;
    for (const vehicle of vehicles) {
      const key = laneKey(vehicle.edge, vehicle.forward, vehicle.lane);
      let list = lanes.get(key);
      if (!list) {
        list = [];
        lanes.set(key, list);
      }
      list.push(vehicle);
    }
    for (const list of lanes.values()) {
      if (list.length > 1) list.sort((a, b) => b.travelled - a.travelled);
    }
    collectFeeders();
  };
  const addToLane = (vehicle: TrafficVehicle): void => {
    const key = laneKey(vehicle.edge, vehicle.forward, vehicle.lane);
    const list = lanes.get(key);
    if (list) list.push(vehicle);
    else lanes.set(key, [vehicle]);
  };

  /** the lane of its next road a vehicle drives into while that has room */
  const intendedKey = (vehicle: TrafficVehicle): number =>
    laneKey(
      vehicle.nextEdge,
      vehicle.nextForward,
      Math.min(vehicle.lane, edges[vehicle.nextEdge].lanes - 1)
    );

  /**
   * Every lane, listed under each lane one of its vehicles drives into next.
   * The lanes in one list meet at a junction. Lanes rather than vehicles, as
   * a lane's front vehicle changes within a step when the one ahead goes on.
   * Filled with the lanes.
   */
  const feeders = new Map<number, number[]>();
  const addFeeder = (vehicle: TrafficVehicle): void => {
    if (vehicle.nextEdge < 0) return;
    const key = laneKey(vehicle.edge, vehicle.forward, vehicle.lane);
    const target = intendedKey(vehicle);
    const sources = feeders.get(target);
    if (!sources) feeders.set(target, [key]);
    else if (!sources.includes(key)) sources.push(key);
  };
  const collectFeeders = (): void => {
    for (const list of feeders.values()) list.length = 0;
    for (const list of lanes.values()) {
      for (const vehicle of list) addFeeder(vehicle);
    }
  };
  /** whether `vehicle` drives into lane `target` next */
  const isBoundFor = (vehicle: TrafficVehicle, target: number): boolean =>
    vehicle.nextEdge >= 0 && intendedKey(vehicle) === target;
  /** kept between calls to spare the garbage */
  const bound: TrafficVehicle[] = [];
  /**
   * The vehicles that drive into lane `target` at the end of the lane they
   * are in, from all lanes that lead there, as far as they get there: not
   * those behind one that goes elsewhere, which may be stuck. Waiting for
   * those could close a circle of vehicles waiting for each other. The list
   * is reused by the next call.
   */
  const boundFor = (target: number): readonly TrafficVehicle[] => {
    bound.length = 0;
    for (const source of feeders.get(target) ?? []) {
      const list = lanes.get(source) ?? [];
      // the list still holds those that went on in this step; skip them
      let elsewhereAt = -Infinity;
      for (const vehicle of list) {
        if (laneKey(vehicle.edge, vehicle.forward, vehicle.lane) !== source) continue;
        if (!isBoundFor(vehicle, target)) {
          elsewhereAt = Math.max(elsewhereAt, vehicle.travelled);
        }
      }
      for (const vehicle of list) {
        if (laneKey(vehicle.edge, vehicle.forward, vehicle.lane) !== source) continue;
        if (vehicle.travelled > elsewhereAt && isBoundFor(vehicle, target)) {
          bound.push(vehicle);
        }
      }
    }
    return bound;
  };

  /** a lane's list still holds a vehicle that left it in this step */
  const isIn = (
    vehicle: TrafficVehicle,
    edge: number,
    forward: boolean,
    lane: number
  ): boolean =>
    vehicle.edge === edge && vehicle.forward === forward && vehicle.lane === lane;

  /** the last vehicle in a lane, the one a vehicle driving in meets first */
  const rearOf = (
    edge: number,
    forward: boolean,
    lane: number
  ): TrafficVehicle | null => {
    let rear: TrafficVehicle | null = null;
    for (const vehicle of laneOf(edge, forward, lane) ?? []) {
      if (!isIn(vehicle, edge, forward, lane)) continue;
      if (!rear || vehicle.travelled < rear.travelled) rear = vehicle;
    }
    return rear;
  };

  /**
   * The lane of `edge` a vehicle in `lane` drives into: its own where it
   * fits, else the one whose last vehicle is furthest in. Returns the lane and
   * how far in that last vehicle is (Infinity for an empty lane).
   */
  const entryLane = (
    edge: number,
    forward: boolean,
    lane: number
  ): { lane: number; rear: TrafficVehicle | null } => {
    const own = Math.min(lane, edges[edge].lanes - 1);
    let best = { lane: own, rear: rearOf(edge, forward, own) };
    for (let other = 0; other < edges[edge].lanes && best.rear; other++) {
      if (other === own) continue;
      const rear = rearOf(edge, forward, other);
      if (!rear || rear.travelled > best.rear.travelled) {
        best = { lane: other, rear };
      }
    }
    return best;
  };

  /**
   * Whether a `kind` fits in at `travelled` in this lane: apart from those in
   * it and from those about to drive in from other roads.
   */
  const hasRoom = (
    edge: number,
    forward: boolean,
    lane: number,
    travelled: number,
    kind: VehicleKind
  ): boolean => {
    for (const other of laneOf(edge, forward, lane) ?? []) {
      if (!isIn(other, edge, forward, lane)) continue;
      const ahead = other.travelled >= travelled;
      const gap = ahead ? gapBetween(other.kind, kind) : gapBetween(kind, other.kind);
      if (Math.abs(other.travelled - travelled) < gap) return false;
    }
    for (const other of boundFor(laneKey(edge, forward, lane))) {
      if (other.edge === edge && other.forward === forward) continue;
      const at = other.travelled - edges[other.edge].length;
      if (travelled - at < gapBetween(kind, other.kind)) return false;
    }
    return true;
  };

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
      if (edge.oneway && !target.forward) {
        target.car = 0;
        target.bus = 0;
        target.truck = 0;
        target.total = 0;
        continue;
      }
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

  /** the weight of turning into `edge`: its buses for a bus that can, else its load */
  const turnWeight = (edge: TrafficEdge, byBus: boolean): number =>
    byBus ? edge.bus : Math.max(edge.bel, 1);

  /**
   * Picks the road the vehicle takes at the end of its edge: none where that
   * end is an exit, the way back at a dead end, and otherwise another road,
   * weighted by load, one-way roads only their way. Where a one-way road
   * leads to nothing it may take, the vehicle leaves there like at an exit.
   */
  const chooseNext = (vehicle: TrafficVehicle): void => {
    const current = vehicle.edge;
    const nodeIndex = vehicle.forward ? edges[current].to : edges[current].from;
    const node = nodes[nodeIndex];
    if (node.exit) {
      vehicle.nextEdge = -1;
      return;
    }
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
      if (edge.oneway && !forward) return;
      options.push({ edge: edgeIndex, forward });
    });
    let next: { edge: number; forward: boolean };
    if (options.length === 0) {
      if (edges[current].oneway) {
        vehicle.nextEdge = -1;
        return;
      }
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
    vehicle.nextEdge = next.edge;
    vehicle.nextForward = next.forward;
  };

  /**
   * A new vehicle on `target`, fading in, in the first lane from a random one
   * on that has room. Returns false when none has. It starts where the road
   * enters the model (`entry`), or anywhere `along` it, but there at least
   * half its own distance from either end: a vehicle on the road beyond keeps
   * the other half, so the two are apart across the junction too.
   */
  const spawn = (target: DirectionTarget, place: "entry" | "along"): boolean => {
    const edge = edges[target.edge];
    const kind = pickKind(target);
    const margin = gapBetween(kind, kind) / 2;
    const travelled =
      place === "entry"
        ? 0
        : edge.length > 2 * margin
        ? margin + random() * (edge.length - 2 * margin)
        : edge.length / 2;
    const first = Math.floor(random() * edge.lanes);
    for (let step = 0; step < edge.lanes; step++) {
      const lane = (first + step) % edge.lanes;
      if (!hasRoom(edge.index, target.forward, lane, travelled, kind)) continue;
      const vehicle: TrafficVehicle = {
        id: 0,
        kind,
        edge: edge.index,
        forward: target.forward,
        travelled,
        pace: 1 + SPEED_SPREAD * (2 * random() - 1),
        speed: 0,
        lane,
        nextEdge: -1,
        nextForward: true,
        previousEdge: -1,
        previousForward: true,
        previousLane: 0,
        fade: 0,
        fading: 1,
      };
      chooseNext(vehicle);
      if (!hasRoomAtEnd(vehicle)) continue;
      vehicle.id = nextId++;
      setSpeed(vehicle, edge);
      vehicles.push(vehicle);
      addToLane(vehicle);
      addFeeder(vehicle);
      return true;
    }
    return false;
  };

  const spawnAnywhere = (): boolean => {
    if (targetTotal <= 0) return false;
    for (let tries = 0; tries < SPAWN_TRIES; tries++) {
      const target = targets[pickIndex(targetCumulative, random() * targetTotal)];
      if (spawn(target, "along")) return true;
    }
    return false;
  };

  const spawnAtEntry = (): boolean => {
    if (entryTotal <= 0) return false;
    for (let tries = 0; tries < SPAWN_TRIES; tries++) {
      const entry = entries[pickIndex(entryCumulative, random() * entryTotal)];
      if (spawn(entry, "entry")) return true;
    }
    return false;
  };

  /** vehicles that count towards the target: all but those on their way out */
  const stayingCount = (): number => {
    let count = 0;
    for (const vehicle of vehicles) if (vehicle.fading !== -1) count++;
    return count;
  };

  const rebalance = (): void => {
    sortLanes();
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
      // a full road turns one away; the next may find room elsewhere
      for (let i = 0; i < count; i++) spawnAnywhere();
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

  /**
   * Where the vehicle being moved was on its current edge when the step
   * began, 0 once it went on to another; it never backs up behind that.
   */
  let stepStart = 0;

  /**
   * The vehicle reached the end of its edge, `rest` metres past it: onto the
   * road it picked, in the lane with the most room, unless the last vehicle
   * there is too close, e.g. one that came in from the other side in the same
   * step. Then it waits on its edge, that vehicle's distance behind it.
   */
  const enterNext = (vehicle: TrafficVehicle, rest: number): "in" | "waits" => {
    const edge = edges[vehicle.nextEdge];
    const { lane, rear } = entryLane(edge.index, vehicle.nextForward, vehicle.lane);
    if (rear && rear !== vehicle) {
      const gap = gapBetween(rear.kind, vehicle.kind);
      if (rear.travelled - rest < gap) {
        const length = edges[vehicle.edge].length;
        vehicle.travelled = Math.max(
          stepStart,
          Math.min(length - WAIT_SHORT_OF_END, length + rear.travelled - gap)
        );
        return "waits";
      }
    }
    // it stays in the list it left until the next sort; `isIn` skips it there
    vehicle.previousEdge = vehicle.edge;
    vehicle.previousForward = vehicle.forward;
    vehicle.previousLane = vehicle.lane;
    vehicle.edge = edge.index;
    vehicle.forward = vehicle.nextForward;
    vehicle.lane = lane;
    vehicle.travelled = rest;
    stepStart = 0;
    addToLane(vehicle);
    setSpeed(vehicle, edge);
    chooseNext(vehicle);
    addFeeder(vehicle);
    return "in";
  };

  /**
   * How far along its edge `vehicle` may get before the junction at its end:
   * up to the last vehicle in the lane it takes on its next road, and up to
   * every vehicle bound for that lane that is closer to the junction, from
   * its own lane or another, each less the distance the two keep. Counted
   * along the roads, as if they met in a straight line, so the vehicles from
   * all lanes that merge there line up as one. Further out than the merge
   * zone the roads are apart and nothing limits it here; `reach` is how far
   * it may drive in this step.
   */
  const limitAtEnd = (vehicle: TrafficVehicle, reach: number): number => {
    if (vehicle.nextEdge < 0) return Infinity;
    const length = edges[vehicle.edge].length;
    const toGo = length - vehicle.travelled;
    if (toGo - reach > mergeZone) return Infinity;
    let limit = Infinity;
    const { rear } = entryLane(vehicle.nextEdge, vehicle.nextForward, vehicle.lane);
    if (rear && rear !== vehicle) {
      limit = length + rear.travelled - gapBetween(rear.kind, vehicle.kind);
    }
    for (const other of boundFor(intendedKey(vehicle))) {
      if (other === vehicle) continue;
      const otherToGo = edges[other.edge].length - other.travelled;
      if (otherToGo > mergeZone) continue;
      // the closer one goes first, the older one on a tie
      if (otherToGo > toGo || (otherToGo === toGo && other.id > vehicle.id)) {
        continue;
      }
      limit = Math.min(
        limit,
        length - otherToGo - gapBetween(other.kind, vehicle.kind)
      );
    }
    return limit;
  };

  /**
   * Whether a new vehicle is far enough from the junction ahead of it: behind
   * what drives into the same lane there before it, and ahead of what comes
   * after it from another lane.
   */
  const hasRoomAtEnd = (vehicle: TrafficVehicle): boolean => {
    if (vehicle.travelled > limitAtEnd(vehicle, 0)) return false;
    if (vehicle.nextEdge < 0) return true;
    const toGo = edges[vehicle.edge].length - vehicle.travelled;
    if (toGo > mergeZone) return true;
    for (const other of boundFor(intendedKey(vehicle))) {
      const otherToGo = edges[other.edge].length - other.travelled;
      if (otherToGo >= toGo && otherToGo - toGo < gapBetween(vehicle.kind, other.kind)) {
        return false;
      }
    }
    return true;
  };

  /**
   * The vehicle got to the end of its edge: onto its next road, across as
   * many short ones as it drove past, or off the network at an exit.
   */
  const goOn = (vehicle: TrafficVehicle): "in" | "waits" | "gone" => {
    // the count keeps a zero-length ring from spinning forever
    for (let hops = 0; hops < 16; hops++) {
      const edge = edges[vehicle.edge];
      if (vehicle.travelled < edge.length) return "in";
      if (vehicle.nextEdge < 0) return "gone";
      if (enterNext(vehicle, vehicle.travelled - edge.length) === "waits") {
        return hops === 0 ? "waits" : "in";
      }
    }
    return "in";
  };

  /** kept between steps to spare the garbage */
  const moved = new Set<TrafficVehicle>();
  const left = new Set<TrafficVehicle>();

  const advance = (seconds: number): void => {
    const fadeStep = fadeSeconds > 0 ? seconds / fadeSeconds : 1;
    for (let index = vehicles.length - 1; index >= 0; index--) {
      const vehicle = vehicles[index];
      if (vehicle.fading === 0) continue;
      vehicle.fade += vehicle.fading * fadeStep;
      if (vehicle.fade >= 1) {
        vehicle.fade = 1;
        vehicle.fading = 0;
      } else if (vehicle.fade <= 0) {
        // order does not matter, so the last one takes the free place
        const last = vehicles.pop();
        if (last && index < vehicles.length) vehicles[index] = last;
      }
    }

    // each lane front first, each vehicle up to the one ahead of it; the
    // front one looks ahead into its next road. A vehicle that reaches the
    // end goes on at once, so the one behind sees where it ended up.
    sortLanes();
    moved.clear();
    left.clear();
    for (const [key, list] of lanes) {
      const length = edges[Math.floor(key / 16)].length;
      let ahead: TrafficVehicle | null = null;
      /** where `ahead` is, in this lane's metres; past the end once it went on */
      let aheadAt = 0;
      // the list grows by vehicles coming in from other roads, all moved
      for (let index = 0; index < list.length; index++) {
        const vehicle = list[index];
        if (moved.has(vehicle)) {
          if (laneKey(vehicle.edge, vehicle.forward, vehicle.lane) === key) {
            ahead = vehicle;
            aheadAt = vehicle.travelled;
          }
          continue;
        }
        moved.add(vehicle);
        stepStart = vehicle.travelled;
        const behindAhead = ahead
          ? aheadAt - gapBetween(ahead.kind, vehicle.kind)
          : Infinity;
        const limit = Math.min(
          behindAhead,
          limitAtEnd(vehicle, vehicle.speed * seconds)
        );
        const wanted = vehicle.travelled + vehicle.speed * seconds;
        // too close already, e.g. after two merged: wait, never back up
        vehicle.travelled = Math.max(vehicle.travelled, Math.min(wanted, limit));
        const reached = vehicle.travelled;
        if (reached >= length) {
          const outcome = goOn(vehicle);
          if (outcome === "gone") {
            left.add(vehicle);
            ahead = null;
            continue;
          }
          ahead = vehicle;
          aheadAt = outcome === "waits" ? vehicle.travelled : reached;
          continue;
        }
        ahead = vehicle;
        aheadAt = reached;
      }
    }

    if (left.size > 0) {
      for (let index = vehicles.length - 1; index >= 0; index--) {
        if (!left.has(vehicles[index])) continue;
        const last = vehicles.pop();
        if (last && index < vehicles.length) vehicles[index] = last;
      }
      exitedSinceRebalance += left.size;
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
