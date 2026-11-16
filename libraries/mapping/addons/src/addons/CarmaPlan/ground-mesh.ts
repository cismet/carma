import * as THREE from "three";

import { blur, type GroundPainter } from "./ground-paint";
import { GROUND_SHADOW_TINT, groundLight } from "./light";
import type { Footprint } from "./lowpoly";
import type { SunShadowMap } from "./shadow-map";
import {
  clipToCell,
  ringArea,
  smooth01,
  type Point,
  type SiteFrame,
} from "./site-frame";

/**
 * The ground of a scenario: a smooth grid over the graded terrain, clipped
 * to the site, carrying the painted texture (ground-paint.ts) and lit by the
 * baked rig through its vertex colours. Fine grain comes from the shader, so
 * the ground stays crisp close up. A wall down from the site edge hides gaps
 * to a lower mesh round the hole.
 */

/** finest and coarsest grid, metres; the vertex count decides between */
const CELL_MIN = 0.5;
const CELL_MAX = 1;
const TARGET_NODES = 60000;
/** step of the shadow layers in the texture, metres */
const SHADOW_STEP = 0.15;
const MAX_SHADOW_CELLS = 2048;
/** how far a contact shadow reaches past its footprint, metres */
const CONTACT_SPREAD = 0.55;
const CONTACT_TINT = [0.5, 0.52, 0.56] as const;
const CONTACT_STRENGTH = 0.75;
/** rings of the floor under the mesh round the hole, metres out from the edge */
const FLOOR_RINGS = [0, 1, 2.5, 5, 8] as const;
/** how far the floor stays below the DGM and the edge, metres */
const FLOOR_CLEARANCE = 0.6;
/** the shade under a hedge or a wall, which is what a view under the rim meets */
const FLOOR_COLOUR = "#2c3527";
/** before everything else in the scene, so whatever else draws covers it */
const FLOOR_RENDER_ORDER = -1000;

/** heights on a regular grid over the site's box, bilinear in between */
export type HeightGrid = {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  heights: Float32Array;
  at: (x: number, z: number) => number;
};

export const sampleHeights = (
  frame: SiteFrame,
  heightAt: (x: number, z: number) => number
): HeightGrid => {
  const area = (frame.maxX - frame.minX + 2) * (frame.maxZ - frame.minZ + 2);
  const cell = Math.min(
    CELL_MAX,
    Math.max(CELL_MIN, Math.sqrt(area / TARGET_NODES))
  );
  const x0 = frame.minX - cell;
  const z0 = frame.minZ - cell;
  const nx = Math.ceil((frame.maxX - x0) / cell) + 2;
  const nz = Math.ceil((frame.maxZ - z0) / cell) + 2;
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++)
      heights[j * nx + i] = heightAt(x0 + i * cell, z0 + j * cell);
  const at = (x: number, z: number) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / cell));
    const fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / cell));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h = (ii: number, jj: number) => heights[jj * nx + ii];
    return (
      (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) +
      (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz
    );
  };
  return { x0, z0, cell, nx, nz, heights, at };
};

/** value noise for the grain, sharp at any zoom */
const GRAIN = `
uniform vec2 groundExtent;
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float grainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(grainHash(i), grainHash(i + vec2(1.0, 0.0)), f.x),
    mix(grainHash(i + vec2(0.0, 1.0)), grainHash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}`;

const groundMaterial = (texture: THREE.Texture, painter: GroundPainter) => {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundExtent = {
      value: new THREE.Vector2(painter.width, painter.depth),
    };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GRAIN}`)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // grain at 12 and 45 cm, each fading out once a pixel covers a cell
        vec2 groundMetres = vMapUv * groundExtent;
        float perPixel = length(fwidth(groundMetres));
        float grain =
          (grainNoise(groundMetres * 8.0) - 0.5) * 0.6 *
            clamp(1.5 - perPixel * 8.0, 0.0, 1.0) +
          (grainNoise(groundMetres * 2.2) - 0.5) * 0.4 *
            clamp(1.5 - perPixel * 2.2, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 + grain * 0.3;`
      );
  };
  material.customProgramCacheKey = () => "carma-plan-ground";
  return material;
};

/** builds the indexed ground mesh vertex by vertex */
class GroundGeometry {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  private readonly n = new THREE.Vector3();
  private readonly light = new THREE.Color();

  constructor(
    private readonly grid: HeightGrid,
    private readonly painter: GroundPainter
  ) {}

  vertex(x: number, y: number, z: number, darken = 1): number {
    const { grid, n } = this;
    const e = grid.cell;
    n.set(
      -(grid.at(x + e, z) - grid.at(x - e, z)) / (2 * e),
      1,
      -(grid.at(x, z + e) - grid.at(x, z - e)) / (2 * e)
    ).normalize();
    const light = groundLight(this.light, n);
    this.positions.push(x, y, z);
    this.uvs.push(
      (x - this.painter.x0) / this.painter.width,
      1 - (z - this.painter.z0) / this.painter.depth
    );
    this.colors.push(light.r * darken, light.g * darken, light.b * darken);
    return this.positions.length / 3 - 1;
  }
}

export const buildGroundMesh = (
  frame: SiteFrame,
  grid: HeightGrid,
  heightAt: (x: number, z: number) => number,
  painter: GroundPainter,
  skirtDepth: number
): { mesh: THREE.Mesh; dispose: () => void } => {
  const g = new GroundGeometry(grid, painter);
  const { cell, nx, nz, x0, z0, heights } = grid;
  const nodes = new Int32Array(nx * nz).fill(-1);
  const node = (i: number, j: number) => {
    const k = j * nx + i;
    if (nodes[k] < 0)
      nodes[k] = g.vertex(x0 + i * cell, heights[k], z0 + j * cell);
    return nodes[k];
  };
  const inner = cell * 0.75;
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const cx = x0 + (i + 0.5) * cell;
      const cz = z0 + (j + 0.5) * cell;
      if (frame.inside(cx, cz) && frame.edgeDistance(cx, cz) > inner) {
        const a = node(i, j);
        const b = node(i + 1, j);
        const c = node(i, j + 1);
        const d = node(i + 1, j + 1);
        g.indices.push(a, c, b, b, c, d);
        continue;
      }
      // a cell on the site edge: its part of each ring, triangulated
      for (const ring of frame.rings) {
        const piece = clipToCell(
          ring,
          cx - cell / 2,
          cz - cell / 2,
          cx + cell / 2,
          cz + cell / 2
        );
        if (piece.length < 3 || ringArea(piece) < 1e-5) continue;
        const ids = piece.map(([x, z]) => g.vertex(x, heightAt(x, z), z));
        const contour = piece.map(([x, z]) => new THREE.Vector2(x, z));
        for (const [p, q, r] of THREE.ShapeUtils.triangulateShape(contour, []))
          g.indices.push(ids[p], ids[q], ids[r]);
      }
    }

  // the wall down from the edge, in the shade of its own soil
  for (const ring of frame.rings)
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / cell));
      for (let s = 0; s < steps; s++) {
        const px = x1 + ((x2 - x1) * s) / steps;
        const pz = z1 + ((z2 - z1) * s) / steps;
        const qx = x1 + ((x2 - x1) * (s + 1)) / steps;
        const qz = z1 + ((z2 - z1) * (s + 1)) / steps;
        const hp = heightAt(px, pz);
        const hq = heightAt(qx, qz);
        const a = g.vertex(px, hp, pz, 0.55);
        const b = g.vertex(qx, hq, qz, 0.55);
        const c = g.vertex(qx, hq - skirtDepth, qz, 0.35);
        const d = g.vertex(px, hp - skirtDepth, pz, 0.35);
        g.indices.push(a, b, c, a, c, d);
      }
    }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(g.positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(g.uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(g.colors, 3));
  geometry.setIndex(g.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const texture = painter.texture();
  const material = groundMaterial(texture, painter);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "carma-plan ground";
  const floor = buildRimFloor(frame, heightAt, cell);
  mesh.add(floor);
  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
    },
  };
};

/**
 * A floor under the mesh outside the hole, below the DGM. Where the mesh at
 * the cut stands higher than the site edge (a hedge, a wall), a view from
 * inside the site passes under the cut rim; it lands on this dark floor
 * instead of on nothing. The floor is drawn first and writes no depth, so
 * the mesh, the ground and the models paint over it wherever they draw, also
 * where the mesh lies lower than the DGM.
 */
const buildRimFloor = (
  frame: SiteFrame,
  heightAt: (x: number, z: number) => number,
  cell: number
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of frame.rings) {
    const n = ring.length;
    let signedArea = 0;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % n];
      signedArea += x1 * z2 - x2 * z1;
    }
    const side = signedArea > 0 ? 1 : -1;
    const normals: Point[] = ring.map(([x1, z1], i) => {
      const [x2, z2] = ring[(i + 1) % n];
      const length = Math.hypot(x2 - x1, z2 - z1) || 1;
      return [(side * (z2 - z1)) / length, (-side * (x2 - x1)) / length];
    });
    // at a corner the floor turns along the bisector, so no wedge stays open
    const corners: Point[] = normals.map(([ax, az], i) => {
      const [bx, bz] = normals[(i + n - 1) % n];
      const length = Math.hypot(ax + bx, az + bz);
      return length > 1e-3
        ? [(ax + bx) / length, (az + bz) / length]
        : [ax, az];
    });
    for (let i = 0; i < n; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % n];
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / cell));
      const columns: number[][] = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x1 + (x2 - x1) * t;
        const pz = z1 + (z2 - z1) * t;
        const [ox, oz] =
          s === 0
            ? corners[i]
            : s === steps
            ? corners[(i + 1) % n]
            : normals[i];
        const edge = heightAt(px, pz);
        columns.push(
          FLOOR_RINGS.map((reach) => {
            const x = px + ox * reach;
            const z = pz + oz * reach;
            const y = Math.min(edge, frame.dgm(x, z) ?? edge) - FLOOR_CLEARANCE;
            positions.push(x, y, z);
            return positions.length / 3 - 1;
          })
        );
      }
      for (let s = 0; s < steps; s++)
        for (let k = 0; k + 1 < FLOOR_RINGS.length; k++) {
          const a = columns[s][k];
          const b = columns[s + 1][k];
          const c = columns[s + 1][k + 1];
          const d = columns[s][k + 1];
          indices.push(a, b, c, a, c, d);
        }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const floor = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: FLOOR_COLOUR,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  floor.name = "carma-plan rim floor";
  floor.renderOrder = FLOOR_RENDER_ORDER;
  return floor;
};

/** signed distance to a convex quad, negative inside, metres */
const quadDistance = (quad: Footprint, x: number, z: number): number => {
  let area = 0;
  for (let i = 0; i < quad.length; i++) {
    const [ax, az] = quad[i];
    const [bx, bz] = quad[(i + 1) % quad.length];
    area += ax * bz - bx * az;
  }
  const sign = area > 0 ? 1 : -1;
  let distance = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < quad.length; i++) {
    const [ax, az] = quad[i];
    const [bx, bz] = quad[(i + 1) % quad.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) continue;
    // outward normal of the edge
    const nx = (sign * (bz - az)) / length;
    const nz = (-sign * (bx - ax)) / length;
    distance = Math.max(distance, (x - ax) * nx + (z - az) * nz);
  }
  return distance;
};

/**
 * Paints the sun's shadows of the models onto the ground, then the soft
 * contact shadows under everything that stands on it.
 */
export const paintGroundShadows = (
  painter: GroundPainter,
  grid: HeightGrid,
  shadow: SunShadowMap,
  footprints: readonly Footprint[]
): void => {
  const step = Math.max(
    SHADOW_STEP,
    painter.width / MAX_SHADOW_CELLS,
    painter.depth / MAX_SHADOW_CELLS
  );
  const nx = Math.ceil(painter.width / step) + 1;
  const nz = Math.ceil(painter.depth / step) + 1;
  const sun = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = painter.z0 + j * step;
    for (let i = 0; i < nx; i++) {
      const x = painter.x0 + i * step;
      sun[j * nx + i] = shadow.shadeAt(x, grid.at(x, z), z, 0.05);
    }
  }
  blur(sun, nx, nz, 1);
  painter.multiply(sun, nx, nz, step, GROUND_SHADOW_TINT, 1);

  const contact = new Float32Array(nx * nz);
  for (const quad of footprints) {
    const xs = quad.map(([x]) => x);
    const zs = quad.map(([, z]) => z);
    const i0 = Math.max(
      0,
      Math.floor((Math.min(...xs) - CONTACT_SPREAD - painter.x0) / step)
    );
    const i1 = Math.min(
      nx - 1,
      Math.ceil((Math.max(...xs) + CONTACT_SPREAD - painter.x0) / step)
    );
    const j0 = Math.max(
      0,
      Math.floor((Math.min(...zs) - CONTACT_SPREAD - painter.z0) / step)
    );
    const j1 = Math.min(
      nz - 1,
      Math.ceil((Math.max(...zs) + CONTACT_SPREAD - painter.z0) / step)
    );
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = quadDistance(
          quad,
          painter.x0 + i * step,
          painter.z0 + j * step
        );
        const a = 1 - smooth01((d + 0.15) / (CONTACT_SPREAD + 0.15));
        const k = j * nx + i;
        if (a > contact[k]) contact[k] = a;
      }
  }
  blur(contact, nx, nz, 1, 1);
  painter.multiply(contact, nx, nz, step, CONTACT_TINT, CONTACT_STRENGTH);
};

