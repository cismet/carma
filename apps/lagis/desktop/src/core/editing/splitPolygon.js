// Planar polygon split for metric coordinates (EPSG:25832). Pieces share the
// exact cut points, so they meet without gaps or overlaps.

// 1 mm: snapped line ends sit on the edge only up to reprojection noise
const TOL = 0.001;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const clamp01 = (t) => Math.min(1, Math.max(0, t));

const openRing = (ring) =>
  dist(ring[0], ring[ring.length - 1]) < TOL ? ring.slice(0, -1) : ring;
const closeRing = (ring) => [...ring, ring[0]];

const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    sum += cross(ring[i], ring[(i + 1) % ring.length]);
  }
  return Math.abs(sum) / 2;
};

const insideRing = (point, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const segmentHit = (p, q, a, b) => {
  const r = sub(q, p);
  const s = sub(b, a);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const ap = sub(a, p);
  const t = cross(ap, s) / denom;
  const u = cross(ap, r) / denom;
  const tolT = TOL / Math.hypot(...r);
  const tolU = TOL / Math.hypot(...s);
  if (t < -tolT || t > 1 + tolT || u < -tolU || u > 1 + tolU) {
    return null;
  }
  return { t: clamp01(t), u: clamp01(u), point: lerp(a, b, clamp01(u)) };
};

// where a boundary point lies on the ring, as edge index + fraction
const locate = (ring, point) => {
  let best = null;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const ab = sub(b, a);
    const len2 = ab[0] ** 2 + ab[1] ** 2;
    const u =
      len2 === 0
        ? 0
        : clamp01(
            ((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / len2
          );
    const d = dist(point, lerp(a, b, u));
    if (d < TOL && (!best || d < best.d)) {
      best = { d, pos: u === 1 ? (i + 1) % ring.length : i + u };
    }
  });
  return best?.pos;
};

// ring vertices strictly after `from` up to (not including) `to`, walking forward
const walk = (ring, from, to) => {
  const n = ring.length;
  const offset = (x) => (((x - from) % n) + n) % n;
  const target = offset(to) || n;
  const result = [];
  for (let j = 1; j <= n; j++) {
    const k = (Math.floor(from) + j) % n;
    const off = offset(k);
    if (off >= target - 1e-12) {
      break;
    }
    if (off > 1e-12) {
      result.push(ring[k]);
    }
  }
  return result;
};

const withoutRepeats = (ring) =>
  ring.filter((p, i) => dist(p, ring[(i + 1) % ring.length]) >= TOL);

const splitRing = (ring, chord) => {
  const start = chord[0];
  const end = chord[chord.length - 1];
  const from = locate(ring, start);
  const to = locate(ring, end);
  if (from === undefined || to === undefined) {
    return null;
  }
  const inner = chord.slice(1, -1);
  const a = withoutRepeats([
    start,
    ...walk(ring, from, to),
    end,
    ...[...inner].reverse(),
  ]);
  const b = withoutRepeats([end, ...walk(ring, to, from), start, ...inner]);
  if (
    a.length < 3 ||
    b.length < 3 ||
    ringArea(a) < 1e-6 ||
    ringArea(b) < 1e-6
  ) {
    return null;
  }
  return [a, b];
};

const crossings = (ring, line) => {
  const hits = [];
  for (let k = 0; k < line.length - 1; k++) {
    ring.forEach((a, i) => {
      const hit = segmentHit(
        line[k],
        line[k + 1],
        a,
        ring[(i + 1) % ring.length]
      );
      if (hit) {
        hits.push({ pos: k + hit.t, point: hit.point });
      }
    });
  }
  hits.sort((x, y) => x.pos - y.pos);
  // a hit on a vertex is found on both of its edges
  return hits.filter(
    (h, i) => i === 0 || dist(h.point, hits[i - 1].point) >= TOL
  );
};

const chordPath = (line, from, to) => {
  const inner = [];
  for (let k = Math.floor(from.pos) + 1; k <= Math.ceil(to.pos) - 1; k++) {
    if (k > from.pos && k < to.pos) {
      inner.push(line[k]);
    }
  }
  return [from.point, ...inner, to.point];
};

const crossesHole = (holes, path) =>
  holes.some((hole) =>
    path.some(
      (p, k) =>
        k < path.length - 1 &&
        hole.some((a, i) =>
          segmentHit(p, path[k + 1], a, hole[(i + 1) % hole.length])
        )
    )
  );

/**
 * Splits a Polygon (coordinates in metres) along a polyline.
 * Returns an array of Polygon coordinate arrays (2 or more), or null when
 * the line does not fully cross the polygon or cuts through a hole.
 */
export const splitPolygon = (polygonCoordinates, lineCoordinates) => {
  const outer = openRing(polygonCoordinates[0]);
  const holes = polygonCoordinates.slice(1).map(openRing);
  const hits = crossings(outer, lineCoordinates);

  const chords = [];
  for (let i = 0; i < hits.length - 1; i++) {
    const path = chordPath(lineCoordinates, hits[i], hits[i + 1]);
    const middle = lerp(path[0], path[1], 0.5);
    if (
      insideRing(middle, outer) &&
      !holes.some((hole) => insideRing(middle, hole))
    ) {
      chords.push(path);
    }
  }
  if (chords.length === 0 || chords.some((path) => crossesHole(holes, path))) {
    return null;
  }

  let pieces = [outer];
  for (const chord of chords) {
    const middle = lerp(chord[0], chord[1], 0.5);
    const index = pieces.findIndex((ring) => insideRing(middle, ring));
    const split = index === -1 ? null : splitRing(pieces[index], chord);
    if (!split) {
      return null;
    }
    pieces = [...pieces.slice(0, index), ...split, ...pieces.slice(index + 1)];
  }

  return pieces.map((ring) => [
    closeRing(ring),
    ...holes.filter((hole) => insideRing(hole[0], ring)).map(closeRing),
  ]);
};
