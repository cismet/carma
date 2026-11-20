import { GroundPainter } from "./ground-paint";
import { smooth01, type Point, type SiteEntrance } from "./site-frame";

/**
 * The way in from the street: a centreline that starts a few metres outside
 * the site edge, follows the entrance's path, then the waypoints the scenario
 * joins it to, smoothed into a curve. At the mouth the sides flare out to
 * the street, as a driveway's kerbs do.
 */
export type AccessRoad = {
  points: Point[];
  length: number;
  /** arc length where the road crosses the site edge */
  sEdge: number;
  /** half the width at arc length `s`, the flare included */
  halfAt: (s: number) => number;
  /** distance to the centreline and the arc length of the nearest point */
  nearest: (x: number, z: number) => { d: number; s: number };
  /** within `margin` metres of the road's side, or on it */
  near: (x: number, z: number, margin: number) => boolean;
  /** 1 on the road, 0 off it, soft over 0.3 m at the side */
  weight: (x: number, z: number) => number;
  /** point and unit direction (towards the site) at arc length `s` */
  pointAt: (s: number) => { x: number; z: number; dx: number; dz: number };
  /** the centreline between two arc lengths */
  slice: (from: number, to: number) => Point[];
};

/** how far the road starts outside the edge, metres */
const OUTSIDE = 3;
/** extra half width at the mouth, and the length it narrows over */
const FLARE = 2.5;
const FLARE_LENGTH = 5;

/**
 * The road for `entrance`. `join` gets the entrance's path, street end first,
 * and returns the way on from that end: the part of the path the road keeps,
 * then the waypoints to where it meets the scenario's own ways.
 */
export const createAccessRoad = (
  entrance: SiteEntrance,
  defaultWidth: number,
  join: (path: readonly Point[]) => Point[]
): AccessRoad | null => {
  const { path } = entrance;
  if (path.length < 2) return null;
  const [a, b] = path;
  const first = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (first < 1e-6) return null;
  const way: Point[] = [
    [
      a[0] - ((b[0] - a[0]) / first) * OUTSIDE,
      a[1] - ((b[1] - a[1]) / first) * OUTSIDE,
    ],
    ...join(path),
  ];
  if (way.length < 2) return null;
  const points = GroundPainter.smooth(way, 8).filter(
    (p, i, all) =>
      i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-3
  );

  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1]
        )
    );
  const length = cumulative[cumulative.length - 1];
  const half = (entrance.width ?? defaultWidth) / 2;
  const halfAt = (s: number) =>
    half + FLARE * (1 - smooth01((s - OUTSIDE) / FLARE_LENGTH));

  const reach = half + FLARE + 10;
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const minX = Math.min(...xs) - reach;
  const maxX = Math.max(...xs) + reach;
  const minZ = Math.min(...zs) - reach;
  const maxZ = Math.max(...zs) + reach;

  const nearest = (x: number, z: number) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ)
      return { d: Number.POSITIVE_INFINITY, s: 0 };
    let d = Number.POSITIVE_INFINITY;
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1];
      const [bx, bz] = points[i];
      const sx = bx - ax;
      const sz = bz - az;
      const length2 = sx * sx + sz * sz;
      const t =
        length2 > 0
          ? Math.min(1, Math.max(0, ((x - ax) * sx + (z - az) * sz) / length2))
          : 0;
      const di = Math.hypot(x - (ax + t * sx), z - (az + t * sz));
      if (di < d) {
        d = di;
        s = cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]);
      }
    }
    return { d, s };
  };

  const pointAt = (s: number) => {
    const at = Math.min(length, Math.max(0, s));
    let i = 1;
    while (i < points.length - 1 && cumulative[i] < at) i++;
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const segment = cumulative[i] - cumulative[i - 1];
    const t = segment > 0 ? (at - cumulative[i - 1]) / segment : 0;
    const dl = Math.hypot(bx - ax, bz - az) || 1;
    return {
      x: ax + t * (bx - ax),
      z: az + t * (bz - az),
      dx: (bx - ax) / dl,
      dz: (bz - az) / dl,
    };
  };

  return {
    points,
    length,
    sEdge: OUTSIDE,
    halfAt,
    nearest,
    near: (x, z, margin) => {
      const { d, s } = nearest(x, z);
      return d < halfAt(s) + margin;
    },
    weight: (x, z) => {
      const { d, s } = nearest(x, z);
      return 1 - smooth01((d - halfAt(s) + 0.15) / 0.3);
    },
    pointAt,
    slice: (from, to) => {
      const start = pointAt(from);
      const end = pointAt(to);
      return [
        [start.x, start.z],
        ...points.filter((_, i) => cumulative[i] > from && cumulative[i] < to),
        [end.x, end.z],
      ];
    },
  };
};
