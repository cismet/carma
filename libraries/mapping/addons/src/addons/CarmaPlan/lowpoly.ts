import * as THREE from "three";

import { SUN, shade, type Finish } from "./light";
import type { SunShadowMap } from "./shadow-map";
import { hash, smooth01, type Point } from "./site-frame";

/**
 * Collects the models of a scenario as flat-shaded triangles, one colour per
 * part, and bakes them into one vertex-coloured mesh: the light rig of
 * light.ts with the sun's shadows from a shadow map over all models, so the
 * scenario looks the same whatever lights the shared scene has, and stays
 * one draw call.
 *
 * Primitives are given in the current local frame; `placed` moves that frame
 * to a spot in the site frame and turns it. Models are built with x forward,
 * y up and z to the right, standing on y = 0.
 */

export type V3 = readonly [number, number, number];
export type { Finish };
/** a colour (matte), or a colour with another finish */
export type Paint =
  | string
  | { readonly color: string; readonly finish: Finish };

export const gloss = (color: string): Paint => ({ color, finish: "gloss" });
export const glass = (color = "#28333b"): Paint => ({ color, finish: "glass" });
export const glow = (color: string): Paint => ({ color, finish: "glow" });

const FINISHES: readonly Finish[] = ["matte", "gloss", "glass", "glow"];

/** below this height over its base a vertex gets less sky light, metres */
const AO_HEIGHT = 0.9;
const AO_MIN = 0.6;
/** a part whose lowest point is below this, metres over its base, casts a
 * contact shadow from its parts lower than CONTACT_REACH */
const CONTACT_TOUCH = 0.45;
const CONTACT_REACH = 0.9;
/** pushed off the surface before asking the shadow map, metres */
const NORMAL_OFFSET = 0.05;
const SHADOW_BIAS = 0.04;

/** where a part stands on the ground: a convex quad in site x, z */
export type Footprint = readonly Point[];

/** which way a triangle faces: away from a point, upwards, or as wound */
type Facing = V3 | "up" | "winding";

type Placement = {
  /** placement frame to site frame */
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
};

type PartBounds = {
  minY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export class LowPolyBuilder {
  private readonly positions: number[] = [];
  /** per vertex, share of the sky reaching it */
  private readonly occlusion: number[] = [];
  /** per triangle: normal, base colour (linear), finish */
  private readonly normals: number[] = [];
  private readonly bases: number[] = [];
  private readonly finishes: number[] = [];
  readonly footprints: Footprint[] = [];

  private matrix = new THREE.Matrix4();
  private placement: Placement | null = null;
  private partDepth = 0;
  private part: PartBounds | null = null;
  private readonly colorCache = new Map<string, THREE.Color>();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly r = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly local = new THREE.Vector3();

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /** every triangle in the site frame, 9 numbers each, for the shadow map */
  get triangles(): readonly number[] {
    return this.positions;
  }

  /** draw with the local frame moved to (x, y, z), turned by `yaw` about y
   * and tilted by `pitch` about its own z (nose up for positive pitch) */
  placed(
    [x, y, z]: V3,
    yaw: number,
    draw: () => void,
    pitch = 0
  ): void {
    const move = new THREE.Matrix4()
      .makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationZ(pitch));
    if (this.placement) {
      this.transformed(move, draw);
      return;
    }
    const matrix = this.matrix.clone().multiply(move);
    this.placement = { matrix, inverse: matrix.clone().invert() };
    try {
      this.transformed(move, draw);
    } finally {
      this.placement = null;
    }
  }

  transformed(matrix: THREE.Matrix4, draw: () => void): void {
    const saved = this.matrix;
    this.matrix = saved.clone().multiply(matrix);
    try {
      draw();
    } finally {
      this.matrix = saved;
    }
  }

  /** a named part of a model: its triangles are one piece for the contact
   * shadow; every primitive is one already */
  private asPart(draw: () => void): void {
    this.partDepth += 1;
    if (this.partDepth === 1) this.part = null;
    try {
      draw();
    } finally {
      this.partDepth -= 1;
      if (this.partDepth === 0) this.endPart();
    }
  }

  private endPart(): void {
    const { part, placement } = this;
    this.part = null;
    if (!part || !placement || part.minY > CONTACT_TOUCH) return;
    if (!(part.maxX >= part.minX) || !(part.maxZ >= part.minZ)) return;
    const corner = (x: number, z: number): Point => {
      const v = this.local.set(x, 0, z).applyMatrix4(placement.matrix);
      return [v.x, v.z];
    };
    this.footprints.push([
      corner(part.minX, part.minZ),
      corner(part.maxX, part.minZ),
      corner(part.maxX, part.maxZ),
      corner(part.minX, part.maxZ),
    ]);
  }

  /**
   * One triangle in local coordinates. It faces away from `facing` (a local
   * point) for closed convex shapes, upwards for things lying on the ground,
   * or as wound (counter-clockwise seen from outside) for extruded shapes.
   */
  triangle(a: V3, b: V3, c: V3, paint: Paint, facing: Facing = "up"): void {
    const { p, q, r } = this;
    p.set(a[0], a[1], a[2]).applyMatrix4(this.matrix);
    q.set(b[0], b[1], b[2]).applyMatrix4(this.matrix);
    r.set(c[0], c[1], c[2]).applyMatrix4(this.matrix);
    const center =
      typeof facing === "string"
        ? null
        : this.c.set(facing[0], facing[1], facing[2]).applyMatrix4(this.matrix);
    this.push(p, q, r, paint, facing === "winding" ? "winding" : center);
  }

  private colorOf(hex: string): THREE.Color {
    let color = this.colorCache.get(hex);
    if (!color) {
      color = new THREE.Color(hex);
      this.colorCache.set(hex, color);
    }
    return color;
  }

  /** triangle already in the site frame */
  private push(
    p: THREE.Vector3,
    q: THREE.Vector3,
    r: THREE.Vector3,
    paint: Paint,
    facing: THREE.Vector3 | "winding" | null
  ): void {
    const { n, e } = this;
    n.subVectors(q, p).cross(e.subVectors(r, p));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    if (facing instanceof THREE.Vector3) {
      e.set(
        (p.x + q.x + r.x) / 3 - facing.x,
        (p.y + q.y + r.y) / 3 - facing.y,
        (p.z + q.z + r.z) / 3 - facing.z
      );
      if (n.dot(e) < 0) n.negate();
    } else if (facing === null && n.y < 0) n.negate();
    const { color, finish } =
      typeof paint === "string" ? { color: paint, finish: "matte" } : paint;
    const base = this.colorOf(color);
    this.normals.push(n.x, n.y, n.z);
    this.bases.push(base.r, base.g, base.b);
    this.finishes.push(FINISHES.indexOf(finish as Finish));
    for (const v of [p, q, r]) {
      this.positions.push(v.x, v.y, v.z);
      this.occlusion.push(this.track(v));
    }
  }

  /** the sky share of a vertex, and the part's ground contact on the way */
  private track(v: THREE.Vector3): number {
    const { placement } = this;
    if (!placement) return 1;
    const local = this.local.copy(v).applyMatrix4(placement.inverse);
    if (this.partDepth > 0) {
      const part = (this.part ??= {
        minY: Number.POSITIVE_INFINITY,
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minZ: Number.POSITIVE_INFINITY,
        maxZ: Number.NEGATIVE_INFINITY,
      });
      part.minY = Math.min(part.minY, local.y);
      if (local.y < CONTACT_REACH) {
        part.minX = Math.min(part.minX, local.x);
        part.maxX = Math.max(part.maxX, local.x);
        part.minZ = Math.min(part.minZ, local.z);
        part.maxZ = Math.max(part.maxZ, local.z);
      }
    }
    return AO_MIN + (1 - AO_MIN) * smooth01(local.y / AO_HEIGHT);
  }

  /** a box round `center`, optionally turned by an Euler (radians, XYZ) */
  box(center: V3, size: V3, paint: Paint, rotation?: V3): void {
    const basis = new THREE.Matrix4().makeTranslation(
      center[0],
      center[1],
      center[2]
    );
    if (rotation)
      basis.multiply(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(rotation[0], rotation[1], rotation[2])
        )
      );
    this.asPart(() => this.transformed(basis, () => this.unitBox(size, paint)));
  }

  /**
   * A bar from `from` to `to`, `width` across (horizontal) and `thickness`
   * high; for beams, planks, rails, a boom.
   */
  beam(from: V3, to: V3, width: number, paint: Paint, thickness = width): void {
    const basis = this.basisAlong(from, to);
    if (!basis) return;
    this.asPart(() =>
      this.transformed(basis.matrix, () =>
        this.unitBox([basis.length, thickness, width], paint)
      )
    );
  }

  /** a round bar from `from` to `to`; posts, poles, pipes, ropes */
  rod(from: V3, to: V3, radius: number, paint: Paint, segments = 6): void {
    const basis = this.basisAlong(from, to);
    if (!basis) return;
    this.asPart(() =>
      this.transformed(basis.matrix, () =>
        this.cylinder([0, 0, 0], radius, basis.length, segments, paint, "x")
      )
    );
  }

  /** a frame with x along from -> to, its middle at the origin */
  private basisAlong(
    from: V3,
    to: V3
  ): { matrix: THREE.Matrix4; length: number } | null {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const length = a.distanceTo(b);
    if (length < 1e-6) return null;
    const x = b.clone().sub(a).normalize();
    let z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(0, 1, 0));
    if (z.lengthSq() < 1e-6) z = new THREE.Vector3(0, 0, 1);
    z.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return {
      matrix: new THREE.Matrix4()
        .makeBasis(x, y, z)
        .setPosition(a.add(b).multiplyScalar(0.5)),
      length,
    };
  }

  private unitBox([sx, sy, sz]: V3, paint: Paint): void {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const v = (i: number): V3 => [
      i & 1 ? hx : -hx,
      i & 2 ? hy : -hy,
      i & 4 ? hz : -hz,
    ];
    const faces = [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ];
    for (const [a, b, c, d] of faces) {
      this.triangle(v(a), v(b), v(c), paint, [0, 0, 0]);
      this.triangle(v(a), v(c), v(d), paint, [0, 0, 0]);
    }
  }

  /**
   * A cylinder round `center` along a local axis with flat caps; with
   * `topRadius` a frustum (0 for a cone)
   */
  cylinder(
    center: V3,
    radius: number,
    length: number,
    segments: number,
    paint: Paint,
    axis: "x" | "y" | "z" = "y",
    topRadius = radius
  ): void {
    const rotation =
      axis === "y"
        ? new THREE.Matrix4()
        : axis === "x"
        ? new THREE.Matrix4().makeRotationZ(-Math.PI / 2)
        : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    this.asPart(() =>
      this.transformed(
        new THREE.Matrix4()
          .makeTranslation(center[0], center[1], center[2])
          .multiply(rotation),
        () => {
          const h = length / 2;
          const ring = (y: number, r: number) =>
            Array.from({ length: segments }, (_, i): V3 => {
              const angle = (i / segments) * Math.PI * 2;
              return [Math.cos(angle) * r, y, Math.sin(angle) * r];
            });
          const bottom = ring(-h, radius);
          const top = ring(h, topRadius);
          for (let i = 0; i < segments; i++) {
            const j = (i + 1) % segments;
            this.triangle(bottom[i], bottom[j], top[j], paint, [0, 0, 0]);
            this.triangle(bottom[i], top[j], top[i], paint, [0, 0, 0]);
            if (topRadius > 0)
              this.triangle([0, h, 0], top[i], top[j], paint, [0, 0, 0]);
            this.triangle([0, -h, 0], bottom[j], bottom[i], paint, [0, 0, 0]);
          }
        }
      )
    );
  }

  /** a wheel with its tyre and hub, axle along z */
  wheel(center: V3, radius: number, width: number, hub = "#c4c7ca"): void {
    this.cylinder(center, radius, width, 10, "#222222", "z");
    this.cylinder(center, radius * 0.55, width + 0.03, 8, gloss(hub), "z");
  }

  /** a cone or pyramid standing on `base`; 4 segments with a 45 degree turn
   * make a square roof */
  cone(
    base: V3,
    radius: number,
    height: number,
    segments: number,
    paint: Paint,
    turn = 0
  ): void {
    const ring = Array.from({ length: segments }, (_, i): V3 => {
      const angle = turn + (i / segments) * Math.PI * 2;
      return [
        base[0] + Math.cos(angle) * radius,
        base[1],
        base[2] + Math.sin(angle) * radius,
      ];
    });
    const apex: V3 = [base[0], base[1] + height, base[2]];
    const center: V3 = [base[0], base[1] + height / 3, base[2]];
    this.asPart(() => {
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        this.triangle(ring[i], ring[j], apex, paint, center);
        this.triangle(base, ring[j], ring[i], paint, center);
      }
    });
  }

  /**
   * A squashed, slightly irregular blob round `center` with radii `size`;
   * crowns, hedges, heaps, heads. `seed` varies the irregularity.
   */
  blob(center: V3, size: V3, paint: Paint, seed = 0, detail = 0): void {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const k = 0.88 + 0.24 * hash(x * 7, z * 7 + y * 3, seed);
      position.setXYZ(
        i,
        center[0] + x * size[0] * k,
        center[1] + y * size[1] * k,
        center[2] + z * size[2] * k
      );
    }
    this.asPart(() => this.geometry(geometry, paint, center));
    geometry.dispose();
  }

  /**
   * A side profile drawn in (x forward, y up), extruded `width` across z
   * round `offset`, its long edges rounded by `bevel` metres; for bodies of
   * vehicles, cabins, slides.
   */
  profile(
    outline: readonly Point[],
    width: number,
    paint: Paint,
    options: { bevel?: number; offset?: number; segments?: number } = {}
  ): void {
    const bevel = Math.min(options.bevel ?? 0, width / 2.5);
    const geometry = new THREE.ExtrudeGeometry(
      new THREE.Shape(outline.map(([a, b]) => new THREE.Vector2(a, b))),
      {
        depth: width - 2 * bevel,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -bevel,
        bevelSegments: options.segments ?? 2,
        curveSegments: 4,
      }
    );
    geometry.translate(0, 0, (options.offset ?? 0) - (width - 2 * bevel) / 2);
    this.asPart(() => this.geometry(geometry, paint, "winding"));
    geometry.dispose();
  }

  /** every face of a three.js geometry in the local frame */
  geometry(
    geometry: THREE.BufferGeometry,
    paint: Paint,
    facing: Facing = "winding"
  ): void {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute("position");
    const point = (i: number): V3 => [
      position.getX(i),
      position.getY(i),
      position.getZ(i),
    ];
    this.asPart(() => {
      for (let i = 0; i + 2 < position.count; i += 3)
        this.triangle(point(i), point(i + 1), point(i + 2), paint, facing);
    });
    if (source !== geometry) source.dispose();
  }

  /**
   * The collected triangles as one mesh, lit by the rig and shadowed by
   * `shadow` (built from `triangles`).
   */
  build(
    name: string,
    shadow: SunShadowMap | null
  ): { mesh: THREE.Mesh; dispose: () => void } {
    const count = this.triangleCount;
    const colors = new Float32Array(count * 9);
    const n = new THREE.Vector3();
    const base = new THREE.Color();
    const out = new THREE.Color();
    const { positions, occlusion, normals, bases, finishes } = this;
    for (let t = 0; t < count; t++) {
      n.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2]);
      base.setRGB(bases[t * 3], bases[t * 3 + 1], bases[t * 3 + 2]);
      const finish = FINISHES[finishes[t]] ?? "matte";
      const lit = n.dot(SUN) > 0;
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k;
        const sun =
          lit && shadow && finish !== "glow"
            ? 1 -
              shadow.shadeAt(
                positions[v * 3] + n.x * NORMAL_OFFSET,
                positions[v * 3 + 1] + n.y * NORMAL_OFFSET,
                positions[v * 3 + 2] + n.z * NORMAL_OFFSET,
                SHADOW_BIAS
              )
            : 1;
        shade(out, base, n, sun, occlusion[v], finish);
        colors[v * 3] = out.r;
        colors[v * 3 + 1] = out.g;
        colors[v * 3 + 2] = out.b;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return {
      mesh,
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };
  }
}
