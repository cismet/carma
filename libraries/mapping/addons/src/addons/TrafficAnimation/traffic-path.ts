import type { TrafficEdge } from "./traffic-network";
import type { TrafficVehicle } from "./traffic-sim";

/**
 * Where a vehicle is drawn. Not from one point of the road's centre line, but
 * from two: its rear and its front axle, both on its lane. The body lies along
 * the line between them, so a vehicle turns the way a car does: the front
 * swings into the corner first, the rear follows and cuts it, and nothing
 * jumps when the middle of the body passes a bend.
 *
 * The lane is the centre line shifted to the right of travel by the lane's
 * offset, with the shifted pieces joined where they meet (a mitre). At a
 * junction the join is made with the road the vehicle came from or the one it
 * takes next, which the sim knows. A point on the lane therefore passes every
 * corner without a jump. The join is spread over `CORNER_REACH` metres either
 * side of the corner: in between, the lane runs exactly its offset from the
 * line. A very sharp corner gets a shorter join than the mitre, and a U-turn
 * at a dead end turns round a point ahead of the end; that loop is narrower
 * than the wheelbase, so the body swings round quickly at its tip.
 *
 * Where the offset changes at a junction (into another lane, from a two-way
 * road onto a one-way ramp), it blends over `OFFSET_BLEND` metres on either
 * side.
 *
 * The distances along the lane are the sim's, measured on the centre line;
 * only the drawing moves off it. The sim picks one road ahead, so an axle that
 * reaches past a road shorter than half the wheelbase goes straight on until
 * the vehicle is on that road and knows the one after it.
 */

/** metres either side of a corner over which the lane's join is spread */
const CORNER_REACH = 25;
/** metres either side of a junction over which a change of offset blends */
const OFFSET_BLEND = 10;
/** the longest join, in offsets; sharper corners are cut short (about 120°) */
const MITER_LIMIT = 2;

/** where a vehicle's body is drawn: its middle and the way it points */
export type VehiclePose = {
  x: number;
  y: number;
  /** unit vector from the rear to the front */
  dx: number;
  dy: number;
};

/**
 * How far right of the centre line, in the direction of travel, the middle of
 * `lane` runs. A two-way road's lanes lie right of its line, a one-way road's
 * across it.
 */
export const laneOffset = (
  edge: Pick<TrafficEdge, "oneway" | "lanes">,
  lane: number,
  laneWidth: number
): number =>
  edge.oneway
    ? (lane - (edge.lanes - 1) / 2) * laneWidth
    : (lane + 0.5) * laneWidth;

type Vec = { x: number; y: number };

/** one road of a vehicle's way, in the direction it drives it */
type Leg = {
  edge: TrafficEdge;
  forward: boolean;
  /** metres right of the centre line */
  offset: number;
};

export type VehiclePlacer = {
  /**
   * The pose of `vehicle` with its axles `wheelbase` metres apart, written
   * into `out`.
   */
  place: (
    vehicle: TrafficVehicle,
    wheelbase: number,
    out: VehiclePose
  ) => VehiclePose;
};

export const createVehiclePlacer = (
  edges: readonly TrafficEdge[],
  laneWidth: number
): VehiclePlacer => {
  // the vehicle's way: the road it came from, its road, the road it takes next
  const legs: Leg[] = [0, 1, 2].map(() => ({
    edge: edges[0],
    forward: true,
    offset: 0,
  }));
  let legCount = 0;
  let current = 0;

  const a: Vec = { x: 0, y: 0 };
  const b: Vec = { x: 0, y: 0 };
  const direction: Vec = { x: 0, y: 0 };
  const joinStart: Vec = { x: 0, y: 0 };
  const joinEnd: Vec = { x: 0, y: 0 };
  const rear: Vec = { x: 0, y: 0 };
  const front: Vec = { x: 0, y: 0 };

  const lastVertex = (leg: Leg): number => leg.edge.cumulative.length - 1;

  /** the index in the data of the leg's vertex `j`, counted the way it is driven */
  const dataIndex = (leg: Leg, j: number): number =>
    leg.forward ? j : lastVertex(leg) - j;

  const vertexX = (leg: Leg, j: number): number =>
    leg.edge.points[2 * dataIndex(leg, j)];
  const vertexY = (leg: Leg, j: number): number =>
    leg.edge.points[2 * dataIndex(leg, j) + 1];

  /** the unit direction of the leg's piece from vertex `j` to `j + 1`; false if it has no length */
  const pieceDirection = (leg: Leg, j: number, out: Vec): boolean => {
    const dx = vertexX(leg, j + 1) - vertexX(leg, j);
    const dy = vertexY(leg, j + 1) - vertexY(leg, j);
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return false;
    out.x = dx / length;
    out.y = dy / length;
    return true;
  };

  /** the direction the leg arrives at vertex `j` in, skipping pieces without length */
  const directionInto = (leg: Leg, j: number, out: Vec): Vec => {
    for (let k = j - 1; k >= 0; k--) if (pieceDirection(leg, k, out)) return out;
    for (let k = j; k < lastVertex(leg); k++) {
      if (pieceDirection(leg, k, out)) return out;
    }
    out.x = 1;
    out.y = 0;
    return out;
  };

  /** the direction the leg leaves vertex `j` in, skipping pieces without length */
  const directionFrom = (leg: Leg, j: number, out: Vec): Vec => {
    for (let k = j; k < lastVertex(leg); k++) {
      if (pieceDirection(leg, k, out)) return out;
    }
    for (let k = j - 1; k >= 0; k--) if (pieceDirection(leg, k, out)) return out;
    out.x = 1;
    out.y = 0;
    return out;
  };

  /**
   * The join of a corner arrived at in direction `into` and left in `from`:
   * the vector that, times an offset, goes from the corner to where the two
   * shifted pieces meet. Right of travel is (y, -x).
   */
  const join = (into: Vec, from: Vec, out: Vec): Vec => {
    const sx = into.y + from.y;
    const sy = -into.x - from.x;
    const square = sx * sx + sy * sy;
    if (square < 1e-12) {
      // straight back the way it came: round a point ahead of the end
      out.x = into.x;
      out.y = into.y;
      return out;
    }
    const scale = Math.min(2 / square, MITER_LIMIT / Math.sqrt(square));
    out.x = sx * scale;
    out.y = sy * scale;
    return out;
  };

  /** the join at the leg's vertex `j`, with the neighbouring legs at its ends */
  const joinAtVertex = (index: number, j: number, out: Vec): Vec => {
    const leg = legs[index];
    const last = lastVertex(leg);
    if (j > 0 && j < last) {
      return join(directionInto(leg, j, a), directionFrom(leg, j, b), out);
    }
    if (j === 0) {
      directionFrom(leg, 0, b);
      if (index === 0) {
        out.x = b.y;
        out.y = -b.x;
        return out;
      }
      const before = legs[index - 1];
      return join(directionInto(before, lastVertex(before), a), b, out);
    }
    directionInto(leg, last, a);
    if (index === legCount - 1) {
      out.x = a.y;
      out.y = -a.x;
      return out;
    }
    return join(a, directionFrom(legs[index + 1], 0, b), out);
  };

  /** the leg's offset `along` metres into it, blended with its neighbours' */
  const offsetAt = (index: number, along: number): number => {
    const leg = legs[index];
    const blend = Math.min(OFFSET_BLEND, leg.edge.length / 2);
    if (index > 0 && along < blend) {
      const atStart = (legs[index - 1].offset + leg.offset) / 2;
      return atStart + (leg.offset - atStart) * (Math.max(0, along) / blend);
    }
    if (index < legCount - 1 && along > leg.edge.length - blend) {
      const atEnd = (leg.offset + legs[index + 1].offset) / 2;
      const into = Math.min(along, leg.edge.length) - (leg.edge.length - blend);
      return leg.offset + (atEnd - leg.offset) * (into / blend);
    }
    return leg.offset;
  };

  /** the point on the lane `s` metres along the way from the start of the vehicle's road */
  const lanePoint = (s: number, out: Vec): Vec => {
    let index = current;
    let along = s;
    if (along < 0 && index > 0) {
      index--;
      along += legs[index].edge.length;
    } else if (along > legs[index].edge.length && index < legCount - 1) {
      along -= legs[index].edge.length;
      index++;
    }
    const leg = legs[index];
    const { cumulative, length } = leg.edge;
    const last = lastVertex(leg);

    // off either end of the way: straight on, the way the end points
    if (along <= 0 || along >= length) {
      const atEnd = along >= length;
      const j = atEnd ? last : 0;
      if (atEnd) directionInto(leg, last, direction);
      else directionFrom(leg, 0, direction);
      joinAtVertex(index, j, joinStart);
      const offset = offsetAt(index, along);
      const beyond = atEnd ? along - length : along;
      out.x = vertexX(leg, j) + direction.x * beyond + joinStart.x * offset;
      out.y = vertexY(leg, j) + direction.y * beyond + joinStart.y * offset;
      return out;
    }

    // the piece it lies on, by bisection over the cumulative lengths
    const inData = leg.forward ? along : length - along;
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] <= inData) low = middle;
      else high = middle;
    }
    const j = leg.forward ? low : last - high;
    const piece = cumulative[high] - cumulative[low];
    const offset = offsetAt(index, along);
    joinAtVertex(index, j, joinStart);
    if (piece <= 0 || !pieceDirection(leg, j, direction)) {
      out.x = vertexX(leg, j) + joinStart.x * offset;
      out.y = vertexY(leg, j) + joinStart.y * offset;
      return out;
    }
    joinAtVertex(index, j + 1, joinEnd);
    const local = leg.forward ? inData - cumulative[low] : cumulative[high] - inData;

    // the join at each end, fading to the plain offset within `reach`
    const reach = Math.min(CORNER_REACH, piece / 2);
    const nx = direction.y;
    const ny = -direction.x;
    let wx = nx;
    let wy = ny;
    if (local < reach) {
      const t = local / reach;
      wx = joinStart.x + (nx - joinStart.x) * t;
      wy = joinStart.y + (ny - joinStart.y) * t;
    } else if (local > piece - reach) {
      const t = (local - (piece - reach)) / reach;
      wx = nx + (joinEnd.x - nx) * t;
      wy = ny + (joinEnd.y - ny) * t;
    }
    out.x = vertexX(leg, j) + direction.x * local + wx * offset;
    out.y = vertexY(leg, j) + direction.y * local + wy * offset;
    return out;
  };

  const setLeg = (
    leg: Leg,
    edge: TrafficEdge,
    forward: boolean,
    lane: number
  ): void => {
    leg.edge = edge;
    leg.forward = forward;
    leg.offset = laneOffset(edge, Math.min(lane, edge.lanes - 1), laneWidth);
  };

  const place = (
    vehicle: TrafficVehicle,
    wheelbase: number,
    out: VehiclePose
  ): VehiclePose => {
    legCount = 0;
    if (vehicle.previousEdge >= 0) {
      setLeg(
        legs[legCount++],
        edges[vehicle.previousEdge],
        vehicle.previousForward,
        vehicle.previousLane
      );
    }
    current = legCount;
    setLeg(legs[legCount++], edges[vehicle.edge], vehicle.forward, vehicle.lane);
    if (vehicle.nextEdge >= 0) {
      // the lane it heads for there, as the sim picks it while it has room
      setLeg(
        legs[legCount++],
        edges[vehicle.nextEdge],
        vehicle.nextForward,
        vehicle.lane
      );
    }

    lanePoint(vehicle.travelled - wheelbase / 2, rear);
    lanePoint(vehicle.travelled + wheelbase / 2, front);
    const dx = front.x - rear.x;
    const dy = front.y - rear.y;
    const length = Math.hypot(dx, dy);
    out.x = (rear.x + front.x) / 2;
    out.y = (rear.y + front.y) / 2;
    if (length > 1e-6) {
      out.dx = dx / length;
      out.dy = dy / length;
    } else {
      directionFrom(legs[current], 0, direction);
      out.dx = direction.x;
      out.dy = direction.y;
    }
    return out;
  };

  return { place };
};
