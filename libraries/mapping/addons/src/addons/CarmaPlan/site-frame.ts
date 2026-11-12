import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";

import type { Tiles3dCutoutPolygon } from "@carma-mapping/engines/maplibre";

import type { GroundSampler, MercatorBox } from "./ground";

/**
 * The metric frame every carma plan scenario is built in: metres round the
 * site's anchor (the middle of its box), x east, z south, y the absolute
 * height in metres (DHHN2016, like the DGM and the mesh). The scenario runtime
 * scales this frame into the shared scene.
 */

export type Point = readonly [number, number];

/** h = a + b x + c z */
export type Plane = { a: number; b: number; c: number };

export type SiteFrame = {
  anchorLngLat: [number, number];
  /** outer rings of the site polygons, open (last point != first) */
  rings: Point[][];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  areaM2: number;
  /** DGM height, or null outside the loaded patch */
  dgm: (x: number, z: number) => number | null;
  inside: (x: number, z: number) => boolean;
  /** distance to the nearest site edge, metres */
  edgeDistance: (x: number, z: number) => number;
  /** least squares plane through the DGM inside the site */
  plane: Plane;
};

/** spacing of the samples the plane is fitted to, metres */
const FIT_STEP = 2;

/** deterministic 0..1 noise for a point, rounded to centimetres */
export const hash = (x: number, z: number, salt = 0): number => {
  const s =
    Math.sin(
      Math.round(x * 100) * 12.9898 +
        Math.round(z * 100) * 78.233 +
        salt * 37.719
    ) * 43758.5453;
  return s - Math.floor(s);
};

/** 0 at `value` 0, 1 from `edge` on, smooth in between */
export const smoothstep = (edge: number, value: number): number =>
  smooth01(value / edge);

export const smooth01 = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

export const insideRing = (
  ring: readonly Point[],
  x: number,
  z: number
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
};

const distanceToRing = (ring: readonly Point[], x: number, z: number) => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const [bx, bz] = ring[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t =
      length2 > 0
        ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2))
        : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
};

/** Sutherland-Hodgman: the part of `ring` inside one axis-aligned cell */
export const clipToCell = (
  ring: readonly Point[],
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number
): Point[] => {
  const edges: ((p: Point) => number)[] = [
    (p) => p[0] - minX,
    (p) => maxX - p[0],
    (p) => p[1] - minZ,
    (p) => maxZ - p[1],
  ];
  let output: Point[] = [...ring];
  for (const side of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const dc = side(current);
      const dp = side(previous);
      if (dc >= 0) {
        if (dp < 0) {
          const t = dp / (dp - dc);
          output.push([
            previous[0] + t * (current[0] - previous[0]),
            previous[1] + t * (current[1] - previous[1]),
          ]);
        }
        output.push(current);
      } else if (dp >= 0) {
        const t = dp / (dp - dc);
        output.push([
          previous[0] + t * (current[0] - previous[0]),
          previous[1] + t * (current[1] - previous[1]),
        ]);
      }
    }
    if (output.length === 0) break;
  }
  return output;
};

export const ringArea = (ring: readonly Point[]): number => {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(area / 2);
};

/** least squares h = a + b x + c z, or the mean when the fit is degenerate */
const fitPlane = (samples: readonly [number, number, number][]): Plane => {
  const n = samples.length;
  const mean = samples.reduce((sum, [, , h]) => sum + h, 0) / Math.max(1, n);
  if (n < 3) return { a: mean, b: 0, c: 0 };
  let sx = 0;
  let sz = 0;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  let sh = 0;
  let sxh = 0;
  let szh = 0;
  for (const [x, z, h] of samples) {
    sx += x;
    sz += z;
    sxx += x * x;
    szz += z * z;
    sxz += x * z;
    sh += h;
    sxh += x * h;
    szh += z * h;
  }
  const m = new THREE.Matrix3().set(n, sx, sz, sx, sxx, sxz, sz, sxz, szz);
  if (Math.abs(m.determinant()) < 1e-9) return { a: mean, b: 0, c: 0 };
  const v = new THREE.Vector3(sh, sxh, szh).applyMatrix3(m.invert());
  return { a: v.x, b: v.y, c: v.z };
};

export const boxOfPolygons = (
  polygons: readonly Tiles3dCutoutPolygon[]
): MercatorBox => {
  const box = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const polygon of polygons)
    for (const [lng, lat] of polygon[0] ?? []) {
      const { x, y } = MercatorCoordinate.fromLngLat([lng, lat], 0);
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
    }
  return box;
};

/**
 * The frame for the outer rings of `polygons`. Holes in a site polygon are
 * ignored; every scenario replaces the whole outer ring.
 */
export const createSiteFrame = (
  polygons: readonly Tiles3dCutoutPolygon[],
  ground: GroundSampler
): SiteFrame => {
  const box = boxOfPolygons(polygons);
  const anchor = new MercatorCoordinate(
    (box.minX + box.maxX) / 2,
    (box.minY + box.maxY) / 2,
    0
  );
  const scale = anchor.meterInMercatorCoordinateUnits();
  const anchorLngLat = anchor.toLngLat();

  const rings: Point[][] = polygons
    .map((polygon) => polygon[0] ?? [])
    .map((ring) =>
      ring.slice(0, -1).map(([lng, lat]) => {
        const { x, y } = MercatorCoordinate.fromLngLat([lng, lat], 0);
        return [(x - anchor.x) / scale, (y - anchor.y) / scale] as const;
      })
    )
    .filter((ring) => ring.length >= 3);

  const dgm = (x: number, z: number) =>
    ground(anchor.x + x * scale, anchor.y + z * scale);
  const inside = (x: number, z: number) =>
    rings.some((ring) => insideRing(ring, x, z));
  const edgeDistance = (x: number, z: number) =>
    Math.min(...rings.map((ring) => distanceToRing(ring, x, z)));

  const xs = rings.flat().map(([x]) => x);
  const zs = rings.flat().map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const samples: [number, number, number][] = [];
  for (let x = minX; x <= maxX; x += FIT_STEP)
    for (let z = minZ; z <= maxZ; z += FIT_STEP) {
      if (!inside(x, z)) continue;
      const h = dgm(x, z);
      if (h !== null) samples.push([x, z, h]);
    }

  return {
    anchorLngLat: [anchorLngLat.lng, anchorLngLat.lat],
    rings,
    minX,
    maxX,
    minZ,
    maxZ,
    areaM2: rings.reduce((sum, ring) => sum + ringArea(ring), 0),
    dgm,
    inside,
    edgeDistance,
    plane: fitPlane(samples),
  };
};

/**
 * Points along the site's outline every `spacing` metres, moved `inset`
 * metres into the site, with the direction of the outline there. For trees
 * along the edge, fences and the like.
 */
export const pointsAlongEdge = (
  frame: SiteFrame,
  spacing: number,
  inset: number
): { x: number; z: number; dx: number; dz: number }[] => {
  const points: { x: number; z: number; dx: number; dz: number }[] = [];
  for (const ring of frame.rings) {
    let carry = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 1e-6) continue;
      const dx = (x2 - x1) / length;
      const dz = (z2 - z1) / length;
      for (let s = carry; s < length; s += spacing) {
        const px = x1 + dx * s;
        const pz = z1 + dz * s;
        if (inset <= 0) {
          points.push({ x: px, z: pz, dx, dz });
          continue;
        }
        for (const side of [1, -1]) {
          const x = px - dz * inset * side;
          const z = pz + dx * inset * side;
          if (frame.inside(x, z)) {
            points.push({ x, z, dx, dz });
            break;
          }
        }
      }
      carry = (((carry - length) % spacing) + spacing) % spacing;
    }
  }
  return points;
};
