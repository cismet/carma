import * as THREE from "three";

import { SUN } from "./light";

/**
 * A shadow map computed on the CPU, once per scenario: every model triangle
 * is rasterised into a grid that looks down the sun, keeping per cell the
 * surface nearest the sun. A point lies in shadow when something nearer the
 * sun covers its cell. Baking needs it twice: per vertex of the models, and
 * per pixel of the ground's shadow layer.
 */

/** cell size, metres */
const CELL = 0.15;
/** most cells along one side; a bigger scenario gets coarser cells */
const MAX_CELLS = 2048;
/** how far outside a triangle a cell centre may be and still count, cells;
 * gives thin parts (ropes, rails, posts) a shadow at all */
const COVER = 0.5;

const UP = new THREE.Vector3(0, 1, 0);

export class SunShadowMap {
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly depth: Float32Array;
  private readonly cell: number;
  private readonly u0: number;
  private readonly v0: number;
  private readonly width: number;
  private readonly height: number;

  /** `positions`: triangles in the site frame, 9 numbers each */
  constructor(positions: ArrayLike<number>) {
    this.u.crossVectors(UP, SUN).normalize();
    this.v.crossVectors(SUN, this.u).normalize();
    const { u, v } = this;
    let uMin = Number.POSITIVE_INFINITY;
    let uMax = Number.NEGATIVE_INFINITY;
    let vMin = Number.POSITIVE_INFINITY;
    let vMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i + 2 < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const pu = x * u.x + y * u.y + z * u.z;
      const pv = x * v.x + y * v.y + z * v.z;
      if (pu < uMin) uMin = pu;
      if (pu > uMax) uMax = pu;
      if (pv < vMin) vMin = pv;
      if (pv > vMax) vMax = pv;
    }
    if (!(uMax >= uMin)) {
      uMin = uMax = vMin = vMax = 0;
    }
    this.cell = Math.max(
      CELL,
      (uMax - uMin + 1) / MAX_CELLS,
      (vMax - vMin + 1) / MAX_CELLS
    );
    this.u0 = uMin - this.cell;
    this.v0 = vMin - this.cell;
    this.width = Math.ceil((uMax - uMin) / this.cell) + 3;
    this.height = Math.ceil((vMax - vMin) / this.cell) + 3;
    this.depth = new Float32Array(this.width * this.height).fill(
      Number.NEGATIVE_INFINITY
    );
    for (let i = 0; i + 8 < positions.length; i += 9)
      this.rasterise(positions, i);
  }

  private rasterise(p: ArrayLike<number>, i: number): void {
    const { u, v, cell, u0, v0, width, height, depth } = this;
    const project = (k: number) => {
      const x = p[k];
      const y = p[k + 1];
      const z = p[k + 2];
      return [
        (x * u.x + y * u.y + z * u.z - u0) / cell,
        (x * v.x + y * v.y + z * v.z - v0) / cell,
        x * SUN.x + y * SUN.y + z * SUN.z,
      ] as const;
    };
    const [ax, ay, ad] = project(i);
    const [bx, by, bd] = project(i + 3);
    const [cx, cy, cd] = project(i + 6);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    // seen edge on from the sun: the solid's other faces cast its shadow
    if (Math.abs(area) < 1e-6) return;
    const sign = area > 0 ? 1 : -1;
    const lab = Math.hypot(bx - ax, by - ay) || 1;
    const lbc = Math.hypot(cx - bx, cy - by) || 1;
    const lca = Math.hypot(ax - cx, ay - cy) || 1;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - COVER));
    const i1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx) + COVER));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - COVER));
    const j1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy) + COVER));
    for (let j = j0; j <= j1; j++) {
      const py = j + 0.5;
      for (let k = i0; k <= i1; k++) {
        const px = k + 0.5;
        // signed distances to the three edges, positive inside
        const eA = (sign * ((cx - bx) * (py - by) - (cy - by) * (px - bx))) / lbc;
        const eB = (sign * ((ax - cx) * (py - cy) - (ay - cy) * (px - cx))) / lca;
        const eC = (sign * ((bx - ax) * (py - ay) - (by - ay) * (px - ax))) / lab;
        if (eA < -COVER || eB < -COVER || eC < -COVER) continue;
        // barycentric weights, clamped for the cells just outside
        const wA = Math.max(0, eA * lbc);
        const wB = Math.max(0, eB * lca);
        const wC = Math.max(0, eC * lab);
        const sum = wA + wB + wC;
        const d =
          sum > 0 ? (wA * ad + wB * bd + wC * cd) / sum : (ad + bd + cd) / 3;
        const at = j * width + k;
        if (d > depth[at]) depth[at] = d;
      }
    }
  }

  /**
   * How much of the sun a point misses, 0 (lit) to 1 (in shadow), with the
   * four nearest cells blended for a soft edge. `bias` metres keeps a
   * surface from shadowing itself.
   */
  shadeAt(x: number, y: number, z: number, bias = 0.06): number {
    const { u, v, cell, u0, v0, width, height, depth } = this;
    const fu = (x * u.x + y * u.y + z * u.z - u0) / cell - 0.5;
    const fv = (x * v.x + y * v.y + z * v.z - v0) / cell - 0.5;
    const d = x * SUN.x + y * SUN.y + z * SUN.z + bias;
    const i = Math.floor(fu);
    const j = Math.floor(fv);
    const tu = fu - i;
    const tv = fv - j;
    const covered = (ii: number, jj: number) =>
      ii >= 0 && jj >= 0 && ii < width && jj < height && depth[jj * width + ii] > d
        ? 1
        : 0;
    return (
      (covered(i, j) * (1 - tu) + covered(i + 1, j) * tu) * (1 - tv) +
      (covered(i, j + 1) * (1 - tu) + covered(i + 1, j + 1) * tu) * tv
    );
  }
}
