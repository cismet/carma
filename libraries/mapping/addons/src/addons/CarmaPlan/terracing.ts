import {
  smooth01,
  smoothstep,
  type Point,
  type SiteFrame,
} from "./site-frame";

/**
 * Grading a sloping site into level terraces, the ground most planned uses
 * need: a construction site its machines can drive on, a parking lot, a
 * playground. The levels run across the slope (along v), one after the other
 * up it (along u). Between two levels lies a bank; somewhere along each bank
 * a ramp, much gentler, connects them. At the site edge everything blends
 * back into the untouched DGM, so it meets the mesh where the cut is.
 */

export type TerracingOptions = {
  /** the height between levels the grading aims for, metres */
  stepHeight: number;
  minLevels: number;
  maxLevels: number;
  /** narrowest level, metres along the slope */
  minLevelDepth: number;
  /** smallest step even on flat ground (0 for none), metres */
  minStep: number;
  /** fall kept on each level for drainage, rise over run */
  levelGrade: number;
  /** steepest part of a bank, rise over run */
  bankGrade: number;
  /** steepest part of a ramp, rise over run */
  rampGrade: number;
  /** ramp width, metres */
  rampWidth: number;
  /** width of the blend into the untouched ground at the site edge, metres */
  edgeBlend: number;
};

export type TerraceZone = "level" | "bank" | "ramp" | "edge";

export type TerraceLevel = {
  index: number;
  /** u range of the level, banks included */
  uFrom: number;
  uTo: number;
  /** u of the level's middle */
  uMid: number;
};

export type TerraceRamp = {
  /** middle of the ramp in the site frame */
  x: number;
  z: number;
  /** uphill direction */
  dx: number;
  dz: number;
  length: number;
  width: number;
};

export type Terracing = {
  /** graded height, edge blend included */
  heightAt: (x: number, z: number) => number;
  zoneAt: (x: number, z: number) => TerraceZone;
  /**
   * The same zones as smooth weights for painting: `bank` 1 on a bank's
   * steep middle, 0 on a level; `ramp` 1 on a ramp, fading out at its
   * sides and ends. Both 0 in the edge blend's outer part.
   */
  surfaceAt: (x: number, z: number) => { bank: number; ramp: number };
  /** on a level, at least `margin` metres away from banks, ramps and edge */
  isLevel: (x: number, z: number, margin?: number) => boolean;
  /** index of the level a point belongs to */
  levelAt: (x: number, z: number) => number;
  levels: TerraceLevel[];
  ramps: TerraceRamp[];
  /** uphill unit vector, and the one along the levels */
  uAxis: Point;
  vAxis: Point;
  uRange: Point;
  vRange: Point;
  u: (x: number, z: number) => number;
  v: (x: number, z: number) => number;
  /** site frame point of (u, v) */
  at: (u: number, v: number) => Point;
};

/** how far a ramp widens into the bank on each side, metres */
const RAMP_FLARE = 4;
/** gradient below which a site counts as flat */
const FLAT_GRADE = 0.004;

type Boundary = {
  u: number;
  /** height jump across the boundary */
  jump: number;
  bankHalf: number;
  rampHalf: number;
  rampV: number | null;
};

export const createTerracing = (
  frame: SiteFrame,
  options: TerracingOptions
): Terracing => {
  const { plane } = frame;
  const grade = Math.hypot(plane.b, plane.c);
  const flat = grade < FLAT_GRADE;
  let ux: number;
  let uz: number;
  if (!flat) {
    ux = plane.b / grade;
    uz = plane.c / grade;
  } else if (frame.maxX - frame.minX >= frame.maxZ - frame.minZ) {
    ux = 1;
    uz = 0;
  } else {
    ux = 0;
    uz = 1;
  }
  const vx = -uz;
  const vz = ux;
  const u = (x: number, z: number) => x * ux + z * uz;
  const v = (x: number, z: number) => x * vx + z * vz;
  const at = (uu: number, vv: number): Point => [
    uu * ux + vv * vx,
    uu * uz + vv * vz,
  ];

  const corners = frame.rings.flat();
  const us = corners.map(([x, z]) => u(x, z));
  const vs = corners.map(([x, z]) => v(x, z));
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const span = Math.max(1e-6, uMax - uMin);

  const slope = flat ? 0 : grade;
  let count = Math.round((slope * span) / options.stepHeight) + 1;
  count = Math.min(options.maxLevels, Math.max(options.minLevels, count));
  count = Math.max(
    1,
    Math.min(count, Math.floor(span / options.minLevelDepth))
  );
  const depth = span / count;
  const uOf = (k: number) => uMin + (k + 0.5) * depth;
  const uCentre = (uMin + uMax) / 2;
  const [cx, cz] = at(uCentre, (vMin + vMax) / 2);
  const hCentre = plane.a + plane.b * cx + plane.c * cz;
  const step = count > 1 ? Math.max(slope * depth, options.minStep) : 0;
  const levelGrade = Math.min(slope, options.levelGrade);
  const base = hCentre + (0 - (count - 1) / 2) * step;
  const jump = step - levelGrade * depth;

  const levels: TerraceLevel[] = Array.from({ length: count }, (_, k) => ({
    index: k,
    uFrom: uMin + k * depth,
    uTo: uMin + (k + 1) * depth,
    uMid: uOf(k),
  }));

  const boundaries: Boundary[] = [];
  for (let k = 1; k < count; k++) {
    const bu = uMin + k * depth;
    const bankHalf = Math.max(1, (0.75 * jump) / options.bankGrade);
    const rampHalf = Math.min(
      depth * 0.45,
      Math.max(bankHalf, (0.75 * jump) / options.rampGrade)
    );
    // the ramp goes where the bank is well inside the site, alternating
    // sides from bank to bank so the way up zigzags
    const preferred = vMin + (k % 2 === 1 ? 0.25 : 0.75) * (vMax - vMin);
    let rampV: number | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const clearance of [
      options.edgeBlend + options.rampWidth / 2 + 2,
      options.edgeBlend * 0.5 + options.rampWidth / 2,
    ]) {
      for (let vv = vMin; vv <= vMax; vv += 1) {
        const ok = [-rampHalf, 0, rampHalf].every((du) => {
          const [x, z] = at(bu + du, vv);
          return frame.inside(x, z) && frame.edgeDistance(x, z) >= clearance;
        });
        if (!ok) continue;
        const score = Math.abs(vv - preferred);
        if (score < best) {
          best = score;
          rampV = vv;
        }
      }
      if (rampV !== null) break;
    }
    boundaries.push({ u: bu, jump, bankHalf, rampHalf, rampV });
  }

  const rampMask = (boundary: Boundary, vv: number) =>
    boundary.rampV === null
      ? 0
      : 1 -
        smooth01(
          (Math.abs(vv - boundary.rampV) - options.rampWidth / 2) / RAMP_FLARE
        );
  const halfWidth = (boundary: Boundary, vv: number) => {
    const mask = rampMask(boundary, vv);
    return boundary.bankHalf + (boundary.rampHalf - boundary.bankHalf) * mask;
  };

  const graded = (x: number, z: number) => {
    const uu = u(x, z);
    const vv = v(x, z);
    let h = base + levelGrade * (uu - uOf(0));
    for (const boundary of boundaries) {
      const w = halfWidth(boundary, vv);
      h += boundary.jump * smooth01(((uu - boundary.u) / w + 1) / 2);
    }
    return h;
  };

  const heightAt = (x: number, z: number) => {
    const target = graded(x, z);
    const natural = frame.dgm(x, z) ?? target;
    const w = smoothstep(options.edgeBlend, frame.edgeDistance(x, z));
    return natural + (target - natural) * w;
  };

  const zoneAt = (x: number, z: number): TerraceZone => {
    if (frame.edgeDistance(x, z) < options.edgeBlend) return "edge";
    const uu = u(x, z);
    const vv = v(x, z);
    for (const boundary of boundaries)
      if (Math.abs(uu - boundary.u) < halfWidth(boundary, vv))
        return rampMask(boundary, vv) > 0.5 ? "ramp" : "bank";
    return "level";
  };

  const surfaceAt = (x: number, z: number) => {
    const uu = u(x, z);
    const vv = v(x, z);
    let bank = 0;
    let ramp = 0;
    for (const boundary of boundaries) {
      const w = halfWidth(boundary, vv);
      const across = Math.abs(uu - boundary.u);
      const inBank = 1 - smooth01((across - w * 0.75) / (w * 0.35 + 0.3));
      if (inBank <= 0) continue;
      const mask = rampMask(boundary, vv);
      bank = Math.max(bank, inBank * (1 - mask));
      // a ramp runs out onto the levels a little beyond its bank
      const onRamp =
        (1 - smooth01((across - w) / 2.5)) *
        (1 -
          smooth01(
            (Math.abs(vv - (boundary.rampV ?? Number.POSITIVE_INFINITY)) -
              options.rampWidth / 2) /
              0.6
          ));
      ramp = Math.max(ramp, onRamp);
    }
    const inner = smoothstep(options.edgeBlend * 0.6, frame.edgeDistance(x, z));
    return { bank: bank * inner, ramp: ramp * inner };
  };

  const isLevel = (x: number, z: number, margin = 0) => {
    if (!frame.inside(x, z)) return false;
    if (frame.edgeDistance(x, z) < options.edgeBlend + margin) return false;
    const uu = u(x, z);
    const vv = v(x, z);
    return boundaries.every(
      (boundary) =>
        Math.abs(uu - boundary.u) >= halfWidth(boundary, vv) + margin
    );
  };

  const levelAt = (x: number, z: number) =>
    Math.min(count - 1, Math.max(0, Math.floor((u(x, z) - uMin) / depth)));

  const ramps: TerraceRamp[] = boundaries
    .filter((boundary) => boundary.rampV !== null)
    .map((boundary) => {
      const [x, z] = at(boundary.u, boundary.rampV ?? 0);
      return {
        x,
        z,
        dx: ux,
        dz: uz,
        length: boundary.rampHalf * 2,
        width: options.rampWidth,
      };
    });

  return {
    heightAt,
    zoneAt,
    surfaceAt,
    isLevel,
    levelAt,
    levels,
    ramps,
    uAxis: [ux, uz],
    vAxis: [vx, vz],
    uRange: [uMin, uMax],
    vRange: [vMin, vMax],
    u,
    v,
    at,
  };
};
