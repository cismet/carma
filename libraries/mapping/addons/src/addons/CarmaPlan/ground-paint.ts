import * as THREE from "three";

import type { Point, SiteFrame } from "./site-frame";

/**
 * The ground of a scenario as one painted texture in site metres: the
 * surfaces (soil, gravel, asphalt, lawn, paths, safety surfacing), their
 * large-scale variation (blotches, mowing stripes, tyre tracks), markings,
 * and at the end the shadows. The fine grain comes from the ground shader,
 * so the texture only carries what is bigger than about 10 cm.
 *
 * Coordinates are site metres (x east, z south); the canvas has x to the
 * right and z down.
 */

export type Rgba = readonly [number, number, number, number];

/** metres per pixel the painter aims for */
const RESOLUTION = 0.06;
/** largest texture side, pixels */
const MAX_SIZE = 4096;
const MAX_SIZE_COARSE = 2048;
/** paint this far round the site, so the ground's edge samples real colour */
const MARGIN = 2;

/** a seeded generator, so a site looks the same on every load */
export const seeded = (seed: number) => {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const lattice = (i: number, j: number, seed: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** smooth value noise 0..1 with features about `size` metres, two octaves */
export const noise = (x: number, z: number, size: number, seed = 0): number => {
  const octave = (px: number, pz: number, salt: number) => {
    const i = Math.floor(px);
    const j = Math.floor(pz);
    let fx = px - i;
    let fz = pz - j;
    fx = fx * fx * (3 - 2 * fx);
    fz = fz * fz * (3 - 2 * fz);
    const a = lattice(i, j, salt);
    const b = lattice(i + 1, j, salt);
    const c = lattice(i, j + 1, salt);
    const d = lattice(i + 1, j + 1, salt);
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
  return (
    0.65 * octave(x / size, z / size, seed) +
    0.35 * octave((2.03 * x) / size + 17.3, (2.03 * z) / size - 9.1, seed + 1)
  );
};

/** an sRGB colour scaled by `k`, as Rgba */
export const tone = (
  [r, g, b]: readonly [number, number, number],
  k: number,
  alpha = 1
): Rgba => [
  Math.min(255, r * k),
  Math.min(255, g * k),
  Math.min(255, b * k),
  alpha,
];

/** two sRGB colours mixed, `t` of the second */
export const mix = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const css = ([r, g, b, a]: Rgba) =>
  `rgba(${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}, ${a.toFixed(3)})`;

export type Edge = { color: string; width: number };

export class GroundPainter {
  readonly x0: number;
  readonly z0: number;
  /** extent in metres */
  readonly width: number;
  readonly depth: number;
  /** metres per pixel */
  readonly res: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(frame: SiteFrame) {
    this.x0 = frame.minX - MARGIN;
    this.z0 = frame.minZ - MARGIN;
    this.width = frame.maxX - frame.minX + 2 * MARGIN;
    this.depth = frame.maxZ - frame.minZ + 2 * MARGIN;
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    const maxSize = coarse ? MAX_SIZE_COARSE : MAX_SIZE;
    this.res = Math.max(RESOLUTION, Math.max(this.width, this.depth) / maxSize);
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.ceil(this.width / this.res);
    this.canvas.height = Math.ceil(this.depth / this.res);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("[CARMA PLAN] 2d canvas context unavailable");
    this.ctx = ctx;
    this.reset();
  }

  /** back to site metres, no clip, normal blending */
  private reset(): void {
    const { ctx, res } = this;
    ctx.setTransform(1 / res, 0, 0, 1 / res, -this.x0 / res, -this.z0 / res);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  fill(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.x0, this.z0, this.width, this.depth);
  }

  /**
   * Surfaces from a classification of the ground, sampled every `step`
   * metres and drawn smoothly scaled up, so zone borders come out soft.
   * `colorAt` gets the class of the point and whether a neighbour sample
   * has another class (for kerbs and verges), and returns null to leave
   * what is there.
   */
  zones(
    step: number,
    classify: (x: number, z: number) => number,
    colorAt: (
      cls: number,
      x: number,
      z: number,
      border: number | null
    ) => Rgba | null
  ): void {
    const nx = Math.ceil(this.width / step) + 1;
    const nz = Math.ceil(this.depth / step) + 1;
    const classes = new Int16Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++)
        classes[j * nx + i] = classify(
          this.x0 + i * step,
          this.z0 + j * step
        );
    const image = new ImageData(nx, nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const cls = classes[j * nx + i];
        let border: number | null = null;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const other = classes[jj * nx + ii];
          if (other !== cls) border = other;
        }
        const color = colorAt(
          cls,
          this.x0 + i * step,
          this.z0 + j * step,
          border
        );
        if (!color) continue;
        const k = (j * nx + i) * 4;
        image.data[k] = color[0];
        image.data[k + 1] = color[1];
        image.data[k + 2] = color[2];
        image.data[k + 3] = Math.round(color[3] * 255);
      }
    this.drawImage(image, step, 0.5);
  }

  /** a colour per point, sampled every `step` metres, drawn smoothly
   * scaled up; null leaves what is there */
  field(step: number, colorAt: (x: number, z: number) => Rgba | null): void {
    this.zones(
      step,
      () => 0,
      (_, x, z) => colorAt(x, z)
    );
  }

  /** a small image, one pixel per `step` metres from the corner shifted by
   * `-shift` pixels, drawn smoothly over the site */
  private drawImage(image: ImageData, step: number, shift: number): void {
    const small = document.createElement("canvas");
    small.width = image.width;
    small.height = image.height;
    small.getContext("2d")?.putImageData(image, 0, 0);
    const { ctx } = this;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      small,
      this.x0 - shift * step,
      this.z0 - shift * step,
      image.width * step,
      image.height * step
    );
  }

  /** soft round patches, `perM2` of them per square metre of the extent */
  blotches(options: {
    seed: number;
    perM2: number;
    radius: readonly [number, number];
    colors: readonly Rgba[];
    clip?: Path2D;
    /** squash along x / z, 1 for round */
    stretch?: number;
  }): void {
    const { ctx } = this;
    const random = seeded(options.seed);
    const count = Math.round(this.width * this.depth * options.perM2);
    ctx.save();
    if (options.clip) ctx.clip(options.clip);
    for (let i = 0; i < count; i++) {
      const x = this.x0 + random() * this.width;
      const z = this.z0 + random() * this.depth;
      const r =
        options.radius[0] + random() * (options.radius[1] - options.radius[0]);
      const color = options.colors[Math.floor(random() * options.colors.length)];
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, css(color));
      gradient.addColorStop(1, css([color[0], color[1], color[2], 0]));
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(random() * Math.PI);
      ctx.scale(r * (options.stretch ?? 1), r);
      ctx.fillStyle = gradient;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    ctx.restore();
  }

  /** bands `width` metres wide along `angle` (radians from east towards
   * south), every other one painted */
  stripes(angle: number, width: number, color: string, clip?: Path2D): void {
    const { ctx } = this;
    const reach = Math.hypot(this.width, this.depth);
    ctx.save();
    if (clip) ctx.clip(clip);
    ctx.translate(this.x0 + this.width / 2, this.z0 + this.depth / 2);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    for (let v = -reach; v < reach; v += 2 * width)
      ctx.fillRect(-reach, v, 2 * reach, width);
    ctx.restore();
  }

  path(points: readonly Point[], close = true): Path2D {
    const path = new Path2D();
    points.forEach(([x, z], i) => (i ? path.lineTo(x, z) : path.moveTo(x, z)));
    if (close) path.closePath();
    return path;
  }

  /** an area with an optional darker band along its outline */
  polygon(points: readonly Point[], color: string, edge?: Edge): Path2D {
    const { ctx } = this;
    const path = this.path(points);
    if (edge) {
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = edge.width * 2;
      ctx.stroke(path);
    }
    ctx.fillStyle = color;
    ctx.fill(path);
    return path;
  }

  /**
   * A band `width` wide along `points`, rounded at the bends, with an
   * optional verge on both sides; for paths, tyre tracks and markings.
   */
  line(
    points: readonly Point[],
    width: number,
    color: string,
    edge?: Edge,
    dash?: readonly number[]
  ): void {
    if (points.length < 2) return;
    const { ctx } = this;
    const path = this.path(points, false);
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    if (edge) {
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = width + 2 * edge.width;
      ctx.stroke(path);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(path);
    ctx.restore();
  }

  /** a smooth curve through `points` (Catmull-Rom), as a polyline */
  static smooth(points: readonly Point[], perSegment = 8): Point[] {
    if (points.length < 3) return [...points];
    const out: Point[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let s = 0; s < perSegment; s++) {
        const t = s / perSegment;
        const t2 = t * t;
        const t3 = t2 * t;
        const at = (k: 0 | 1) =>
          0.5 *
          (2 * p1[k] +
            (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([at(0), at(1)]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  /** run `draw` with everything outside `clip` left alone */
  clipped(clip: Path2D, draw: () => void): void {
    this.ctx.save();
    this.ctx.clip(clip);
    try {
      draw();
    } finally {
      this.ctx.restore();
    }
  }

  /**
   * Darken by a mask of `nx` by `nz` values 0..1, one per `step` metres
   * from the painter's corner: the colour is multiplied towards `tint`
   * (sRGB factors) by `strength` times the mask.
   */
  multiply(
    mask: Float32Array,
    nx: number,
    nz: number,
    step: number,
    tint: readonly [number, number, number],
    strength: number
  ): void {
    const image = new ImageData(nx, nz);
    for (let k = 0; k < nx * nz; k++) {
      const s = Math.min(1, mask[k] * strength);
      image.data[k * 4] = 255 * (1 - s + s * tint[0]);
      image.data[k * 4 + 1] = 255 * (1 - s + s * tint[1]);
      image.data[k * 4 + 2] = 255 * (1 - s + s * tint[2]);
      image.data[k * 4 + 3] = 255;
    }
    this.ctx.globalCompositeOperation = "multiply";
    this.drawImage(image, step, 0.5);
    this.reset();
  }

  texture(): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
  }
}

/** a separable box blur of `radius` cells, in place, run `passes` times */
export const blur = (
  values: Float32Array,
  nx: number,
  nz: number,
  radius: number,
  passes = 2
): void => {
  const line = new Float32Array(Math.max(nx, nz));
  const run = (count: number, at: (i: number) => number) => {
    for (let i = 0; i < count; i++) line[i] = values[at(i)];
    let sum = 0;
    let n = 0;
    for (let i = -radius; i <= radius; i++)
      if (i >= 0 && i < count) {
        sum += line[i];
        n += 1;
      }
    for (let i = 0; i < count; i++) {
      values[at(i)] = sum / n;
      const out = i - radius;
      const into = i + radius + 1;
      if (out >= 0) {
        sum -= line[out];
        n -= 1;
      }
      if (into < count) {
        sum += line[into];
        n += 1;
      }
    }
  };
  for (let pass = 0; pass < passes; pass++) {
    for (let j = 0; j < nz; j++) run(nx, (i) => j * nx + i);
    for (let i = 0; i < nx; i++) run(nz, (j) => j * nx + i);
  }
};
