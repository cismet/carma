import { describe, expect, it } from "vitest";

import type { TrafficEdge } from "./traffic-network";
import { createVehiclePlacer, type VehiclePose } from "./traffic-path";
import { VEHICLE_CAR, type TrafficVehicle } from "./traffic-sim";

const LANE_WIDTH = 5;
const WHEELBASE = 6.75;
/** metres between two samples of a drive */
const STEP = 0.05;

/** an edge through `coordinates`, in scene metres */
const edge = (
  index: number,
  coordinates: [number, number][],
  options: Partial<TrafficEdge> = {}
): TrafficEdge => {
  const points = new Float64Array(coordinates.flat());
  const cumulative = new Float64Array(coordinates.length);
  let length = 0;
  for (let i = 1; i < coordinates.length; i++) {
    length += Math.hypot(
      coordinates[i][0] - coordinates[i - 1][0],
      coordinates[i][1] - coordinates[i - 1][1]
    );
    cumulative[i] = length;
  }
  return {
    index,
    name: "",
    bel: 1000,
    bus: 0,
    lanes: 1,
    oneway: false,
    from: 0,
    to: 0,
    points,
    cumulative,
    length,
    ...options,
  };
};

const vehicle = (state: Partial<TrafficVehicle>): TrafficVehicle => ({
  id: 1,
  kind: VEHICLE_CAR,
  edge: 0,
  forward: true,
  travelled: 0,
  pace: 1,
  speed: 10,
  lane: 0,
  nextEdge: -1,
  nextForward: true,
  previousEdge: -1,
  previousForward: true,
  previousLane: 0,
  waited: 0,
  heldBy: null,
  fade: 1,
  fading: 0,
  ...state,
});

const poseOf = (
  edges: TrafficEdge[],
  state: Partial<TrafficVehicle>
): VehiclePose =>
  createVehiclePlacer(edges, LANE_WIDTH).place(vehicle(state), WHEELBASE, {
    x: 0,
    y: 0,
    dx: 1,
    dy: 0,
  });

/** the poses of a drive over each stretch, one every `STEP` metres */
const drive = (
  edges: TrafficEdge[],
  stretches: { state: Partial<TrafficVehicle>; from: number; to: number }[]
): VehiclePose[] => {
  const poses: VehiclePose[] = [];
  for (const { state, from, to } of stretches) {
    for (let travelled = from; travelled <= to + 1e-9; travelled += STEP) {
      poses.push(poseOf(edges, { ...state, travelled }));
    }
  }
  return poses;
};

/** the largest move of the body's middle and the largest turn between two samples */
const largestChange = (poses: VehiclePose[]) => {
  let move = 0;
  let turn = 0;
  for (let i = 1; i < poses.length; i++) {
    const [a, b] = [poses[i - 1], poses[i]];
    move = Math.max(move, Math.hypot(b.x - a.x, b.y - a.y));
    const cosine = Math.max(-1, Math.min(1, a.dx * b.dx + a.dy * b.dy));
    turn = Math.max(turn, (Math.acos(cosine) * 180) / Math.PI);
  }
  return { move, turn };
};

const expectPose = (pose: VehiclePose, x: number, y: number, dx: number, dy: number) => {
  expect(pose.x).toBeCloseTo(x, 6);
  expect(pose.y).toBeCloseTo(y, 6);
  expect(pose.dx).toBeCloseTo(dx, 6);
  expect(pose.dy).toBeCloseTo(dy, 6);
};

describe("createVehiclePlacer", () => {
  const east = edge(0, [
    [0, 0],
    [100, 0],
  ]);

  it("puts a vehicle on a straight road in its lane, pointing the way it drives", () => {
    expectPose(poseOf([east], { travelled: 50 }), 50, -2.5, 1, 0);
    expectPose(poseOf([east], { travelled: 50, forward: false }), 50, 2.5, -1, 0);
    const wide = edge(0, [[0, 0], [100, 0]], { lanes: 2 });
    expectPose(poseOf([wide], { travelled: 50, lane: 1 }), 50, -7.5, 1, 0);
  });

  it("centres the lanes of a one-way road on its line", () => {
    const oneway = edge(0, [[0, 0], [100, 0]], { oneway: true, lanes: 2 });
    expectPose(poseOf([oneway], { travelled: 50 }), 50, 2.5, 1, 0);
    expectPose(poseOf([oneway], { travelled: 50, lane: 1 }), 50, -2.5, 1, 0);
  });

  describe.each([
    ["left", 100],
    ["right", -100],
  ])("at a junction turning %s", (_, northing) => {
    const onward = edge(1, [
      [100, 0],
      [100, northing],
    ]);
    const edges = [east, onward];
    const stretches = [
      { state: { edge: 0, nextEdge: 1 }, from: 60, to: 100 },
      { state: { edge: 1, previousEdge: 0 }, from: 0, to: 40 },
    ];

    it("turns without a jump", () => {
      const { move, turn } = largestChange(drive(edges, stretches));
      expect(move).toBeLessThan(2 * STEP);
      expect(turn).toBeLessThan(2);
    });

    it("looks the same the moment before and after it changes road", () => {
      const before = poseOf(edges, { edge: 0, nextEdge: 1, travelled: 100 });
      const after = poseOf(edges, { edge: 1, previousEdge: 0, travelled: 0 });
      expectPose(after, before.x, before.y, before.dx, before.dy);
    });

    it("ends up in its lane on the new road", () => {
      const sign = Math.sign(northing);
      const pose = poseOf(edges, { edge: 1, previousEdge: 0, travelled: 40 });
      expectPose(pose, 100 + sign * 2.5, sign * 40, 0, sign);
    });
  });

  it("passes a bend inside one road without a jump", () => {
    const bent = edge(0, [
      [0, 0],
      [50, 0],
      [50 + 50 * Math.cos(Math.PI / 3), 50 * Math.sin(Math.PI / 3)],
    ]);
    const { move, turn } = largestChange(
      drive([bent], [{ state: {}, from: 20, to: 80 }])
    );
    expect(move).toBeLessThan(2 * STEP);
    expect(turn).toBeLessThan(2);
  });

  it("passes a point given twice without a jump", () => {
    const doubled = edge(0, [
      [0, 0],
      [50, 0],
      [50, 0],
      [50, 50],
    ]);
    const { move, turn } = largestChange(
      drive([doubled], [{ state: {}, from: 20, to: 80 }])
    );
    expect(move).toBeLessThan(2 * STEP);
    expect(turn).toBeLessThan(2);
  });

  it("changes lanes at a junction gradually", () => {
    const wide = edge(0, [[0, 0], [100, 0]], { lanes: 2 });
    const narrow = edge(1, [[100, 0], [200, 0]]);
    const edges = [wide, narrow];
    const { move } = largestChange(
      drive(edges, [
        { state: { edge: 0, lane: 1, nextEdge: 1 }, from: 50, to: 100 },
        { state: { edge: 1, previousEdge: 0, previousLane: 1 }, from: 0, to: 50 },
      ])
    );
    expect(move).toBeLessThan(2 * STEP);
    expectPose(poseOf(edges, { edge: 0, lane: 1, nextEdge: 1, travelled: 50 }), 50, -7.5, 1, 0);
    expectPose(
      poseOf(edges, { edge: 1, previousEdge: 0, previousLane: 1, travelled: 50 }),
      150,
      -2.5,
      1,
      0
    );
  });

  it("turns round at a dead end without a jump", () => {
    const poses = drive(
      [east],
      [
        { state: { nextEdge: 0, nextForward: false }, from: 60, to: 100 },
        { state: { forward: false, previousEdge: 0 }, from: 0, to: 40 },
      ]
    );
    const { move, turn } = largestChange(poses);
    expect(move).toBeLessThan(2 * STEP);
    // the loop is as wide as the road, narrower than the wheelbase, so the
    // body swings round quickly at its tip; but it swings, it does not flip
    expect(turn).toBeLessThan(12);
    expectPose(poses[poses.length - 1], 60, 2.5, -1, 0);
  });

  it("drives straight on off the end of the network", () => {
    expectPose(poseOf([east], { travelled: 100 }), 100, -2.5, 1, 0);
  });
});
