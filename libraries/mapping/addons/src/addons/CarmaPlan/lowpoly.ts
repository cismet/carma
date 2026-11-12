import * as THREE from "three";

import {
  clipToCell,
  hash,
  ringArea,
  type Point,
  type SiteFrame,
} from "./site-frame";

/**
 * Collects flat-shaded triangles into one vertex-coloured mesh, the look of
 * every carma plan scenario: few faces, a few colours per material and the
 * light baked in, so the scenario looks the same whatever lights the shared
 * scene has. One mesh per scenario keeps it at one draw call.
 *
 * Primitives are given in the current local frame; `placed` moves that frame
 * to a spot in the site frame and turns it. Models are built with x forward,
 * y up and z to the right, standing on y = 0.
 */

export type V3 = readonly [number, number, number];
/** one colour, or several to pick from per face for a low-poly mottle */
export type Paint = string | readonly string[];

/** baked light: sun from the south-west, 40 degrees up */
const SUN = new THREE.Vector3(
  -Math.SQRT1_2 * Math.cos((40 * Math.PI) / 180),
  Math.sin((40 * Math.PI) / 180),
  Math.SQRT1_2 * Math.cos((40 * Math.PI) / 180)
).normalize();
const AMBIENT = 0.58;
const DIFFUSE = 0.42;

const UP = new THREE.Vector3(0, 1, 0);

export class LowPolyBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly r = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly e = new THREE.Vector3();

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /** draw with the local frame moved to (x, y, z), turned by `yaw` about y
   * and tilted by `pitch` about its own z (nose up for positive pitch) */
  placed(
    [x, y, z]: V3,
    yaw: number,
    draw: () => void,
    pitch = 0
  ): void {
    this.transformed(
      new THREE.Matrix4()
        .makeTranslation(x, y, z)
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeRotationZ(pitch)),
      draw
    );
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

  /**
   * One triangle in local coordinates. Its light faces away from `center`
   * (local too) when given, else upwards: for closed convex shapes and for
   * the ground respectively.
   */
  triangle(a: V3, b: V3, c: V3, paint: Paint, center?: V3): void {
    const { p, q, r } = this;
    p.set(a[0], a[1], a[2]).applyMatrix4(this.matrix);
    q.set(b[0], b[1], b[2]).applyMatrix4(this.matrix);
    r.set(c[0], c[1], c[2]).applyMatrix4(this.matrix);
    this.pushWorld(
      p,
      q,
      r,
      paint,
      center
        ? this.c.set(center[0], center[1], center[2]).applyMatrix4(this.matrix)
        : null
    );
  }

  /** triangle already in the site frame */
  private pushWorld(
    p: THREE.Vector3,
    q: THREE.Vector3,
    r: THREE.Vector3,
    paint: Paint,
    center: THREE.Vector3 | null
  ): void {
    const { n, e } = this;
    n.subVectors(q, p).cross(e.subVectors(r, p));
    if (n.lengthSq() < 1e-10) return;
    n.normalize();
    if (center) {
      e.set(
        (p.x + q.x + r.x) / 3 - center.x,
        (p.y + q.y + r.y) / 3 - center.y,
        (p.z + q.z + r.z) / 3 - center.z
      );
      if (n.dot(e) < 0) n.negate();
    } else if (n.dot(UP) < 0) n.negate();
    const light = AMBIENT + DIFFUSE * Math.max(0, n.dot(SUN));
    const base =
      typeof paint === "string"
        ? paint
        : paint[
            Math.floor(
              hash((p.x + q.x + r.x) / 3, (p.z + q.z + r.z) / 3, p.y) *
                paint.length
            )
          ];
    this.color.set(base).multiplyScalar(light);
    for (const v of [p, q, r]) {
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
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
    this.transformed(basis, () => this.unitBox(size, paint));
  }

  /**
   * A bar from `from` to `to`, `width` across (horizontal) and `thickness`
   * high; for posts, beams, ropes, slides, a boom.
   */
  beam(from: V3, to: V3, width: number, paint: Paint, thickness = width): void {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const length = a.distanceTo(b);
    if (length < 1e-6) return;
    const x = b.clone().sub(a).normalize();
    let z = new THREE.Vector3().crossVectors(x, UP);
    if (z.lengthSq() < 1e-6) z = new THREE.Vector3(0, 0, 1);
    z.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const basis = new THREE.Matrix4()
      .makeBasis(x, y, z)
      .setPosition(a.add(b).multiplyScalar(0.5));
    this.transformed(basis, () =>
      this.unitBox([length, thickness, width], paint)
    );
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

  /** a cylinder round `center` along a local axis, with flat caps */
  cylinder(
    center: V3,
    radius: number,
    length: number,
    segments: number,
    paint: Paint,
    axis: "x" | "y" | "z" = "y"
  ): void {
    const rotation =
      axis === "y"
        ? new THREE.Matrix4()
        : axis === "x"
        ? new THREE.Matrix4().makeRotationZ(-Math.PI / 2)
        : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    this.transformed(
      new THREE.Matrix4()
        .makeTranslation(center[0], center[1], center[2])
        .multiply(rotation),
      () => {
        const h = length / 2;
        const ring = (y: number) =>
          Array.from({ length: segments }, (_, i): V3 => {
            const angle = (i / segments) * Math.PI * 2;
            return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
          });
        const bottom = ring(-h);
        const top = ring(h);
        for (let i = 0; i < segments; i++) {
          const j = (i + 1) % segments;
          this.triangle(bottom[i], bottom[j], top[j], paint, [0, 0, 0]);
          this.triangle(bottom[i], top[j], top[i], paint, [0, 0, 0]);
          this.triangle([0, h, 0], top[i], top[j], paint, [0, 0, 0]);
          this.triangle([0, -h, 0], bottom[j], bottom[i], paint, [0, 0, 0]);
        }
      }
    );
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
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      this.triangle(ring[i], ring[j], apex, paint, center);
      this.triangle(base, ring[j], ring[i], paint, center);
    }
  }

  /** every face of a three.js geometry, scaled and moved; for tree crowns */
  solid(
    geometry: THREE.BufferGeometry,
    center: V3,
    scale: V3,
    paint: Paint
  ): void {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute("position");
    const point = (i: number): V3 => [
      center[0] + position.getX(i) * scale[0],
      center[1] + position.getY(i) * scale[1],
      center[2] + position.getZ(i) * scale[2],
    ];
    for (let i = 0; i + 2 < position.count; i += 3)
      this.triangle(point(i), point(i + 1), point(i + 2), paint, center);
    if (source !== geometry) source.dispose();
  }

  /** a flat area on the ground, following `heightAt`, lifted by `lift` */
  patch(
    outline: readonly Point[],
    heightAt: (x: number, z: number) => number,
    lift: number,
    paint: Paint
  ): void {
    if (outline.length < 3 || ringArea(outline) < 1e-4) return;
    const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
    const at = (v: THREE.Vector2): V3 => [v.x, heightAt(v.x, v.y) + lift, v.y];
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, []))
      this.triangle(at(contour[i]), at(contour[j]), at(contour[k]), paint);
  }

  /** a band `width` wide along a centre line on the ground: paths, markings */
  strip(
    line: readonly Point[],
    width: number,
    heightAt: (x: number, z: number) => number,
    lift: number,
    paint: Paint
  ): void {
    const h = width / 2;
    for (let i = 0; i + 1 < line.length; i++) {
      const [x1, z1] = line[i];
      const [x2, z2] = line[i + 1];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 1e-6) continue;
      const nx = (-(z2 - z1) / length) * h;
      const nz = ((x2 - x1) / length) * h;
      this.patch(
        [
          [x1 + nx, z1 + nz],
          [x2 + nx, z2 + nz],
          [x2 - nx, z2 - nz],
          [x1 - nx, z1 - nz],
        ],
        heightAt,
        lift,
        paint
      );
    }
  }

  /**
   * The ground of the whole site on a grid of `cell` metres, clipped to the
   * site, plus a wall down from its edge that hides gaps to a lower mesh.
   * `paintAt` picks the colour per face from its middle and how level it is
   * (1 flat, 0 vertical).
   */
  ground(
    frame: SiteFrame,
    cell: number,
    heightAt: (x: number, z: number) => number,
    paintAt: (x: number, z: number, level: number) => Paint,
    skirt: { depth: number; paint: Paint }
  ): void {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const e = new THREE.Vector3();
    const heights = new Map<string, number>();
    const height = (x: number, z: number) => {
      const key = `${Math.round(x * 100)}:${Math.round(z * 100)}`;
      let h = heights.get(key);
      if (h === undefined) {
        h = heightAt(x, z);
        heights.set(key, h);
      }
      return h;
    };
    for (let x0 = frame.minX; x0 < frame.maxX; x0 += cell)
      for (let z0 = frame.minZ; z0 < frame.maxZ; z0 += cell)
        for (const ring of frame.rings) {
          const piece = clipToCell(ring, x0, z0, x0 + cell, z0 + cell);
          if (piece.length < 3 || ringArea(piece) < 1e-4) continue;
          const contour = piece.map(([x, z]) => new THREE.Vector2(x, z));
          for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(
            contour,
            []
          )) {
            const [pi, pj, pk] = [contour[i], contour[j], contour[k]];
            a.set(pi.x, height(pi.x, pi.y), pi.y);
            b.set(pj.x, height(pj.x, pj.y), pj.y);
            c.set(pk.x, height(pk.x, pk.y), pk.y);
            n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
            const paint = paintAt(
              (pi.x + pj.x + pk.x) / 3,
              (pi.y + pj.y + pk.y) / 3,
              Math.abs(n.y)
            );
            this.pushWorld(a.clone(), b.clone(), c.clone(), paint, null);
          }
        }

    for (const ring of frame.rings)
      for (let i = 0; i < ring.length; i++) {
        const [x1, z1] = ring[i];
        const [x2, z2] = ring[(i + 1) % ring.length];
        const steps = Math.max(
          1,
          Math.ceil(Math.hypot(x2 - x1, z2 - z1) / cell)
        );
        for (let s = 0; s < steps; s++) {
          const px = x1 + ((x2 - x1) * s) / steps;
          const pz = z1 + ((z2 - z1) * s) / steps;
          const qx = x1 + ((x2 - x1) * (s + 1)) / steps;
          const qz = z1 + ((z2 - z1) * (s + 1)) / steps;
          const hp = height(px, pz);
          const hq = height(qx, qz);
          const top1: V3 = [px, hp, pz];
          const top2: V3 = [qx, hq, qz];
          const low2: V3 = [qx, hq - skirt.depth, qz];
          const low1: V3 = [px, hp - skirt.depth, pz];
          this.triangle(top1, top2, low2, skirt.paint);
          this.triangle(top1, low2, low1, skirt.paint);
        }
      }
  }

  /** the collected triangles as one mesh */
  build(name: string): { mesh: THREE.Mesh; dispose: () => void } {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3)
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    return {
      mesh,
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };
  }
}
