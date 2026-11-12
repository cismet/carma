import * as THREE from "three";

import type { LowPolyBuilder, Paint, V3 } from "./lowpoly";

/**
 * Low-poly models for the scenarios, in real sizes (metres). Each draws into
 * the builder's current local frame: x forward, y up, z to the right, standing
 * on y = 0. Place them with `builder.placed`.
 */

const GLASS = "#34434d";
const TRACK = "#2b2b2b";
const STEEL = "#3a3a3a";
const TYRE = "#1c1c1c";
const WOOD = ["#8b5e3c", "#94653f", "#7f5536"];
const MACHINE_YELLOW = "#f0b400";
const MACHINE_YELLOW_DARK = "#cf9800";

/** a crawler dozer, about 5.5 m with the blade, 3.4 m wide at the blade */
export const bulldozer = (b: LowPolyBuilder): void => {
  for (const side of [-1, 1])
    b.box([0, 0.45, side * 1.0], [4.2, 0.9, 0.62], TRACK);
  b.box([0, 0.85, 0], [3.8, 0.4, 1.4], MACHINE_YELLOW_DARK);
  b.box([0.65, 1.45, 0], [2.4, 0.9, 1.5], MACHINE_YELLOW);
  b.box([-1.0, 1.4, 0], [1.6, 0.8, 2.3], MACHINE_YELLOW);
  b.box([-1.0, 2.35, 0], [1.4, 1.1, 1.6], GLASS);
  b.box([-1.0, 2.95, 0], [1.6, 0.12, 1.8], MACHINE_YELLOW);
  b.box([1.2, 2.2, 0.45], [0.12, 0.7, 0.12], "#222222");
  b.box([2.75, 0.8, 0], [0.28, 1.3, 3.4], MACHINE_YELLOW_DARK, [0, 0, 0.12]);
  for (const side of [-1, 1])
    b.beam([1.0, 0.65, side * 1.05], [2.6, 0.55, side * 1.05], 0.22, STEEL);
  b.box([-2.35, 0.6, 0], [0.35, 0.8, 0.3], STEEL);
};

/**
 * A tracked excavator. `slew` turns the upper house (radians, positive turns
 * the boom from forward towards -z); the bucket hangs about 6 m out at 3 m.
 */
export const excavator = (b: LowPolyBuilder, slew = 0): void => {
  for (const side of [-1, 1])
    b.box([0, 0.45, side * 1.15], [4.4, 0.9, 0.7], TRACK);
  b.box([0, 1.0, 0], [2.6, 0.3, 1.7], STEEL);
  b.transformed(new THREE.Matrix4().makeRotationY(slew), () => {
    b.box([-0.5, 1.75, 0], [3.0, 1.2, 2.5], MACHINE_YELLOW);
    b.box([-2.15, 1.65, 0], [0.5, 1.0, 2.5], MACHINE_YELLOW_DARK);
    b.box([0.6, 2.25, 0.7], [1.4, 1.6, 0.95], GLASS);
    b.box([0.6, 3.1, 0.7], [1.5, 0.1, 1.05], MACHINE_YELLOW);
    const pivot: V3 = [1.0, 1.9, -0.35];
    const elbow: V3 = [4.35, 5.6, -0.35];
    const wrist: V3 = [6.0, 3.25, -0.35];
    b.beam(pivot, elbow, 0.45, MACHINE_YELLOW, 0.55);
    b.beam(elbow, wrist, 0.35, MACHINE_YELLOW, 0.4);
    b.beam([1.3, 1.6, -0.35], [2.9, 3.6, -0.35], 0.16, STEEL);
    b.box([6.15, 2.85, -0.35], [0.9, 0.85, 1.1], STEEL, [0, 0, 0.5]);
  });
};

/** a three-axle tipper, 8.4 m long; `load` heaps soil in its body */
export const dumpTruck = (
  b: LowPolyBuilder,
  cab: string,
  body: string,
  load: Paint | null
): void => {
  b.box([-0.3, 0.95, 0], [7.8, 0.35, 1.0], "#2a2a2a");
  for (const x of [2.9, -1.6, -2.95])
    for (const side of [-1, 1])
      b.cylinder([x, 0.55, side * 1.0], 0.55, 0.5, 8, TYRE, "z");
  b.box([2.95, 2.0, 0], [1.9, 2.3, 2.45], cab);
  b.box([3.91, 2.55, 0], [0.04, 0.85, 2.2], GLASS);
  for (const side of [-1, 1])
    b.box([3.1, 2.55, side * 1.23], [1.0, 0.7, 0.04], GLASS);
  b.box([3.95, 0.8, 0], [0.15, 0.35, 2.45], "#444444");
  b.box([-1.05, 1.95, 0], [5.4, 1.5, 2.5], body);
  if (load) {
    b.box([-1.05, 2.75, 0], [4.9, 0.12, 2.2], load);
    b.cone([-1.05, 2.8, 0], 1.3, 0.6, 6, load);
  }
};

/** a site office container, 6 m by 2.45 m */
export const siteContainer = (b: LowPolyBuilder): void => {
  b.box([0, 1.3, 0], [6.0, 2.5, 2.45], "#e8e6df");
  for (const y of [0.08, 2.55])
    b.box([0, y, 0], [6.05, 0.16, 2.5], "#2f5d9e");
  b.box([1.6, 1.1, 1.235], [0.9, 2.0, 0.03], "#7b8a99");
  for (const x of [-0.6, -2.1])
    b.box([x, 1.55, 1.235], [1.1, 0.8, 0.03], GLASS);
};

export const portableToilet = (b: LowPolyBuilder): void => {
  b.box([0, 1.15, 0], [1.15, 2.3, 1.15], "#2c62b5");
  b.box([0, 2.35, 0], [1.25, 0.1, 1.25], "#e8e6df");
};

/** a car, 4.4 m long */
export const car = (b: LowPolyBuilder, paint: string): void => {
  b.box([0, 0.6, 0], [4.4, 0.62, 1.8], paint);
  b.box([-0.25, 1.15, 0], [2.3, 0.5, 1.62], GLASS);
  b.box([-0.25, 1.42, 0], [2.1, 0.06, 1.58], paint);
  for (const x of [-1.35, 1.35])
    for (const side of [-1, 1])
      b.box([x, 0.33, side * 0.82], [0.66, 0.66, 0.22], TYRE);
};

const crown = new THREE.IcosahedronGeometry(1, 0);

/** a deciduous tree or a conifer; `size` 1 is about 7 m high */
export const tree = (
  b: LowPolyBuilder,
  conifer: boolean,
  size: number,
  leaves: Paint
): void => {
  if (conifer) {
    b.box([0, 0.6 * size, 0], [0.3, 1.2 * size, 0.3], "#5e4029");
    b.cone([0, 0.9 * size, 0], 2.0 * size, 3.6 * size, 7, leaves);
    b.cone([0, 3.0 * size, 0], 1.45 * size, 3.4 * size, 7, leaves, 0.4);
    return;
  }
  b.box([0, 1.25 * size, 0], [0.34, 2.5 * size, 0.34], "#6b4a2f");
  b.solid(
    crown,
    [0, 4.4 * size, 0],
    [2.6 * size, 2.3 * size, 2.6 * size],
    leaves
  );
};

/** a street lamp, 6 m, its head over +x */
export const lamp = (b: LowPolyBuilder): void => {
  b.box([0, 3, 0], [0.16, 6, 0.16], "#8a8f94");
  b.box([0.5, 5.95, 0], [1.1, 0.12, 0.12], "#8a8f94");
  b.box([1.0, 5.86, 0], [0.5, 0.12, 0.28], "#d9d7c8");
};

/** a park bench facing +z */
export const bench = (b: LowPolyBuilder): void => {
  b.box([0, 0.45, 0], [1.8, 0.06, 0.45], WOOD);
  b.box([0, 0.78, -0.24], [1.8, 0.4, 0.05], WOOD, [-0.15, 0, 0]);
  for (const x of [-0.75, 0.75])
    b.box([x, 0.22, -0.02], [0.08, 0.44, 0.5], "#444444");
};

/** a double swing, its beam along x */
export const swing = (b: LowPolyBuilder): void => {
  for (const x of [-2.2, 2.2])
    for (const side of [-1, 1])
      b.beam([x, 0, side * 1.1], [x, 2.6, 0], 0.12, WOOD);
  b.beam([-2.4, 2.6, 0], [2.4, 2.6, 0], 0.16, WOOD);
  for (const [x, seat] of [
    [-1.0, "#d33b2c"],
    [1.0, "#2f7fd1"],
  ] as const) {
    for (const dx of [-0.22, 0.22])
      b.beam([x + dx, 2.55, 0], [x + dx, 0.52, 0], 0.03, "#666666");
    b.box([x, 0.5, 0], [0.5, 0.05, 0.22], seat);
  }
};

/** a tower with a roof, a ladder at -x and a slide down to +x */
export const slideTower = (b: LowPolyBuilder, slide: string): void => {
  for (const x of [-0.75, 0.75])
    for (const z of [-0.75, 0.75]) b.beam([x, 0, z], [x, 3.0, z], 0.12, WOOD);
  b.box([0, 1.5, 0], [1.7, 0.1, 1.7], WOOD);
  for (const z of [-0.75, 0.75])
    b.beam([-0.75, 2.2, z], [0.75, 2.2, z], 0.06, WOOD);
  b.cone([0, 3.0, 0], 1.35, 1.0, 4, "#c8372d", Math.PI / 4);
  for (const z of [-0.35, 0.35])
    b.beam([-1.85, 0, z], [-0.8, 1.5, z], 0.06, WOOD);
  for (let t = 0.2; t < 1; t += 0.2)
    b.beam(
      [-1.85 + 1.05 * t, 1.5 * t, -0.35],
      [-1.85 + 1.05 * t, 1.5 * t, 0.35],
      0.04,
      WOOD
    );
  b.beam([0.85, 1.5, 0], [3.6, 0.35, 0], 0.6, slide, 0.06);
  for (const z of [-0.32, 0.32])
    b.beam([0.85, 1.65, z], [3.6, 0.5, z], 0.05, slide, 0.25);
  b.box([3.95, 0.33, 0], [0.7, 0.05, 0.6], slide);
};

const dome = new THREE.IcosahedronGeometry(1, 1);

/** a climbing dome of bars, 3.6 m across */
export const climbingDome = (b: LowPolyBuilder, bars: string): void => {
  const radius = 1.8;
  const position = dome.getAttribute("position");
  const seen = new Set<string>();
  const key = (p: THREE.Vector3) =>
    `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(
      p.z * 1000
    )}`;
  const index = dome.index;
  const vertex = (i: number) =>
    new THREE.Vector3().fromBufferAttribute(position, i);
  const triangles = index ? index.count / 3 : position.count / 3;
  const corner = (t: number, c: number) =>
    index ? index.getX(t * 3 + c) : t * 3 + c;
  for (let t = 0; t < triangles; t++)
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const p = vertex(corner(t, i));
      const q = vertex(corner(t, j));
      if (p.y < -0.05 || q.y < -0.05) continue;
      const id = [key(p), key(q)].sort().join("|");
      if (seen.has(id)) continue;
      seen.add(id);
      b.beam(
        [p.x * radius, p.y * radius, p.z * radius],
        [q.x * radius, q.y * radius, q.z * radius],
        0.06,
        bars
      );
    }
};

export const seesaw = (b: LowPolyBuilder): void => {
  b.box([0, 0.3, 0], [0.3, 0.6, 0.3], "#555555");
  b.beam([-1.8, 0.25, 0], [1.8, 0.75, 0], 0.3, "#e2a72e", 0.08);
  for (const [x, y] of [
    [-1.45, 0.3],
    [1.45, 0.72],
  ])
    b.beam([x, y, 0], [x, y + 0.45, 0], 0.05, "#555555");
};

export const carousel = (b: LowPolyBuilder): void => {
  b.cylinder([0, 0.38, 0], 1.4, 0.12, 12, "#d9452b");
  b.cylinder([0, 0.75, 0], 0.07, 0.8, 6, "#888888");
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    b.beam(
      [0, 1.05, 0],
      [Math.cos(angle) * 1.2, 0.7, Math.sin(angle) * 1.2],
      0.04,
      "#f2c12e"
    );
  }
};

export const springRider = (b: LowPolyBuilder, paint: string): void => {
  b.cylinder([0, 0.25, 0], 0.12, 0.5, 6, "#555555");
  b.box([0, 0.65, 0], [0.8, 0.35, 0.28], paint);
  b.box([0.4, 0.92, 0], [0.25, 0.35, 0.25], paint);
};

export const playhouse = (b: LowPolyBuilder): void => {
  b.box([0, 0.8, 0], [2.0, 1.6, 1.8], "#c89b63");
  b.cone([0, 1.6, 0], 1.6, 1.1, 4, "#b6402f", Math.PI / 4);
  b.box([1.005, 0.6, 0], [0.02, 1.1, 0.6], "#6b4a2f");
};

/** the wooden frame of a sandpit `size` metres square */
export const sandpitFrame = (b: LowPolyBuilder, size: number): void => {
  const h = size / 2;
  for (const [from, to] of [
    [
      [-h, 0.15, -h],
      [h, 0.15, -h],
    ],
    [
      [h, 0.15, -h],
      [h, 0.15, h],
    ],
    [
      [h, 0.15, h],
      [-h, 0.15, h],
    ],
    [
      [-h, 0.15, h],
      [-h, 0.15, -h],
    ],
  ] as const)
    b.beam(from, to, 0.3, WOOD, 0.3);
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
    paint: Paint;
    post: number;
    foot?: Paint;
  }
): void => {
  for (let i = 0; i < line.length; i++) {
    const [x, y, z] = line[i];
    b.beam([x, y, z], [x, y + options.height, z], options.post, options.paint);
    if (options.foot)
      b.box([x, y + 0.08, z], [0.6, 0.16, 0.25], options.foot);
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
