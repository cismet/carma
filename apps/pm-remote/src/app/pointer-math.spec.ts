import {
  OneEuro2,
  SIDE_TURN,
  WRIST_LIMIT,
  WristPointer,
  axesFromEuler,
  axesFromQuaternion,
  calibrateCenter,
  calibrateEdge,
  forwardOf,
  hitOnTable,
  toModel,
  type DeviceAxes,
  type Vec3,
} from "./pointer-math";

const RAD = Math.PI / 180;

type Quaternion = [number, number, number, number];

const multiply = (
  [ax, ay, az, aw]: Quaternion,
  [bx, by, bz, bw]: Quaternion
): Quaternion => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

const about = (axis: 0 | 1 | 2, degrees: number): Quaternion => {
  const q: Quaternion = [0, 0, 0, Math.cos((degrees * RAD) / 2)];
  q[axis] = Math.sin((degrees * RAD) / 2);
  return q;
};

/** the spec's Z-X'-Y'' composition, as an orientation sensor reports it */
const quaternionFromEuler = (a: number, b: number, g: number): Quaternion =>
  multiply(multiply(about(2, a), about(0, b)), about(1, g));

const expectVec = (actual: Vec3 | readonly number[], expected: readonly number[]) =>
  expected.forEach((value, index) =>
    expect(actual[index]).toBeCloseTo(value, 6)
  );

/** a phone held like a remote, top edge `down` degrees below the horizon, turned `turn` degrees left */
const aim = (turn: number, down: number): DeviceAxes =>
  axesFromEuler(turn, -down, 0);

describe("device axes", () => {
  it("lies flat facing north with all angles zero", () => {
    const axes = axesFromEuler(0, 0, 0);
    expectVec(axes.top, [0, 1, 0]);
    expectVec(axes.back, [0, 0, -1]);
  });

  it("agrees between angles and quaternion", () => {
    for (const [a, b, g] of [
      [30, -40, 10],
      [200, -85, -60],
      [-15, -90, 45],
      [90, 170, 5],
    ]) {
      const fromEuler = axesFromEuler(a, b, g);
      const fromQuaternion = axesFromQuaternion(quaternionFromEuler(a, b, g));
      expectVec(fromQuaternion.top, fromEuler.top);
      expectVec(fromQuaternion.back, fromEuler.back);
    }
  });

  it("ignores the twist around the top edge for the aim", () => {
    expectVec(axesFromEuler(20, -50, 35).top, axesFromEuler(20, -50, 0).top);
  });
});

describe("forwardOf", () => {
  it("faces where a remote points", () => {
    expectVec(forwardOf(aim(0, 20)), [0, 1]);
    expectVec(forwardOf(aim(0, 45)), [0, 1]);
  });

  it("still faces ahead when the phone points straight down", () => {
    expectVec(forwardOf(aim(0, 90)), [0, 1]);
    expectVec(forwardOf(aim(90, 90)), [-1, 0]);
  });
});

describe("hitOnTable", () => {
  it("cuts the ray with the table one unit below", () => {
    expectVec(hitOnTable(aim(0, 45)), [0, 1]);
    expectVec(hitOnTable(aim(0, 90)), [0, 0]);
  });

  it("stays finite above the horizon", () => {
    const [x, y] = hitOnTable(aim(0, -30));
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });
});

describe("toModel", () => {
  const scale = 0.5;

  it("puts the calibration aim on the middle", () => {
    const calibration = calibrateCenter(aim(0, 45), SIDE_TURN.bottom, scale);
    expectVec(toModel(calibration, aim(0, 45)), [0, 0]);
  });

  it("moves right and away like the hand, standing at the bottom edge", () => {
    const calibration = calibrateCenter(aim(0, 45), SIDE_TURN.bottom, scale);
    const [rightX, rightY] = toModel(calibration, aim(-10, 45));
    expect(rightX).toBeGreaterThan(0);
    expect(Math.abs(rightY)).toBeLessThan(Math.abs(rightX));
    // raising the aim reaches further across the table, which is north
    const [, awayY] = toModel(calibration, aim(0, 35));
    expect(awayY).toBeLessThan(0);
  });

  it("turns the model with the side the presenter stands at", () => {
    // at the left edge, facing east: away is east, the hand's right is south
    const calibration = calibrateCenter(aim(0, 45), SIDE_TURN.left, scale);
    const [awayX] = toModel(calibration, aim(0, 35));
    expect(awayX).toBeGreaterThan(0);
    const [, rightY] = toModel(calibration, aim(-10, 45));
    expect(rightY).toBeGreaterThan(0);
  });

  it("does not depend on the arbitrary world heading", () => {
    const a = calibrateCenter(aim(0, 45), SIDE_TURN.bottom, scale);
    const b = calibrateCenter(aim(137, 45), SIDE_TURN.bottom, scale);
    expectVec(toModel(b, aim(137 - 12, 38)), toModel(a, aim(-12, 38)));
  });
});

describe("calibrateEdge", () => {
  it("makes the edge aim land on the middle of the right edge", () => {
    const center = calibrateCenter(aim(0, 45), SIDE_TURN.left, 0.1);
    const edge = aim(-20, 42);
    const result = calibrateEdge(center, edge);
    expect(result).not.toBeNull();
    if (result) {
      expectVec(toModel(result.calibration, edge), [0.5, 0]);
      expectVec(toModel(result.calibration, aim(0, 45)), [0, 0]);
    }
  });

  it("gives the turn a later centring can reuse", () => {
    const center = calibrateCenter(aim(0, 45), SIDE_TURN.bottom, 0.1);
    const result = calibrateEdge(center, aim(-20, 45));
    expect(result).not.toBeNull();
    if (result) {
      const again = calibrateCenter(aim(0, 45), result.turn, result.calibration.scale);
      expectVec(again.east, result.calibration.east);
    }
  });

  it("refuses two aims at the same point", () => {
    const center = calibrateCenter(aim(0, 45), SIDE_TURN.bottom, 0.1);
    expect(calibrateEdge(center, aim(0, 45))).toBeNull();
  });
});

describe("WristPointer", () => {
  const gain = 1 / 35;

  const moved = (from: DeviceAxes, to: DeviceAxes) => {
    const wrist = new WristPointer();
    wrist.anchor(from);
    return wrist.update(to, gain);
  };

  for (const [grip, down] of [
    ["at a wall", 5],
    ["at a table", 45],
    ["straight down", 88],
  ] as const) {
    it(`moves right with the hand turned right, aimed ${grip}`, () => {
      const [x, y] = moved(aim(30, down), aim(20, down));
      expect(x).toBeCloseTo(10 * gain, 3);
      expect(Math.abs(y)).toBeLessThan(1e-3);
    });

    it(`moves up with the hand tipped up, aimed ${grip}`, () => {
      const [x, y] = moved(aim(0, down), aim(0, down - 2));
      expect(y).toBeCloseTo(-2 * gain, 3);
      expect(Math.abs(x)).toBeLessThan(1e-3);
    });
  }

  it("goes on across straight down without a jump", () => {
    const [, y] = moved(aim(0, 89), aim(0, 91));
    expect(y).toBeCloseTo(2 * gain, 3);
  });

  it("stops at the edge and turns back at once", () => {
    const wrist = new WristPointer();
    wrist.anchor(aim(0, 30));
    wrist.update(aim(-60, 30), gain);
    expect(wrist.position[0]).toBe(WRIST_LIMIT[0]);
    const [x] = wrist.update(aim(-55, 30), gain);
    expect(x).toBeCloseTo(WRIST_LIMIT[0] - 5 * gain, 6);
  });

  it("does not move on the reading that anchors it", () => {
    const wrist = new WristPointer();
    wrist.center(null);
    expect(wrist.update(aim(40, 20), gain)).toEqual([0, 0]);
  });
});

describe("OneEuro2", () => {
  it("passes the first value and follows a steady one", () => {
    const filter = new OneEuro2();
    expectVec(filter.filter([0.2, 0.1], 0).value, [0.2, 0.1]);
    let last = filter.filter([0.2, 0.1], 16).value;
    for (let t = 32; t < 2000; t += 16) {
      last = filter.filter([0.4, 0.1], t).value;
    }
    expect(last[0]).toBeCloseTo(0.4, 3);
  });

  it("damps tremor around a still point", () => {
    const filter = new OneEuro2();
    let spread = 0;
    for (let i = 0; i < 200; i++) {
      const jitter = i % 2 === 0 ? 0.01 : -0.01;
      const { value } = filter.filter([jitter, 0], i * 16);
      if (i > 50) {
        spread = Math.max(spread, Math.abs(value[0]));
      }
    }
    expect(spread).toBeLessThan(0.005);
  });
});
