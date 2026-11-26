import * as THREE from "three";

import {
  glass,
  gloss,
  glow,
  type LowPolyBuilder,
  type Paint,
  type V3,
} from "./lowpoly";
import { person, tint, type PersonPose } from "./models";
import type { Point } from "./site-frame";

/**
 * Construction site models in real sizes (metres): machines, site
 * containers, site fencing, materials and workers. Frame as in models.ts:
 * x forward, y up, z to the right, standing on y = 0.
 */

const YELLOW = "#f0b400";
const YELLOW_DARK = "#c99400";
const TRACK = "#2b2b2b";
const UNDERCARRIAGE = "#333436";
const STEEL = "#55585b";
const STEEL_DARK = "#2f3133";
const CHROME = "#c9cdd1";
const GRILLE = "#26282a";
const ALU = "#c4c8cc";
const BEACON = "#ff9d2e";
const LENS = "#f6f1dc";
const TAIL = "#b0211b";
const PALLET_WOOD = "#c9a878";
const TIMBER = "#b48a5a";

/** a hydraulic ram: the barrel from `from`, the chrome rod to `to` */
const ram = (b: LowPolyBuilder, from: V3, to: V3, radius: number): void => {
  const mid: V3 = [
    from[0] + (to[0] - from[0]) * 0.55,
    from[1] + (to[1] - from[1]) * 0.55,
    from[2] + (to[2] - from[2]) * 0.55,
  ];
  b.rod(from, mid, radius, STEEL_DARK);
  b.rod(mid, to, radius * 0.5, gloss(CHROME));
};

/**
 * A tapering arm along a centre line in (x, y), `half` its half height at
 * each point; for a boom, a stick, a loader's lift arms.
 */
const arm = (
  b: LowPolyBuilder,
  line: readonly Point[],
  half: readonly number[],
  width: number,
  paint: Paint,
  offset: number
): void => {
  const upper: Point[] = [];
  const lower: Point[] = [];
  line.forEach(([x, y], i) => {
    const [px, py] = line[Math.max(0, i - 1)];
    const [nx, ny] = line[Math.min(line.length - 1, i + 1)];
    const length = Math.hypot(nx - px, ny - py) || 1;
    const h = half[Math.min(i, half.length - 1)];
    const ox = (-(ny - py) / length) * h;
    const oy = ((nx - px) / length) * h;
    upper.push([x + ox, y + oy]);
    lower.push([x - ox, y - oy]);
  });
  b.profile([...upper, ...lower.reverse()], width, paint, {
    bevel: 0.04,
    offset,
  });
};

/** a crawler track seen from the side, with its idlers and rollers as
 * discs (x, y, radius) showing on both faces */
const crawler = (
  b: LowPolyBuilder,
  outline: readonly Point[],
  z: number,
  width: number,
  wheels: readonly (readonly [number, number, number])[]
): void => {
  b.profile(outline, width, TRACK, { bevel: 0.05, offset: z });
  for (const [x, y, r] of wheels)
    b.cylinder([x, y, z], r, width + 0.05, r > 0.2 ? 10 : 6, STEEL, "z");
};

/**
 * An operator's cab from x0 (back) to x1 (front), floor y0, roof y1,
 * centred at z: panel below the sills, glass all round with the front
 * leaning back by `rake`, corner posts, roof.
 */
const cab = (
  b: LowPolyBuilder,
  spec: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    z: number;
    w: number;
    rake: number;
    paint: Paint;
  }
): void => {
  const { x0, x1, y0, y1, z, w, rake, paint } = spec;
  const sill = y0 + 0.4;
  b.box([(x0 + x1) / 2, (y0 + sill) / 2, z], [x1 - x0, sill - y0, w], paint);
  b.profile(
    [
      [x0 + 0.02, sill],
      [x1 - 0.02, sill],
      [x1 - rake, y1 - 0.02],
      [x0 + 0.02, y1 - 0.02],
    ],
    w - 0.04,
    glass(),
    { offset: z }
  );
  b.box(
    [(x0 + x1 - rake) / 2, y1 + 0.04, z],
    [x1 - x0 - rake + 0.14, 0.08, w + 0.08],
    paint
  );
  for (const side of [-1, 1]) {
    const zz = z + side * (w / 2 - 0.02);
    b.rod([x1 - 0.02, sill, zz], [x1 - rake, y1, zz], 0.035, STEEL_DARK);
    b.rod([x0 + 0.02, sill, zz], [x0 + 0.02, y1, zz], 0.035, STEEL_DARK);
    b.rod(
      [(x0 + x1) / 2, sill, zz],
      [(x0 + x1 - rake) / 2, y1, zz],
      0.025,
      STEEL_DARK
    );
  }
};

const beacon = (b: LowPolyBuilder, at: V3): void =>
  b.cylinder(at, 0.08, 0.14, 8, glow(BEACON));

const mirror = (b: LowPolyBuilder, from: V3, at: V3): void => {
  b.rod(from, at, 0.02, STEEL_DARK);
  b.box([at[0], at[1] + 0.1, at[2]], [0.04, 0.26, 0.16], STEEL_DARK);
};

const EXCAVATOR_TRACK: readonly Point[] = [
  [-2.25, 0.42],
  [-2.1, 0.16],
  [-1.85, 0],
  [1.85, 0],
  [2.1, 0.16],
  [2.25, 0.42],
  [2.1, 0.68],
  [1.85, 0.84],
  [-1.85, 0.84],
  [-2.1, 0.68],
];

/**
 * A 20 t tracked excavator, 2.9 m wide over the tracks. `slew` turns the
 * upper house (radians, positive turns the boom from forward towards -z);
 * the boom reaches about 6.5 m and holds the bucket over a tipper's body,
 * its teeth 3.5 m up.
 */
export const excavator = (b: LowPolyBuilder, slew = 0): void => {
  for (const side of [-1, 1])
    crawler(b, EXCAVATOR_TRACK, side * 1.15, 0.6, [
      [-1.85, 0.42, 0.34],
      [1.85, 0.42, 0.34],
      [-1.1, 0.16, 0.12],
      [-0.37, 0.16, 0.12],
      [0.37, 0.16, 0.12],
      [1.1, 0.16, 0.12],
      [-0.6, 0.73, 0.08],
      [0.6, 0.73, 0.08],
    ]);
  b.box([0, 0.62, 0], [2.2, 0.36, 1.7], UNDERCARRIAGE);
  b.cylinder([0, 0.92, 0], 0.95, 0.24, 12, STEEL_DARK);

  b.transformed(new THREE.Matrix4().makeRotationY(slew), () => {
    const paint = gloss(YELLOW);
    // house: deck, engine hood, counterweight, tool box beside the boom
    b.box([-0.75, 1.24, 0], [3.7, 0.28, 2.5], paint);
    b.profile(
      [
        [-2.5, 1.38],
        [-0.35, 1.38],
        [-0.35, 2.28],
        [-2.25, 2.35],
        [-2.5, 2.1],
      ],
      2.4,
      paint,
      { bevel: 0.08 }
    );
    b.profile(
      [
        [-2.95, 1.08],
        [-2.42, 1.08],
        [-2.42, 2.12],
        [-2.78, 2.06],
        [-3.0, 1.62],
      ],
      2.5,
      gloss(YELLOW_DARK),
      { bevel: 0.1 }
    );
    b.box([0.38, 1.7, -0.92], [1.45, 0.65, 0.62], paint);
    for (const side of [-1, 1])
      b.box([-1.45, 1.86, side * 1.205], [1.0, 0.36, 0.02], GRILLE);
    b.rod([-1.7, 2.3, -0.7], [-1.7, 2.85, -0.7], 0.06, STEEL_DARK);
    for (const x of [-2.1, -0.6])
      b.rod([x, 2.32, -1.1], [x, 2.7, -1.1], 0.025, YELLOW);
    b.rod([-2.1, 2.7, -1.1], [-0.6, 2.7, -1.1], 0.025, YELLOW);

    cab(b, {
      x0: -0.3,
      x1: 1.22,
      y0: 1.38,
      y1: 3.0,
      z: 0.77,
      w: 0.95,
      rake: 0.22,
      paint,
    });
    mirror(b, [1.18, 1.9, 1.24], [1.36, 2.35, 1.43]);
    beacon(b, [-0.05, 3.13, 0.77]);
    b.box([1.0, 3.09, 1.08], [0.12, 0.08, 0.16], glow(LENS));

    // boom, stick and bucket in the plane z = -0.25
    const z = -0.25;
    arm(
      b,
      [
        [0.7, 1.75],
        [3.0, 5.3],
        [5.0, 6.3],
      ],
      [0.28, 0.4, 0.24],
      0.55,
      paint,
      z
    );
    arm(
      b,
      [
        [4.64, 6.78],
        [5.0, 6.3],
        [6.3, 4.6],
      ],
      [0.2, 0.24, 0.15],
      0.42,
      paint,
      z
    );
    b.profile(
      [
        [6.05, 4.85],
        [6.85, 4.8],
        [7.15, 4.4],
        [7.05, 3.85],
        [6.8, 3.6],
        [6.4, 3.95],
        [6.0, 4.5],
      ],
      1.1,
      STEEL,
      { bevel: 0.04, offset: z }
    );
    for (const dz of [-0.39, -0.13, 0.13, 0.39])
      b.box([6.83, 3.52, z + dz], [0.08, 0.18, 0.08], STEEL_DARK, [0, 0, 0.3]);
    for (const [x, y] of [
      [0.7, 1.75],
      [5.0, 6.3],
      [6.3, 4.6],
    ] as const)
      b.cylinder([x, y, z], 0.1, 0.64, 8, STEEL_DARK, "z");
    for (const side of [-1, 1])
      ram(b, [1.05, 1.55, z + side * 0.36], [2.4, 3.95, z + side * 0.36], 0.1);
    b.box([2.2, 4.75, z], [0.25, 0.5, 0.3], paint);
    ram(b, [2.2, 5.05, z], [4.75, 6.95, z], 0.09);
    ram(b, [5.24, 6.48, z], [6.55, 4.85, z], 0.08);
  });
};

const DOZER_TRACK: readonly Point[] = [
  [-1.95, 0],
  [1.75, 0],
  [2.05, 0.25],
  [2.0, 0.55],
  [1.7, 0.75],
  [-0.85, 0.75],
  [-1.15, 1.25],
  [-1.55, 1.42],
  [-1.95, 1.22],
  [-2.15, 0.75],
  [-2.15, 0.35],
];

/** a crawler dozer with the raised rear sprocket, 5.6 m with blade and
 * ripper, 3.4 m wide at the blade, blade at +x */
export const bulldozer = (b: LowPolyBuilder): void => {
  const paint = gloss(YELLOW);
  for (const side of [-1, 1])
    crawler(b, DOZER_TRACK, side * 0.95, 0.56, [
      [-1.55, 1.0, 0.38],
      [1.75, 0.38, 0.33],
      [-1.2, 0.16, 0.12],
      [-0.6, 0.16, 0.12],
      [0, 0.16, 0.12],
      [0.6, 0.16, 0.12],
      [1.2, 0.16, 0.12],
    ]);
  b.box([-0.3, 0.7, 0], [3.0, 0.5, 1.3], UNDERCARRIAGE);
  b.profile(
    [
      [-0.45, 0.95],
      [1.85, 0.95],
      [1.95, 1.25],
      [1.95, 1.8],
      [1.8, 1.95],
      [-0.45, 2.0],
    ],
    1.25,
    paint,
    { bevel: 0.07 }
  );
  b.box([1.97, 1.45, 0], [0.04, 0.6, 0.95], GRILLE);
  for (const side of [-1, 1]) {
    b.box([0.6, 1.6, side * 0.63], [1.0, 0.25, 0.02], GRILLE);
    b.box([-1.05, 1.47, side * 0.95], [2.1, 0.08, 0.68], paint);
    // push arms outside the tracks, lift rams from the hood to the blade
    b.beam([0.1, 0.45, side * 1.32], [2.6, 0.45, side * 1.45], 0.18, YELLOW_DARK, 0.3);
    ram(b, [1.6, 1.78, side * 0.55], [2.6, 1.15, side * 0.62], 0.08);
    ram(b, [-1.95, 1.42, side * 0.5], [-2.4, 1.0, side * 0.5], 0.07);
  }
  b.box([-1.15, 1.2, 0], [1.7, 0.6, 1.3], paint);
  cab(b, {
    x0: -1.95,
    x1: -0.35,
    y0: 1.5,
    y1: 3.05,
    z: 0,
    w: 1.5,
    rake: 0.1,
    paint,
  });
  b.box([-2.05, 1.15, 0], [0.35, 0.6, 1.4], gloss(YELLOW_DARK));
  b.rod([1.2, 1.95, -0.35], [1.2, 2.55, -0.35], 0.06, STEEL_DARK);
  b.cylinder([1.2, 2.12, 0.35], 0.11, 0.35, 8, STEEL_DARK);
  // blade, curved forward, with its cutting edge
  b.profile(
    [
      [2.55, 0.0],
      [2.95, 0.0],
      [2.85, 0.25],
      [2.8, 0.7],
      [2.85, 1.05],
      [2.98, 1.3],
      [2.85, 1.42],
      [2.62, 1.25],
      [2.55, 0.7],
    ],
    3.4,
    paint,
    { bevel: 0.04 }
  );
  b.box([2.93, 0.06, 0], [0.12, 0.12, 3.4], STEEL_DARK);
  // ripper at the back
  b.box([-2.35, 0.95, 0], [0.3, 0.25, 1.6], gloss(YELLOW_DARK));
  b.beam([-2.45, 1.0, 0], [-2.7, 0.08, 0], 0.12, STEEL_DARK, 0.3);
  mirror(b, [-0.4, 2.0, 0.76], [-0.3, 2.35, 0.95]);
  beacon(b, [-1.2, 3.18, 0.4]);
  for (const side of [-1, 1])
    b.box([-0.42, 3.05, side * 0.55], [0.1, 0.08, 0.16], glow(LENS));
};

/**
 * A three-axle tipper, 8.4 m long, 2.5 m wide, cab at +x. `load` heaps
 * material in the body.
 */
export const dumpTruck = (
  b: LowPolyBuilder,
  cabPaint: string,
  bodyPaint: string,
  load: Paint | null
): void => {
  const cabFinish = gloss(cabPaint);
  const dark = "#3d3f42";
  // chassis, tanks, guards
  for (const side of [-1, 1])
    b.box([-0.1, 1.1, side * 0.45], [8.1, 0.3, 0.14], "#262729");
  b.cylinder([1.35, 0.8, 0.95], 0.3, 1.0, 8, gloss(ALU), "x");
  b.box([1.35, 0.8, -0.95], [0.9, 0.5, 0.45], dark);
  for (const side of [-1, 1])
    b.box([-2.25, 1.2, side * 1.0], [2.6, 0.06, 0.62], "#2a2b2d");
  b.box([-4.1, 0.6, 0], [0.1, 0.12, 2.2], dark);
  for (const side of [-1, 1]) {
    b.rod([-3.9, 0.95, side * 0.45], [-4.08, 0.62, side * 0.45], 0.04, dark);
    b.box([-4.15, 0.75, side * 1.0], [0.04, 0.14, 0.3], glow(TAIL));
  }
  // wheels: steered front axle, twin tyres on the tandem
  for (const side of [-1, 1]) {
    b.wheel([2.9, 0.52, side * 1.05], 0.52, 0.36);
    for (const x of [-1.55, -2.9])
      b.wheel([x, 0.52, side * 0.92], 0.52, 0.62);
  }

  // cab
  b.profile(
    [
      [2.05, 1.05],
      [4.1, 1.05],
      [4.2, 1.85],
      [4.1, 3.05],
      [3.9, 3.2],
      [2.05, 3.2],
    ],
    2.45,
    cabFinish,
    { bevel: 0.1 }
  );
  b.box([4.165, 2.47, 0], [0.04, 1.08, 2.1], glass(), [0, 0, 0.083]);
  b.box([4.12, 3.12, 0], [0.25, 0.05, 2.2], tint(cabPaint, 0.8));
  b.box([4.2, 1.5, 0], [0.04, 0.5, 1.3], GRILLE);
  b.box([4.25, 0.85, 0], [0.2, 0.35, 2.45], dark);
  for (const side of [-1, 1]) {
    b.box([3.55, 2.55, side * 1.235], [0.95, 0.85, 0.03], glass());
    b.box([2.75, 2.1, side * 1.232], [0.03, 1.9, 0.02], tint(cabPaint, 0.7));
    b.box([3.4, 0.55, side * 1.18], [0.45, 0.05, 0.25], STEEL);
    b.box([4.36, 0.9, side * 0.9], [0.02, 0.14, 0.3], glow(LENS));
    mirror(b, [4.0, 2.6, side * 1.25], [4.15, 2.5, side * 1.5]);
  }
  for (const z of [-0.4, 0, 0.4])
    b.box([4.0, 3.23, z], [0.08, 0.05, 0.12], glow(BEACON));
  b.rod([1.9, 1.3, 1.1], [1.9, 3.35, 1.1], 0.06, gloss(CHROME));

  // dump body with ribs, rim, tailgate and the guard over the cab
  b.profile(
    [
      [-4.15, 1.3],
      [1.5, 1.3],
      [1.75, 2.8],
      [-4.2, 2.8],
    ],
    2.5,
    bodyPaint,
    { bevel: 0.06 }
  );
  const rib = tint(bodyPaint, 0.82);
  for (const side of [-1, 1]) {
    for (const x of [-3.3, -2.2, -1.1, 0])
      b.box([x, 2.05, side * 1.27], [0.1, 1.45, 0.04], rib);
    b.box([-1.25, 2.83, side * 1.24], [5.9, 0.08, 0.06], rib);
  }
  b.box([-4.22, 2.05, 0], [0.08, 1.5, 2.5], rib);
  b.box([2.0, 2.95, 0], [0.6, 0.1, 2.45], bodyPaint);
  if (load) b.blob([-1.25, 2.75, 0], [2.6, 0.55, 1.1], load, 3);
};

/**
 * A wheel loader, 7.5 m with the bucket down and carried, 2.9 m wide at
 * the bucket, bucket at +x.
 */
export const wheelLoader = (b: LowPolyBuilder): void => {
  const paint = gloss(YELLOW);
  for (const side of [-1, 1])
    for (const x of [1.55, -1.75])
      b.wheel([x, 0.8, side * 0.95], 0.8, 0.6, YELLOW);
  // rear frame: engine hood and counterweight
  b.profile(
    [
      [-3.2, 0.85],
      [-0.6, 0.85],
      [-0.6, 2.05],
      [-2.9, 2.15],
      [-3.25, 1.85],
    ],
    1.5,
    paint,
    { bevel: 0.08 }
  );
  b.profile(
    [
      [-3.55, 0.6],
      [-3.1, 0.6],
      [-3.1, 1.8],
      [-3.45, 1.75],
      [-3.62, 1.2],
    ],
    2.3,
    gloss(YELLOW_DARK),
    { bevel: 0.08 }
  );
  b.box([-3.6, 1.35, 0], [0.03, 0.5, 1.4], GRILLE);
  b.box([-0.3, 1.2, 0], [1.6, 0.7, 1.5], paint);
  b.cylinder([0.1, 0.95, 0], 0.25, 0.6, 8, STEEL_DARK);
  b.box([1.2, 0.95, 0], [2.4, 0.55, 1.1], gloss(YELLOW_DARK));
  for (const side of [-1, 1]) {
    b.box([-1.75, 1.68, side * 0.95], [1.9, 0.07, 0.7], paint);
    b.box([1.55, 1.68, side * 0.95], [1.5, 0.07, 0.66], paint);
    b.box([-3.58, 0.95, side * 0.95], [0.04, 0.12, 0.2], glow(TAIL));
  }
  cab(b, {
    x0: -1.05,
    x1: 0.45,
    y0: 1.55,
    y1: 3.35,
    z: 0,
    w: 1.45,
    rake: 0.12,
    paint,
  });
  for (const y of [0.6, 0.95, 1.3])
    b.box([-0.6, y, -1.0], [0.35, 0.04, 0.2], STEEL);
  b.rod([-2.2, 2.15, 0.4], [-2.2, 2.75, 0.4], 0.06, STEEL_DARK);
  beacon(b, [-0.4, 3.47, -0.4]);
  for (const side of [-1, 1]) {
    mirror(b, [0.4, 2.0, side * 0.72], [0.55, 2.3, side * 0.95]);
    b.box([0.4, 3.42, side * 0.55], [0.1, 0.08, 0.16], glow(LENS));
  }
  // lift arms, crossbar, rams, Z linkage
  for (const side of [-1, 1]) {
    arm(
      b,
      [
        [0.5, 1.95],
        [1.9, 1.55],
        [3.1, 0.8],
      ],
      [0.22, 0.24, 0.16],
      0.22,
      gloss(YELLOW_DARK),
      side * 0.75
    );
    ram(b, [0.9, 1.0, side * 0.6], [1.8, 1.5, side * 0.6], 0.09);
  }
  b.rod([2.0, 1.5, -0.75], [2.0, 1.5, 0.75], 0.1, YELLOW_DARK);
  ram(b, [0.75, 2.45, 0], [1.95, 2.2, 0], 0.1);
  b.beam([1.95, 2.35, 0], [2.25, 1.45, 0], 0.2, YELLOW_DARK, 0.18);
  b.beam([2.25, 1.45, 0], [3.0, 1.2, 0], 0.15, STEEL_DARK, 0.12);
  // bucket carried just over the ground, open forward and up
  b.profile(
    [
      [2.95, 0.3],
      [3.2, 0.08],
      [4.25, 0.1],
      [4.3, 0.2],
      [3.3, 0.24],
      [3.18, 0.42],
      [3.15, 1.35],
      [3.0, 1.42],
      [2.92, 0.8],
    ],
    2.9,
    gloss(YELLOW_DARK),
    { bevel: 0.03 }
  );
  for (const side of [-1, 1])
    b.profile(
      [
        [3.15, 0.1],
        [4.2, 0.12],
        [3.2, 1.38],
      ],
      0.05,
      gloss(YELLOW_DARK),
      { offset: side * 1.42 }
    );
  b.box([4.25, 0.14, 0], [0.12, 0.05, 2.9], STEEL_DARK);
};

/** the blocks a container stands on */
const blocks = (b: LowPolyBuilder, x: number, z: number): void => {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box([sx * x, 0.075, sz * z], [0.3, 0.15, 0.3], TIMBER);
};

/**
 * A site office container, 6 m by 2.45 m, door and two windows on its +z
 * side, steps up to the door.
 */
export const siteContainer = (b: LowPolyBuilder): void => {
  const frame = "#2f5d9e";
  const wall = "#e8e6df";
  blocks(b, 2.8, 1.05);
  b.box([0, 1.4, 0], [6.0, 2.5, 2.44], wall);
  for (const y of [0.23, 2.6])
    b.box([0, y, 0], [6.06, 0.16, 2.5], frame);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.box([sx * 2.95, 1.42, sz * 1.19], [0.16, 2.5, 0.16], frame);
  // door, windows with sills, the steps to the door
  b.box([1.6, 1.25, 1.225], [0.9, 2.0, 0.03], "#7b8a99");
  b.box([1.95, 1.25, 1.245], [0.06, 0.12, 0.04], CHROME);
  for (const x of [-0.6, -2.1]) {
    b.box([x, 1.75, 1.225], [1.1, 0.85, 0.03], glass());
    b.box([x, 1.3, 1.25], [1.2, 0.05, 0.08], "#bfc3c6");
  }
  b.box([0, 1.75, -1.225], [1.1, 0.85, 0.03], glass());
  b.box([-3.015, 1.75, 0], [0.03, 0.85, 1.0], glass());
  b.box([3.08, 2.0, -0.5], [0.25, 0.5, 0.7], "#d3d5d6");
  b.box([1.6, 0.3, 1.7], [1.0, 0.04, 0.5], "#6c7276");
  b.box([1.6, 0.13, 2.05], [1.0, 0.04, 0.3], "#6c7276");
  for (const sx of [-1, 1]) b.rod([1.6 + sx * 0.5, 0, 2.15], [1.6 + sx * 0.5, 1.2, 1.5], 0.025, "#9aa0a4");
};

/** a storage container, 6 m by 2.45 m, ribbed walls, doors at -x */
export const storageContainer = (b: LowPolyBuilder, paint: string): void => {
  const rib = tint(paint, 0.85);
  blocks(b, 2.8, 1.05);
  b.box([0, 1.45, 0], [6.0, 2.6, 2.44], paint);
  for (let x = -2.7; x <= 2.71; x += 0.3)
    for (const side of [-1, 1])
      b.box([x, 1.45, side * 1.23], [0.1, 2.45, 0.03], rib);
  for (const side of [-1, 1]) b.box([-3.0, 1.45, side * 0.6], [0.03, 2.5, 1.15], rib);
  for (const z of [-0.95, -0.3, 0.3, 0.95])
    b.rod([-3.04, 0.25, z], [-3.04, 2.65, z], 0.025, CHROME);
};

/** a portable toilet, 1.15 m square, 2.3 m high, door at +x */
export const portableToilet = (b: LowPolyBuilder): void => {
  const blue = "#2c62b5";
  b.box([0, 0.06, 0], [1.2, 0.12, 1.2], "#444a50");
  b.box([0, 1.15, 0], [1.1, 2.06, 1.1], blue);
  b.box([0.555, 1.05, 0], [0.03, 1.85, 0.8], tint(blue, 0.8));
  b.box([0.58, 1.05, 0.3], [0.04, 0.12, 0.05], CHROME);
  b.box([0, 2.22, 0], [1.18, 0.1, 1.18], "#e8e6df");
  b.cone([0, 2.27, 0], 0.8, 0.12, 4, "#e8e6df", Math.PI / 4);
  b.rod([-0.45, 1.8, -0.45], [-0.45, 2.6, -0.45], 0.05, "#d0d2d4");
};

/**
 * Site fencing along a line of ground points (about 3.5 m apart): mesh
 * panels standing in feet, clamped at the top, now and then a warning sign
 * or a privacy screen.
 */
export const siteFence = (b: LowPolyBuilder, line: readonly V3[]): void => {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay, az] = line[i];
    const [bx, by, bz] = line[i + 1];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.5) continue;
    b.placed([ax, ay, az], Math.atan2(-(bz - az), bx - ax), () =>
      fencePanel(b, length, by - ay, i, i + 2 === line.length)
    );
  }
};

const FENCE_FOOT = "#c96a32";
const FENCE_TUBE = "#b9bfc4";
const FENCE_MESH = "#a3a9ae";

const fencePanel = (
  b: LowPolyBuilder,
  length: number,
  rise: number,
  index: number,
  last: boolean
): void => {
  const at = (x: number) => (rise * x) / length;
  b.box([0, 0.07, 0], [0.7, 0.14, 0.22], FENCE_FOOT);
  if (last) b.box([length, rise + 0.07, 0], [0.7, 0.14, 0.22], FENCE_FOOT);
  b.box([0, 1.95, 0], [0.12, 0.08, 0.07], STEEL_DARK);
  const x0 = 0.08;
  const x1 = length - 0.08;
  for (const x of [x0, x1])
    b.rod([x, at(x) + 0.12, 0], [x, at(x) + 2.0, 0], 0.021, FENCE_TUBE);
  for (const y of [0.18, 1.96])
    b.rod([x0, at(x0) + y, 0], [x1, at(x1) + y, 0], 0.021, FENCE_TUBE);
  for (const y of [0.8, 1.4])
    b.rod([x0, at(x0) + y, 0], [x1, at(x1) + y, 0], 0.006, FENCE_MESH, 3);
  for (let x = x0 + 0.5; x < x1 - 0.2; x += 0.5)
    b.rod([x, at(x) + 0.18, 0], [x, at(x) + 1.96, 0], 0.006, FENCE_MESH, 3);
  const mid = length / 2;
  if (index % 6 === 2)
    b.box([mid, at(mid) + 1.05, 0.03], [length - 0.3, 1.6, 0.015], "#2f4b3a");
  else if (index % 6 === 4) {
    b.box([mid, at(mid) + 1.45, 0.03], [0.5, 0.35, 0.015], "#f0c419");
    b.box([mid, at(mid) + 1.45, 0.04], [0.36, 0.06, 0.01], "#1d1d1b");
  }
};

/** what a pallet carries */
export type PalletLoad = "bricks" | "bags" | "kerbs";

/** a euro pallet, 1.2 m along x by 0.8 m, loaded */
export const pallet = (b: LowPolyBuilder, load: PalletLoad): void => {
  for (const z of [-0.35, 0, 0.35])
    b.box([0, 0.05, z], [1.2, 0.1, 0.1], PALLET_WOOD);
  for (const x of [-0.54, -0.27, 0, 0.27, 0.54])
    b.box([x, 0.122, 0], [0.12, 0.022, 0.8], PALLET_WOOD);
  if (load === "bricks") {
    b.box([0, 0.55, 0], [1.15, 0.8, 0.78], "#b5553a");
    for (const x of [-0.3, 0.3])
      b.box([x, 0.55, 0], [0.03, 0.82, 0.8], "#2a2a2a");
    b.box([0, 0.96, 0], [1.16, 0.02, 0.79], gloss("#d6d9dc"));
  } else if (load === "kerbs") {
    for (const y of [0.3, 0.62])
      b.box([0, y, 0], [1.15, 0.3, 0.76], "#9a9993");
  } else
    for (let layer = 0; layer < 4; layer++)
      for (const [x, z] of [
        [-0.3, -0.2],
        [0.3, -0.2],
        [-0.3, 0.2],
        [0.3, 0.2],
      ] as const)
        b.box(
          [layer % 2 ? z * 1.5 : x, 0.2 + layer * 0.13, layer % 2 ? x * 0.66 : z],
          layer % 2 ? [0.4, 0.12, 0.58] : [0.58, 0.12, 0.38],
          layer % 2 ? "#d8d2c0" : "#cfc8b4"
        );
};

/**
 * Pipes lying stacked on two sleepers, `length` along x: rows of 4, 3, 2,
 * 1 for thin ones, two side by side for big concrete ones.
 */
export const pipes = (
  b: LowPolyBuilder,
  kind: "plastic" | "concrete"
): void => {
  const concrete = kind === "concrete";
  const radius = concrete ? 0.5 : 0.16;
  const length = concrete ? 2.5 : 5;
  const rows = concrete ? [2] : [4, 3, 2, 1];
  const paint = concrete ? "#a4a29b" : "#c9662c";
  const across = rows[0] * radius * 2 + 0.3;
  for (const x of [-length * 0.32, length * 0.32])
    b.box([x, 0.06, 0], [0.12, 0.12, across], TIMBER);
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const z = (i - (count - 1) / 2) * radius * 2.02;
      const y = 0.12 + radius + row * radius * 1.74;
      b.cylinder([0, y, z], radius, length, 8, paint, "x");
      b.cylinder([0, y, z], radius * 0.8, length + 0.02, 8, "#3b3a37", "x");
    }
  });
};

/** a traffic cone, 0.5 m */
export const trafficCone = (b: LowPolyBuilder): void => {
  b.box([0, 0.02, 0], [0.36, 0.04, 0.36], "#2a2a2a");
  b.cylinder([0, 0.27, 0], 0.16, 0.46, 8, "#f0601f", "y", 0.03);
  b.cylinder([0, 0.3, 0], 0.095, 0.09, 8, "#f2f2ee", "y", 0.08);
};

/** a skip, 3.6 m long, with rubble in it */
export const skip = (b: LowPolyBuilder, paint: string): void => {
  b.profile(
    [
      [-1.4, 0.08],
      [1.4, 0.08],
      [1.85, 1.3],
      [-1.85, 1.3],
    ],
    1.75,
    paint,
    { bevel: 0.04 }
  );
  for (const x of [-0.8, 0.8]) b.box([x, 0.04, 0], [0.12, 0.08, 1.6], STEEL_DARK);
  for (const side of [-1, 1]) {
    b.cylinder([0, 1.0, side * 0.92], 0.08, 0.1, 6, STEEL_DARK, "z");
    for (const x of [-0.9, 0, 0.9])
      b.box([x, 0.7, side * 0.885], [0.08, 1.15, 0.03], tint(paint, 0.8));
  }
  b.blob([0.1, 1.25, 0], [1.6, 0.35, 0.75], "#8d8172", 7);
};

/** a wheelbarrow, wheel at +x, its handles at about x = -0.85 */
export const wheelbarrow = (b: LowPolyBuilder): void => {
  b.profile(
    [
      [-0.35, 0.38],
      [0.35, 0.38],
      [0.6, 0.68],
      [-0.45, 0.68],
    ],
    0.62,
    gloss("#2f6e3b"),
    { bevel: 0.03 }
  );
  b.wheel([0.6, 0.2, 0], 0.2, 0.08, "#c9662c");
  for (const side of [-1, 1]) {
    b.rod([0.6, 0.2, side * 0.06], [-0.9, 0.72, side * 0.27], 0.02, STEEL_DARK);
    b.rod([-0.3, 0.35, side * 0.22], [-0.35, 0, side * 0.24], 0.02, STEEL_DARK);
  }
};

/** a worker in hi-vis, standing or walking; `arms` as for a person */
export const worker = (
  b: LowPolyBuilder,
  seed: number,
  pose: { walk?: boolean; arms?: PersonPose["arms"] } = {}
): void =>
  person(b, seed, {
    worker: true,
    legs: pose.walk ? "walk" : "stand",
    arms: pose.arms,
  });

/** a worker shovelling, the shovel's blade in the ground ahead */
export const shoveller = (b: LowPolyBuilder, seed: number): void => {
  person(b, seed, { worker: true, arms: "hold" });
  b.rod([0.3, 1.1, 0.05], [0.75, 0.15, 0.05], 0.018, TIMBER);
  b.box([0.8, 0.08, 0.05], [0.22, 0.03, 0.2], STEEL_DARK, [0, 0, 0.6]);
};

/** a worker pushing a wheelbarrow; both face +x */
export const barrowPusher = (b: LowPolyBuilder, seed: number): void => {
  person(b, seed, { worker: true, legs: "walk" });
  b.transformed(new THREE.Matrix4().makeTranslation(0.9, 0, 0), () =>
    wheelbarrow(b)
  );
};
