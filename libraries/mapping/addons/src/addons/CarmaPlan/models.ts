import * as THREE from "three";

import { glass, gloss, glow, type LowPolyBuilder, type V3 } from "./lowpoly";
import type { Point } from "./site-frame";

/**
 * Models shared by the scenarios, in real sizes (metres), built from parts
 * with one colour each: people, trees, hedges, lamps, benches, fences and
 * cars. Each draws into the builder's current local frame: x forward, y up,
 * z to the right, standing on y = 0. Place them with `builder.placed`.
 */

/** a colour made lighter (k > 1) or darker (k < 1) */
export const tint = (hex: string, k: number): string => {
  const color = new THREE.Color(hex).multiplyScalar(k);
  return `#${color.getHexString()}`;
};

const pickOf = (list: readonly string[], k: number): string =>
  list[Math.abs(Math.floor(k)) % list.length];

const BARK = "#6a4e36";
const BARK_DARK = "#5a4130";
const WOOD = "#9c6f45";
const IRON = "#2f3436";
const LAMP_GREY = "#5d6468";
const LENS = "#f4ecd2";

// people

const SKIN = ["#f1c7a5", "#c98e66", "#e3b08c", "#8a5a3c", "#5e3d29"];
const HAIR = ["#2b211b", "#6b4529", "#b07d45", "#d8c08e", "#9a9893", "#1c1a19"];
const SHIRTS = [
  "#c0392b",
  "#2e6da4",
  "#e0b13a",
  "#3f8f5a",
  "#f2efe6",
  "#7b4f9d",
  "#e07a3a",
  "#4f5b66",
];
const TROUSERS = ["#2f3b52", "#4a4a48", "#6b5a43", "#304a3a", "#8a7a5c"];
const SHOES = "#2a2826";
const WORK_SHIRT = "#59636e";
const WORK_TROUSERS = "#3a4350";
const HI_VIS = ["#f26b1d", "#dfe02c"];
const REFLECTOR = "#d9dcdf";
const HELMETS = ["#f4f4f1", "#f0c419", "#f4f4f1", "#e8742a", "#2f6ec0"];

/** how an arm is held: hanging, raised, reaching forward, or the forearm
 * forward from the elbow (holding something, hands in the lap) */
export type Arm = "down" | "up" | "forward" | "hold";

export type PersonPose = {
  /** standing, mid stride, sitting on a seat, or sitting with the legs
   * stretched out forward (on a slide, a swing) */
  legs?: "stand" | "walk" | "sit" | "straight";
  /** seat height for the sitting poses, metres */
  seat?: number;
  /** both arms, or [left (-z), right (+z)] */
  arms?: Arm | readonly [Arm, Arm];
  /** hi-vis vest and helmet */
  worker?: boolean;
  /** 1 for an adult of 1.75 m, about 0.65 for a child */
  scale?: number;
};

const limb = (
  b: LowPolyBuilder,
  z: number,
  arm: Arm,
  shoulders: number,
  sleeve: string,
  skin: string
): void => {
  switch (arm) {
    case "down":
      b.box([0, shoulders - 0.3, z], [0.1, 0.56, 0.09], sleeve);
      b.box([0, shoulders - 0.62, z], [0.09, 0.1, 0.08], skin);
      return;
    case "up":
      b.box([0, shoulders + 0.24, z], [0.1, 0.56, 0.09], sleeve);
      b.box([0, shoulders + 0.57, z], [0.09, 0.1, 0.08], skin);
      return;
    case "forward":
      b.box([0.26, shoulders - 0.05, z], [0.52, 0.1, 0.09], sleeve);
      b.box([0.57, shoulders - 0.05, z], [0.1, 0.08, 0.08], skin);
      return;
    case "hold":
      b.box([0, shoulders - 0.17, z], [0.1, 0.3, 0.09], sleeve);
      b.box([0.14, shoulders - 0.33, z], [0.32, 0.08, 0.08], skin);
      return;
  }
};

/**
 * A person, 1.75 m, facing +x. `seed` (0 to 1) picks skin, hair and
 * clothes. Sitting poses put the hips at the origin, the seat `seat` high.
 */
export const person = (
  b: LowPolyBuilder,
  seed: number,
  pose: PersonPose = {}
): void => {
  const scale = pose.scale ?? 1;
  if (scale !== 1) {
    b.transformed(new THREE.Matrix4().makeScale(scale, scale, scale), () =>
      person(b, seed, { ...pose, scale: 1 })
    );
    return;
  }
  const look = Math.floor(seed * 9973);
  const worker = pose.worker ?? false;
  const skin = pickOf(SKIN, look);
  const shirt = worker ? WORK_SHIRT : pickOf(SHIRTS, look * 5 + 2);
  const trousers = worker ? WORK_TROUSERS : pickOf(TROUSERS, look * 2 + 1);
  const legs = pose.legs ?? "stand";
  const seat = pose.seat ?? 0.45;
  const sitting = legs === "sit" || legs === "straight";
  const waist = sitting ? seat + 0.12 : 0.86;
  const shoulders = waist + 0.56;

  for (const z of [-0.09, 0.09]) {
    if (legs === "stand") {
      b.box([0, 0.47, z], [0.15, 0.82, 0.13], trousers);
      b.box([0.04, 0.035, z], [0.25, 0.07, 0.12], SHOES);
    } else if (legs === "walk") {
      const stride = z > 0 ? 0.22 : -0.2;
      b.beam([0, 0.88, z], [stride, 0.08, z], 0.13, trousers, 0.15);
      b.box([stride + 0.05, 0.035, z], [0.25, 0.07, 0.12], SHOES);
    } else if (legs === "sit") {
      // on a high seat the feet dangle
      const shin = Math.min(seat, 0.48);
      b.box([0.17, seat + 0.07, z], [0.48, 0.15, 0.14], trousers);
      b.box([0.36, seat - shin / 2, z], [0.13, shin, 0.12], trousers);
      b.box([0.42, seat - shin + 0.035, z], [0.25, 0.07, 0.12], SHOES);
    } else {
      b.box([0.4, seat + 0.07, z], [0.9, 0.14, 0.14], trousers);
      b.box([0.88, seat + 0.13, z], [0.08, 0.22, 0.12], SHOES);
    }
  }

  b.box([0, waist + 0.28, 0], [0.22, 0.56, 0.38], shirt);
  if (worker) {
    b.box([0, waist + 0.31, 0], [0.25, 0.42, 0.41], pickOf(HI_VIS, look));
    for (const y of [waist + 0.17, waist + 0.37])
      b.box([0, y, 0], [0.26, 0.04, 0.42], REFLECTOR);
  }
  const arms = pose.arms ?? (sitting ? "hold" : "down");
  const [left, right] = typeof arms === "string" ? [arms, arms] : arms;
  limb(b, -0.24, left, shoulders, shirt, skin);
  limb(b, 0.24, right, shoulders, shirt, skin);

  b.box([0, shoulders + 0.03, 0], [0.1, 0.07, 0.1], skin);
  b.blob([0.01, shoulders + 0.18, 0], [0.115, 0.127, 0.104], skin, look, 1);
  if (worker) {
    const helmet = gloss(pickOf(HELMETS, look * 7 + 3));
    b.blob([0, shoulders + 0.25, 0], [0.135, 0.095, 0.125], helmet, look, 1);
    b.cylinder([0.02, shoulders + 0.2, 0], 0.16, 0.02, 8, helmet);
  } else
    b.blob(
      [-0.02, shoulders + 0.23, 0],
      [0.122, 0.086, 0.114],
      pickOf(HAIR, look * 3 + 1),
      look + 1,
      1
    );
};

// trees and hedges

/**
 * A summer tree: a deciduous one with a crown of three blobs, or a conifer
 * of three tiers; `size` 1 is about 6.5 m high.
 */
export const tree = (
  b: LowPolyBuilder,
  conifer: boolean,
  size: number,
  leaves: string
): void => {
  const s = size;
  const seed = Math.round(size * 997);
  if (conifer) {
    b.cylinder([0, 0.9 * s, 0], 0.17 * s, 1.8 * s, 6, BARK_DARK, "y", 0.1 * s);
    const tiers = [
      [0.9, 2.1, 2.9],
      [2.5, 1.6, 2.5],
      [3.9, 1.05, 2.2],
    ] as const;
    tiers.forEach(([y, r, h], i) =>
      b.cone(
        [0, y * s, 0],
        r * s,
        h * s,
        7,
        tint(leaves, 1 + 0.08 * i),
        i * 0.45
      )
    );
    return;
  }
  b.cylinder([0, 1.4 * s, 0], 0.19 * s, 2.8 * s, 7, BARK, "y", 0.13 * s);
  b.rod([0, 2.3 * s, 0], [0.75 * s, 3.5 * s, 0.35 * s], 0.07 * s, BARK);
  b.rod([0, 2.5 * s, 0], [-0.65 * s, 3.6 * s, -0.45 * s], 0.06 * s, BARK);
  b.blob([0, 4.3 * s, 0], [2.4 * s, 1.85 * s, 2.3 * s], leaves, seed);
  b.blob(
    [0.95 * s, 5.0 * s, 0.5 * s],
    [1.5 * s, 1.3 * s, 1.5 * s],
    tint(leaves, 1.14),
    seed + 1
  );
  b.blob(
    [-1.0 * s, 3.9 * s, -0.7 * s],
    [1.45 * s, 1.2 * s, 1.4 * s],
    tint(leaves, 0.88),
    seed + 2
  );
};

/** a clipped hedge from x = 0 to `length`, 1.1 m high, 0.9 m deep */
export const hedge = (
  b: LowPolyBuilder,
  length: number,
  leaves: string,
  seed = 0
): void => {
  const count = Math.max(1, Math.round(length / 1.1));
  const step = length / count;
  b.box([length / 2, 0.42, 0], [length - 0.2, 0.75, 0.7], tint(leaves, 0.82));
  for (let i = 0; i < count; i++)
    b.blob(
      [(i + 0.5) * step, 0.62, 0],
      [step * 0.72, 0.52, 0.48],
      i % 2 === 0 ? leaves : tint(leaves, 1.08),
      seed + i
    );
};

// street furniture

/** a street lamp, 6 m, its head over +x */
export const lamp = (b: LowPolyBuilder): void => {
  b.cylinder([0, 0.3, 0], 0.13, 0.6, 8, LAMP_GREY);
  b.cylinder([0, 3.3, 0], 0.075, 5.4, 8, LAMP_GREY, "y", 0.05);
  b.rod([0, 5.85, 0], [0.5, 6.04, 0], 0.035, LAMP_GREY);
  b.profile(
    [
      [0.35, 5.98],
      [1.3, 6.0],
      [1.35, 6.08],
      [0.45, 6.15],
    ],
    0.32,
    gloss(LAMP_GREY),
    { bevel: 0.03 }
  );
  b.box([0.85, 5.97, 0], [0.75, 0.02, 0.22], glow(LENS));
  b.box([0, 1.1, 0.08], [0.1, 0.35, 0.02], tint(LAMP_GREY, 0.7));
};

/** someone sitting on a bench: `x` along it, `seed` picks the look */
export type Sitter = { x: number; seed: number; scale?: number };

/**
 * A park bench, 1.9 m along x, facing +z: slats on two cast-iron side
 * frames, optionally with people on it.
 */
export const bench = (
  b: LowPolyBuilder,
  sitters: readonly Sitter[] = []
): void => {
  for (const x of [-0.78, 0.78]) {
    b.beam([x, 0, 0.2], [x, 0.43, 0.18], 0.06, IRON, 0.07);
    b.beam([x, 0, -0.22], [x, 0.86, -0.32], 0.06, IRON, 0.07);
    b.beam([x, 0.42, 0.24], [x, 0.42, -0.26], 0.06, IRON, 0.05);
    b.beam([x, 0.64, 0.2], [x, 0.64, -0.29], 0.06, IRON, 0.05);
  }
  for (const z of [0.17, 0.03, -0.11])
    b.box([0, 0.46, z], [1.9, 0.04, 0.12], WOOD);
  for (const [y, z] of [
    [0.6, -0.27],
    [0.77, -0.3],
  ] as const)
    b.box([0, y, z], [1.9, 0.12, 0.035], WOOD, [-0.12, 0, 0]);
  for (const sitter of sitters)
    b.transformed(
      new THREE.Matrix4()
        .makeTranslation(sitter.x, 0, -0.04)
        .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)),
      () =>
        person(b, sitter.seed, {
          legs: "sit",
          seat: 0.48 / (sitter.scale ?? 1),
          scale: sitter.scale ?? 1,
        })
    );
};

/**
 * A fence along a line of ground points: posts every `spacing` metres,
 * `rails` heights for the horizontal bars.
 */
export const fence = (
  b: LowPolyBuilder,
  line: readonly V3[],
  options: {
    height: number;
    rails: readonly number[];
    paint: string;
    post: number;
  }
): void => {
  for (let i = 0; i < line.length; i++) {
    const [x, y, z] = line[i];
    b.beam([x, y, z], [x, y + options.height, z], options.post, options.paint);
    const next = line[i + 1];
    if (!next) continue;
    for (const rail of options.rails)
      b.beam(
        [x, y + rail, z],
        [next[0], next[1] + rail, next[2]],
        0.04,
        options.paint
      );
  }
};

// cars

export type CarKind = "hatch" | "estate" | "suv";

// the hood falls from the windscreen base to a low nose
const CAR_BODY: readonly Point[] = [
  [-2.2, 0.24],
  [2.12, 0.24],
  [2.2, 0.5],
  [2.18, 0.68],
  [2.05, 0.78],
  [1.15, 0.95],
  [-2.12, 0.95],
  [-2.2, 0.75],
];

const CAR_CABIN: Record<CarKind, readonly Point[]> = {
  hatch: [
    [1.15, 0.93],
    [0.35, 1.44],
    [-1.5, 1.46],
    [-2.0, 0.94],
  ],
  estate: [
    [1.15, 0.93],
    [0.35, 1.44],
    [-1.95, 1.45],
    [-2.12, 0.95],
  ],
  suv: [
    [1.1, 0.93],
    [0.3, 1.52],
    [-1.8, 1.54],
    [-2.1, 0.95],
  ],
};

const CAR_ROOF: Record<CarKind, { x: number; length: number; y: number }> = {
  hatch: { x: -0.58, length: 1.75, y: 1.475 },
  estate: { x: -0.8, length: 2.2, y: 1.47 },
  suv: { x: -0.75, length: 2.0, y: 1.555 },
};

/** a family car, 4.4 m long, 1.8 m wide */
export const car = (
  b: LowPolyBuilder,
  paint: string,
  kind: CarKind = "hatch"
): void => {
  const lift = kind === "suv" ? 0.08 : 0;
  const radius = kind === "suv" ? 0.36 : 0.32;
  const up = (outline: readonly Point[]): Point[] =>
    outline.map(([x, y]) => [x, y + lift] as const);
  const body = gloss(paint);
  const seam = tint(paint, 0.55);
  const roof = CAR_ROOF[kind];

  b.profile(up(CAR_BODY), 1.8, body, { bevel: 0.08 });
  b.profile(up(CAR_CABIN[kind]), 1.5, glass(), { bevel: 0.06 });
  b.box([roof.x, roof.y + lift, 0], [roof.length, 0.05, 1.34], body);
  // the B pillar splits the side glass into front and rear windows
  b.box(
    [-0.3, (0.95 + roof.y) / 2 + lift, 0],
    [0.08, roof.y - 0.96, 1.52],
    body
  );
  for (const side of [-1, 1]) {
    b.box([2.185, 0.62 + lift, side * 0.6], [0.04, 0.1, 0.3], glow("#eef2f5"));
    b.box([-2.2, 0.82 + lift, side * 0.64], [0.04, 0.1, 0.26], glow("#a61e1a"));
    b.box([0.95, 1.0 + lift, side * 0.96], [0.1, 0.09, 0.13], body);
    for (const x of [0.25, -0.85])
      b.box([x, 0.64 + lift, side * 0.902], [0.02, 0.54, 0.01], seam);
    for (const x of [-1.35, 1.35])
      b.wheel([x, radius, side * 0.82], radius, 0.2);
  }
  for (const [x, y] of [
    [2.19, 0.5],
    [-2.21, 0.55],
  ] as const)
    b.box([x, y + lift, 0], [0.02, 0.11, 0.5], "#f2f2ee");
};

// gate

const BOOM_RED = "#c8312b";
const BOOM_WHITE = "#f2f1ec";
const HOUSING = "#e4e2dc";
const SIGN_BLUE = "#1f5aa6";

/**
 * A boom barrier for a car park or yard entrance, the housing at the origin:
 * a cabinet on a plinth with a lamp, and the red and white boom pivoting at
 * its left side. Down, the boom reaches `length` metres to the left (-z) onto
 * a rest post; `raised` lifts it, radians up from horizontal.
 */
export const boomBarrier = (
  b: LowPolyBuilder,
  length = 3.3,
  raised = 0
): void => {
  b.box([0, 0.06, 0], [0.52, 0.12, 0.52], "#9a9893");
  b.box([0, 0.56, 0], [0.34, 0.88, 0.34], gloss(HOUSING));
  b.box([0, 1.02, 0], [0.4, 0.05, 0.4], gloss(tint(HOUSING, 0.88)));
  b.box([0.172, 0.5, 0.02], [0.01, 0.56, 0.24], tint(HOUSING, 0.8));
  b.box([0.175, 0.52, 0.11], [0.012, 0.06, 0.03], IRON);
  b.box([0.172, 0.9, -0.06], [0.02, 0.07, 0.07], glow("#f2b33d"));
  b.cylinder([0, 0.9, -0.2], 0.08, 0.07, 8, IRON, "z");
  b.cylinder([0, 0.9, -0.19], 0.03, 0.12, 6, LAMP_GREY, "z");
  const hub: V3 = [0, 0.9, -0.24];
  const rise = Math.sin(raised);
  const reach = -Math.cos(raised);
  const pieces = Math.max(2, Math.round(length / 0.42));
  const piece = length / pieces;
  for (let i = 0; i < pieces; i++)
    b.beam(
      [0, hub[1] + rise * piece * i, hub[2] + reach * piece * i],
      [0, hub[1] + rise * piece * (i + 1), hub[2] + reach * piece * (i + 1)],
      0.05,
      gloss(i % 2 === 0 ? BOOM_RED : BOOM_WHITE),
      0.09
    );
  // the fork the boom rests in when it is down
  const tip = hub[2] - length + 0.08;
  b.cylinder([0, 0.4, tip], 0.035, 0.8, 6, IRON);
  b.box([0, 0.82, tip - 0.05], [0.1, 0.06, 0.02], BOOM_RED);
  b.box([0, 0.82, tip + 0.05], [0.1, 0.06, 0.02], BOOM_RED);
  b.box([0, 0.03, tip], [0.2, 0.06, 0.2], "#9a9893");
};

/** the blue parking sign on its post, facing +x */
export const parkingSign = (b: LowPolyBuilder): void => {
  b.cylinder([0, 1.2, 0], 0.035, 2.4, 6, LAMP_GREY);
  b.box([0.04, 2.2, 0], [0.03, 0.62, 0.62], gloss(SIGN_BLUE));
  b.box([0.03, 2.2, 0], [0.025, 0.66, 0.66], BOOM_WHITE);
  // the letter P, read from +x: the viewer's left is +z, so the stem goes there
  const ink = gloss(BOOM_WHITE);
  b.box([0.058, 2.2, 0.1], [0.01, 0.4, 0.07], ink);
  b.box([0.058, 2.365, 0.0], [0.01, 0.07, 0.2], ink);
  b.box([0.058, 2.215, 0.0], [0.01, 0.07, 0.2], ink);
  b.box([0.058, 2.29, -0.1], [0.01, 0.15, 0.07], ink);
};
