import * as THREE from "three";

import { gloss, type LowPolyBuilder, type V3 } from "./lowpoly";
import { person, type PersonPose } from "./models";
import { hash, type Point } from "./site-frame";

/**
 * Playground equipment in real sizes (metres), each with children on it.
 * Frame as in models.ts: x forward, y up, z to the right, standing on
 * y = 0. `seed` (0 to 1) varies the children.
 */

const POST = "#a8754a";
const POST_DARK = "#8a5d39";
const ROPE = "#b8443a";
const HEMP = "#c9a26b";
const CHAIN = "#7d8288";
const RUBBER = "#26282a";
const STEEL = "#8a8f94";
const STAINLESS = gloss("#c8ccd0");
const RED = "#d8462c";
const BLUE = "#2f7fd1";
const YELLOW = "#f2c12e";
const GREEN = "#3fa34d";
const ORANGE = "#e0702c";

const yawTo = (dx: number, dz: number): number => Math.atan2(-dz, dx);

const lerp = (a: V3, c: V3, t: number): V3 => [
  a[0] + (c[0] - a[0]) * t,
  a[1] + (c[1] - a[1]) * t,
  a[2] + (c[2] - a[2]) * t,
];

/** a child of 1.05 to 1.2 m at `at`, facing `yaw`; `seat` in metres */
const kid = (
  b: LowPolyBuilder,
  at: V3,
  yaw: number,
  seed: number,
  pose: PersonPose = {}
): void => {
  const scale = 0.6 + 0.09 * hash(seed * 100, at[0] + at[2], 1);
  b.transformed(
    new THREE.Matrix4()
      .makeTranslation(at[0], at[1], at[2])
      .multiply(new THREE.Matrix4().makeRotationY(yaw)),
    () =>
      person(b, hash(seed * 100, at[0] - at[2], 2), {
        ...pose,
        seat: pose.seat === undefined ? undefined : pose.seat / scale,
        scale,
      })
  );
};

/** a rope or chain as a polyline */
const line = (
  b: LowPolyBuilder,
  points: readonly V3[],
  radius: number,
  paint: string
): void => {
  for (let i = 0; i + 1 < points.length; i++)
    b.rod(points[i], points[i + 1], radius, paint, 4);
};

/** two A-frames at x = ±half joined by a top beam `height` up */
const aFrames = (
  b: LowPolyBuilder,
  half: number,
  height: number,
  spread: number
): void => {
  for (const x of [-half, half]) {
    for (const side of [-1, 1])
      b.beam([x, 0, side * spread], [x, height, 0], 0.12, POST, 0.12);
    b.beam([x, 0.9, -spread * 0.66], [x, 0.9, spread * 0.66], 0.08, POST, 0.08);
  }
  b.beam(
    [-half - 0.2, height + 0.03, 0],
    [half + 0.2, height + 0.03, 0],
    0.14,
    POST_DARK,
    0.14
  );
};

type Side = "+x" | "-x" | "+z" | "-z";

/** a tower 1.6 m square at (cx, cz): posts, deck `deck` up, coloured
 * panels on the closed sides, pyramid roof */
const tower = (
  b: LowPolyBuilder,
  cx: number,
  cz: number,
  deck: number,
  roof: string,
  panel: string,
  open: readonly Side[]
): void => {
  const h = 0.75;
  const top = deck + 1.95;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box([cx + sx * h, top / 2, cz + sz * h], [0.12, top, 0.12], POST);
  b.box([cx, deck, cz], [1.6, 0.08, 1.6], POST_DARK);
  const sides: readonly (readonly [Side, V3, V3])[] = [
    ["+x", [cx + h, deck + 0.5, cz], [0.04, 0.75, 1.38]],
    ["-x", [cx - h, deck + 0.5, cz], [0.04, 0.75, 1.38]],
    ["+z", [cx, deck + 0.5, cz + h], [1.38, 0.75, 0.04]],
    ["-z", [cx, deck + 0.5, cz - h], [1.38, 0.75, 0.04]],
  ];
  for (const [side, at, size] of sides)
    if (!open.includes(side)) b.box(at, size, gloss(panel));
  b.cone([cx, top, cz], 1.3, 0.95, 4, gloss(roof), Math.PI / 4);
};

/** a slide's bed and side walls along a top line (x, y) in its own frame,
 * the bed `width` across */
const chute = (
  b: LowPolyBuilder,
  top: readonly Point[],
  width: number,
  paint: Parameters<LowPolyBuilder["box"]>[2]
): void => {
  const band = (up: number, down: number): Point[] => [
    ...top.map(([x, y]) => [x, y + up] as const),
    ...[...top].reverse().map(([x, y]) => [x, y - down] as const),
  ];
  b.profile(band(0, 0.07), width, paint, { bevel: 0.02 });
  for (const side of [-1, 1])
    b.profile(band(0.3, 0.02), 0.04, paint, {
      offset: side * (width / 2 + 0.02),
    });
};

/**
 * Two towers joined by a rope bridge: a wave slide off the low one, a tube
 * slide winding down from the high one, a climbing wall and a cargo net up;
 * about 13 m by 9 m, centred.
 */
export const towerCombo = (b: LowPolyBuilder, seed: number): void =>
  b.transformed(new THREE.Matrix4().makeTranslation(-1.25, 0, 0.9), () => {
    tower(b, -3.2, 0, 1.5, RED, YELLOW, ["+x", "-z", "-x"]);
    tower(b, 3.2, 0, 2.2, BLUE, GREEN, ["-x", "+z", "+x"]);

    // rope bridge, sagging between the decks
    const planks = 14;
    const bridge = (t: number): V3 => [
      -2.45 + 4.9 * t,
      1.5 + 0.7 * t - 0.28 * Math.sin(Math.PI * t),
      0,
    ];
    for (let i = 0; i <= planks; i++) {
      const [x, y] = bridge(i / planks);
      b.box([x, y, 0], [0.13, 0.04, 0.8], POST);
    }
    for (const side of [-1, 1]) {
      const rail = Array.from({ length: planks + 1 }, (_, i): V3 => {
        const [x, y] = bridge(i / planks);
        return [x, y + 0.85, side * 0.42];
      });
      line(b, rail, 0.02, HEMP);
      for (let i = 1; i < planks; i += 3) {
        const [x, y] = bridge(i / planks);
        b.rod([x, y, side * 0.42], [x, y + 0.85, side * 0.42], 0.015, HEMP, 4);
      }
    }
    kid(b, bridge(0.55), 0, seed, { legs: "walk", arms: "forward" });

    // wave slide off the low tower towards -z
    b.transformed(
      new THREE.Matrix4()
        .makeTranslation(-3.2, 0, -0.75)
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)),
      () => {
        const wave = (x: number) =>
          x >= 4
            ? 0.3
            : 1.5 - 1.2 * (x / 4) + 0.18 * Math.sin((2 * Math.PI * x) / 2);
        const top: Point[] = [];
        for (let x = 0; x <= 4.6001; x += 0.2) top.push([x, wave(x)]);
        chute(b, top, 0.6, gloss(YELLOW));
        for (const x of [2.0, 4.3])
          b.rod([x, 0, 0], [x, wave(x) - 0.07, 0], 0.05, STEEL);
        kid(b, [2.6, wave(2.6) + 0.04, 0], 0, seed + 0.1, {
          legs: "straight",
          seat: 0,
          arms: "up",
        });
      }
    );

    // tube slide winding down from the high tower towards +z
    const tube: V3[] = [
      [3.2, 2.35, 0.9],
      [3.2, 2.0, 2.3],
      [3.9, 1.6, 3.3],
      [5.1, 1.15, 3.6],
      [6.2, 0.7, 3.1],
      [6.9, 0.4, 2.2],
    ];
    const tubePaint = gloss(BLUE);
    for (let i = 0; i + 1 < tube.length; i++)
      b.rod(tube[i], tube[i + 1], 0.42, tubePaint, 10);
    for (const joint of tube.slice(1, -1))
      b.blob(joint, [0.42, 0.42, 0.42], tubePaint, 0, 1);
    const exit: V3 = [7.3, 0.3, 1.6];
    b.beam(tube[tube.length - 1], exit, 0.7, tubePaint, 0.08);
    for (const [x, y, z] of tube.slice(2, 5))
      b.rod([x, 0, z], [x, y - 0.42, z], 0.06, STEEL);
    kid(b, [7.7, 0, 1.0], yawTo(0.5, -0.8), seed + 0.2, { arms: "up" });

    // climbing wall up to the low tower, cargo net up to the high one
    b.beam([-5.05, 0, 0], [-3.95, 1.5, 0], 1.3, gloss(RED), 0.06);
    const holds = ["#f2c12e", "#2f7fd1", "#3fa34d", "#f2f2ee"];
    for (let i = 0; i < 9; i++) {
      const t = 0.12 + 0.09 * i;
      const z = (hash(i, seed * 10, 3) - 0.5) * 0.9;
      b.blob(
        [-5.05 + 1.1 * t - 0.035, 1.5 * t + 0.03, z],
        [0.05, 0.04, 0.06],
        holds[i % holds.length],
        i
      );
    }
    kid(b, [-4.85, 0.35, 0.25], 0, seed + 0.3, { arms: "up" });
    const netTop = 2.2;
    for (let i = 0; i < 5; i++) {
      const z = -0.6 + 0.3 * i;
      b.rod([3.95, netTop, z], [5.55, 0, z], 0.018, ROPE, 4);
    }
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      b.rod(
        [3.95 + 1.6 * t, netTop * (1 - t), -0.6],
        [3.95 + 1.6 * t, netTop * (1 - t), 0.6],
        0.018,
        ROPE,
        4
      );
    }
    kid(b, [3.2, 2.24, -0.2], yawTo(-1, 0.3), seed + 0.4, { arms: "up" });
  });

/**
 * A zip line `length` metres along x: a platform with steps at x = 0, the
 * cable sagging to an A-frame at the far end, a child riding the seat.
 */
export const zipLine = (
  b: LowPolyBuilder,
  length: number,
  seed: number
): void => {
  // platform with steps up from -x
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box([sx * 0.75, 0.62, sz * 0.75], [0.12, 1.24, 0.12], POST);
  b.box([0, 1.24, 0], [1.6, 0.08, 1.6], POST_DARK);
  for (const side of [-1, 1])
    b.box([0, 1.72, side * 0.78], [1.5, 0.12, 0.05], POST);
  for (let i = 0; i < 4; i++)
    b.box([-1.05 - 0.3 * i, 1.0 - 0.3 * i, 0], [0.3, 0.06, 0.9], POST_DARK);
  for (const side of [-1, 1])
    b.beam([-0.85, 1.24, side * 0.48], [-2.15, 0.1, side * 0.48], 0.06, POST, 0.14);
  // the masts the cable hangs between
  const start: V3 = [0.9, 3.75, 0];
  const end: V3 = [length, 3.15, 0];
  for (const [x, height] of [
    [0.9, 3.85],
    [length, 3.25],
  ] as const)
    for (const side of [-1, 1])
      b.beam([x, 0, side * 1.1], [x, height, 0], 0.14, POST, 0.14);
  const sag = (t: number): V3 => {
    const [x, y] = lerp(start, end, t);
    return [x, y - 0.35 * Math.sin(Math.PI * t), 0];
  };
  line(
    b,
    Array.from({ length: 13 }, (_, i) => sag(i / 12)),
    0.014,
    CHAIN
  );
  b.box(sag(0.95), [0.3, 0.16, 0.16], RUBBER);
  // trolley, rope and seat with a child riding
  const ride = sag(0.42);
  const seatY = ride[1] - 2.0;
  b.box([ride[0], ride[1] - 0.08, 0], [0.22, 0.12, 0.08], STEEL);
  b.rod([ride[0], ride[1] - 0.14, 0], [ride[0], seatY + 0.03, 0], 0.015, HEMP, 4);
  b.cylinder([ride[0], seatY, 0], 0.17, 0.05, 8, gloss(RED));
  kid(b, [ride[0] - 0.12, 0, 0], 0, seed, {
    legs: "sit",
    seat: seatY + 0.03,
    arms: "up",
  });
  // the next one waiting on the platform
  kid(b, [0.1, 1.28, -0.35], 0, seed + 0.5, { arms: "hold" });
};

/**
 * A long stainless slide down a terrace bank: a platform with a ladder at
 * x = 0, then the chute keeps 0.35 m over the ground given as heights
 * every `step` metres from the platform on (relative to its base).
 */
export const bankSlide = (
  b: LowPolyBuilder,
  ground: readonly number[],
  step: number,
  seed: number
): void => {
  const deck = 1.3;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box([-0.5 + sx * 0.45, (deck + 1.0) / 2, sz * 0.45], [0.1, deck + 1.0, 0.1], POST);
  b.box([-0.5, deck, 0], [1.0, 0.08, 1.0], POST_DARK);
  for (const side of [-1, 1])
    b.box([-0.5, deck + 0.85, side * 0.47], [0.95, 0.08, 0.04], POST);
  for (const side of [-1, 1])
    b.beam([-1.0, deck, side * 0.3], [-1.6, 0, side * 0.3], 0.05, STEEL, 0.05);
  for (let k = 1; k < 5; k++) {
    const t = k / 5;
    b.rod([-1.0 - 0.6 * t, deck * (1 - t), -0.3], [-1.0 - 0.6 * t, deck * (1 - t), 0.3], 0.025, STEEL);
  }
  const groundAt = (x: number) => {
    const i = Math.min(ground.length - 1, Math.max(0, x / step));
    const i0 = Math.floor(i);
    const i1 = Math.min(ground.length - 1, i0 + 1);
    return ground[i0] + (ground[i1] - ground[i0]) * (i - i0);
  };
  const length = (ground.length - 1) * step;
  const top: Point[] = [];
  for (let x = 0; x <= length + 1e-6; x += 0.25) {
    const lift = 0.35 + (deck - 0.35) * Math.max(0, 1 - x / 2.2) ** 1.5;
    top.push([x, groundAt(x) + lift]);
  }
  chute(b, top, 0.65, STAINLESS);
  for (let x = 1.5; x < length - 0.5; x += 1.6) {
    const y = top[Math.round(x / 0.25)][1];
    b.rod([x, groundAt(x), 0], [x, y - 0.07, 0], 0.045, STEEL);
  }
  const at = Math.round((length * 0.45) / 0.25);
  const [rx, ry] = top[at];
  kid(b, [rx, ry + 0.03, 0], 0, seed, { legs: "straight", seat: 0, arms: "up" });
  kid(b, [-0.5, deck + 0.04, 0.1], 0, seed + 0.5, { arms: "down" });
};

/** a climbing net pyramid round a 4.5 m mast, 6.6 m across */
export const netPyramid = (b: LowPolyBuilder, seed: number): void => {
  const top: V3 = [0, 4.2, 0];
  const radius = 3.3;
  const count = 12;
  b.rod([0, 0, 0], [0, 4.45, 0], 0.08, gloss(STEEL));
  b.blob([0, 4.5, 0], [0.12, 0.1, 0.12], STEEL, 0, 1);
  const anchor = (i: number): V3 => {
    const angle = (i / count) * Math.PI * 2;
    return [Math.cos(angle) * radius, 0.05, Math.sin(angle) * radius];
  };
  for (let i = 0; i < count; i++) {
    b.rod(top, anchor(i), 0.022, ROPE, 4);
    if (i % 2 === 0) b.box(anchor(i), [0.25, 0.12, 0.25], "#7d8288");
  }
  for (const t of [0.18, 0.36, 0.54, 0.72])
    for (let i = 0; i < count; i++)
      b.rod(
        lerp(anchor(i), top, t),
        lerp(anchor(i + 1), top, t),
        0.018,
        ROPE,
        4
      );
  for (const [i, t] of [
    [1, 0.36],
    [5, 0.54],
    [9, 0.18],
  ] as const) {
    const angle = (i / count) * Math.PI * 2;
    const [x, y, z] = lerp(anchor(i), top, t);
    kid(
      b,
      [x + Math.cos(angle) * 0.15, y, z + Math.sin(angle) * 0.15],
      yawTo(-Math.cos(angle), -Math.sin(angle)),
      seed + i * 0.07,
      { arms: "up" }
    );
  }
};

/** a nest swing with two children in it */
export const nestSwing = (b: LowPolyBuilder, seed: number): void => {
  aFrames(b, 2.0, 2.65, 1.35);
  const ring = 0.6;
  const y = 0.62;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    b.rod(
      [Math.cos(a0) * ring, y, Math.sin(a0) * ring],
      [Math.cos(a1) * ring, y, Math.sin(a1) * ring],
      0.045,
      RUBBER,
      6
    );
  }
  b.cylinder([0, y - 0.02, 0], 0.56, 0.03, 12, ORANGE);
  for (const x of [-0.42, 0.42])
    for (const z of [-0.42, 0.42])
      b.rod([x, 2.62, 0], [x, y + 0.03, z], 0.012, CHAIN, 4);
  kid(b, [-0.3, y, -0.12], 0, seed, { legs: "straight", seat: 0, arms: "up" });
  kid(b, [0.3, y, 0.12], Math.PI, seed + 0.3, {
    legs: "straight",
    seat: 0,
    arms: "hold",
  });
};

/** a double swing, one seat caught at the front of its swing */
export const swing = (b: LowPolyBuilder, seed: number): void => {
  aFrames(b, 2.2, 2.6, 1.3);
  for (const [x, angle, rider] of [
    [-1.0, -0.45, true],
    [1.0, 0, false],
  ] as const)
    b.transformed(
      new THREE.Matrix4()
        .makeTranslation(0, 2.6, 0)
        .multiply(new THREE.Matrix4().makeRotationX(angle))
        .multiply(new THREE.Matrix4().makeTranslation(0, -2.6, 0)),
      () => {
        for (const dx of [-0.22, 0.22])
          b.rod([x + dx, 2.58, 0], [x + dx, 0.5, 0], 0.012, CHAIN, 4);
        b.box([x, 0.48, 0], [0.48, 0.04, 0.2], RUBBER);
        if (rider)
          kid(b, [x, 0.5, 0.02], -Math.PI / 2, seed, {
            legs: "straight",
            seat: 0,
            arms: "up",
          });
      }
    );
};

/** three trampolines set into the ground, one child jumping */
export const trampolines = (b: LowPolyBuilder, seed: number): void => {
  const spots = [
    [-2.1, -0.4],
    [0, 0.5],
    [2.1, -0.3],
  ] as const;
  spots.forEach(([x, z], i) => {
    b.cylinder([x, 0.03, z], 0.95, 0.06, 12, gloss(i === 1 ? BLUE : GREEN));
    b.cylinder([x, 0.04, z], 0.78, 0.07, 12, RUBBER);
  });
  kid(b, [0, 0.6, 0.5], seed * 6, seed, { arms: "up" });
  kid(b, [2.1, 0.08, -0.3], seed * 6 + 2, seed + 0.4, { arms: "down" });
};

/** a hand-turned carousel, one child pushing, two riding */
export const carousel = (b: LowPolyBuilder, seed: number): void => {
  b.cylinder([0, 0.06, 0], 1.55, 0.12, 12, STEEL);
  b.cylinder([0, 0.26, 0], 1.45, 0.06, 12, gloss(RED));
  b.cylinder([0, 0.62, 0], 0.09, 0.7, 8, STAINLESS);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    b.rod([0, 0.95, 0], [c * 1.25, 0.9, s * 1.25], 0.03, gloss(YELLOW));
    b.rod([c * 1.25, 0.9, s * 1.25], [c * 1.3, 0.29, s * 1.3], 0.03, gloss(YELLOW));
  }
  const tangent = (angle: number) => yawTo(-Math.sin(angle), Math.cos(angle));
  for (const [angle, r, y, pose] of [
    [0.5, 0.75, 0.29, { legs: "straight", seat: 0, arms: "hold" }],
    [2.6, 0.9, 0.29, { arms: "forward" }],
    [4.4, 1.85, 0, { legs: "walk", arms: "forward" }],
  ] as const)
    kid(
      b,
      [Math.cos(angle) * r, y, Math.sin(angle) * r],
      tangent(angle),
      seed + angle * 0.1,
      pose
    );
};

/** the log frame of a sandpit `size` metres square, a sand digger, a
 * castle and children playing */
export const sandpit = (b: LowPolyBuilder, size: number, seed: number): void => {
  const h = size / 2;
  const corners: V3[] = [
    [-h, 0.15, -h],
    [h, 0.15, -h],
    [h, 0.15, h],
    [-h, 0.15, h],
  ];
  corners.forEach((corner, i) => {
    b.rod(corner, corners[(i + 1) % 4], 0.15, POST, 7);
    b.cylinder([corner[0], 0.2, corner[2]], 0.17, 0.4, 7, POST_DARK);
  });
  const dx = h - 0.9;
  const dz = -(h - 0.9);
  b.cylinder([dx, 0.35, dz], 0.08, 0.7, 8, STEEL);
  b.box([dx, 0.72, dz], [0.35, 0.05, 0.3], gloss(YELLOW));
  b.rod([dx + 0.1, 0.8, dz], [dx + 0.7, 0.85, dz], 0.04, gloss(RED));
  b.rod([dx + 0.7, 0.85, dz], [dx + 0.85, 0.25, dz], 0.03, gloss(RED));
  b.box([dx + 0.88, 0.15, dz], [0.2, 0.12, 0.18], gloss(YELLOW));
  for (const z of [-0.1, 0.1])
    b.rod([dx + 0.15, 0.72, dz + z], [dx + 0.3, 1.02, dz + z], 0.015, RUBBER, 4);
  kid(b, [dx - 0.05, 0, dz], 0, seed, { legs: "sit", seat: 0.75, arms: "forward" });
  b.cone([-0.3, 0.02, -0.5], 0.35, 0.4, 6, "#d9bf86");
  b.cone([-0.55, 0.02, -0.2], 0.2, 0.25, 6, "#d9bf86");
  b.cylinder([0.1, 0.1, 0.55], 0.09, 0.18, 8, gloss(BLUE), "y", 0.11);
  b.rod([0.3, 0.05, 0.4], [0.45, 0.3, 0.2], 0.015, gloss(RED), 4);
  kid(b, [-0.8, 0.02, 0.45], yawTo(0.6, -0.8), seed + 0.3, {
    legs: "straight",
    seat: 0.06,
    arms: "hold",
  });
  kid(b, [0.6, 0.02, 0.9], yawTo(-0.7, -0.6), seed + 0.6, {
    legs: "straight",
    seat: 0.06,
    arms: "forward",
  });
};

/** zigzag balance logs on stumps, about 7 m long, a child balancing */
export const balanceBeams = (b: LowPolyBuilder, seed: number): void => {
  const points: V3[] = [
    [-3.1, 0.35, -0.4],
    [-1.3, 0.45, 0.6],
    [0.5, 0.3, -0.5],
    [2.3, 0.5, 0.5],
    [3.2, 0.25, -0.3],
  ];
  for (const [x, y, z] of points)
    b.cylinder([x, y / 2, z], 0.14, y, 7, POST_DARK);
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay, az] = points[i];
    const [bx, by, bz] = points[i + 1];
    b.rod([ax, ay + 0.08, az], [bx, by + 0.08, bz], 0.11, POST, 7);
  }
  for (let i = 0; i < 5; i++) {
    const height = 0.2 + 0.1 * (i % 3);
    b.cylinder([-2.4 + 1.2 * i, height / 2, -1.6], 0.18, height, 7, POST);
  }
  const [x, y, z] = lerp(points[1], points[2], 0.45);
  kid(
    b,
    [x, y + 0.19, z],
    yawTo(points[2][0] - points[1][0], points[2][2] - points[1][2]),
    seed,
    { arms: "forward" }
  );
};

/** a spring rider: an animal on a coil, a child on it when `rider` */
export const springRider = (
  b: LowPolyBuilder,
  paint: string,
  seed: number,
  rider: boolean
): void => {
  b.cylinder([0, 0.04, 0], 0.25, 0.08, 8, STEEL);
  for (let k = 0; k < 5; k++)
    b.cylinder([0, 0.13 + k * 0.07, 0], 0.1, 0.035, 8, RUBBER);
  b.blob([0, 0.62, 0], [0.42, 0.2, 0.16], gloss(paint), 1);
  b.blob([0.38, 0.84, 0], [0.14, 0.16, 0.12], gloss(paint), 2);
  for (const side of [-1, 1]) b.cone([0.36, 0.96, side * 0.06], 0.04, 0.1, 4, paint);
  b.rod([0.22, 0.8, -0.15], [0.22, 0.8, 0.15], 0.02, RUBBER, 4);
  if (rider)
    kid(b, [-0.1, 0, 0], 0, seed, { legs: "sit", seat: 0.8, arms: "forward" });
};

/** a seesaw with a child at each end, the -x end down */
export const seesaw = (b: LowPolyBuilder, seed: number): void => {
  b.box([0, 0.3, 0], [0.25, 0.6, 0.5], STEEL);
  b.beam([-1.9, 0.28, 0], [1.9, 0.92, 0], 0.3, gloss(YELLOW), 0.08);
  for (const [x, y] of [
    [-1.45, 0.36],
    [1.45, 0.84],
  ] as const) {
    b.rod([x, y, 0], [x, y + 0.4, 0], 0.025, RUBBER, 4);
    b.rod([x, y + 0.4, -0.18], [x, y + 0.4, 0.18], 0.025, RUBBER, 4);
  }
  b.cylinder([-1.75, 0.12, 0], 0.15, 0.3, 8, RUBBER, "z");
  kid(b, [-1.72, 0, 0], 0, seed, { legs: "sit", seat: 0.36, arms: "forward" });
  kid(b, [1.72, 0, 0], Math.PI, seed + 0.5, {
    legs: "sit",
    seat: 0.94,
    arms: "forward",
  });
};

/** a wooden playhouse with a shop counter at +x, a child buying */
export const playhouse = (b: LowPolyBuilder, seed: number): void => {
  b.profile(
    [
      [-1.0, 0],
      [1.0, 0],
      [1.0, 1.4],
      [0, 2.1],
      [-1.0, 1.4],
    ],
    1.8,
    "#d8b47c"
  );
  for (const side of [-1, 1])
    b.beam([side * 1.2, 1.28, 0], [0, 2.2, 0], 2.0, gloss(RED), 0.06);
  b.box([0.35, 0.6, 0.905], [0.6, 1.1, 0.02], "#6b4a2f");
  b.box([1.005, 1.0, 0], [0.02, 0.45, 0.8], "#3b2a1c");
  b.box([1.1, 0.78, 0], [0.2, 0.04, 0.9], POST);
  kid(b, [1.65, 0, 0.1], Math.PI, seed, { arms: "forward" });
};

/** a waste bin on a post */
export const bin = (b: LowPolyBuilder): void => {
  b.rod([0, 0, 0], [0, 0.9, 0], 0.04, STEEL);
  b.cylinder([0.18, 0.6, 0], 0.2, 0.55, 8, "#3d6b4a");
};
