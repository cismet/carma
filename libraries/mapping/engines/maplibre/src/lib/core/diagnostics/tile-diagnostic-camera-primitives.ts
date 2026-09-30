import { OVERVIEW_COLORS } from "./tile-diagnostic-model";
import {
  TILE_RECORD_FLOATS,
  PRIMITIVE_FLOATS,
  type DiagnosticSnapshot,
  type DiagnosticFrame,
  rgba,
} from "./tile-diagnostic-scene";

/** Small dynamic tail; resident tile primitives stay untouched during camera motion. */
/** Widths of a frustum edge at the eye and at the far end, in CSS pixels. */
const FRUSTUM_NEAR_WIDTH = 2.4;

const FRUSTUM_FAR_WIDTH = 1.6;

export const buildDiagnosticViewport = (
  snapshot: Pick<DiagnosticSnapshot, "edges" | "center"> & {
    origin?: readonly [number, number] | null;
    forward?: readonly [number, number] | null;
    nearCenter?: readonly [number, number];
  },
  color: string = OVERVIEW_COLORS.frustum,
  /** Orthographic light volume with a fixed-size direction marker. */
  light = false
): Float32Array => {
  const values: number[] = [];
  const add = (
    position: number[],
    kind: number,
    stroke: number,
    count: number,
    progress: number,
    color: string
  ) =>
    values.push(
      ...position,
      kind,
      stroke,
      count,
      progress,
      ...rgba(color),
      0,
      0,
      0,
      0
    );
  const origin = light ? null : snapshot.origin ?? null;
  const edges = snapshot.edges;
  // Distance from the eye taken over every endpoint of this cut, so one edge
  // cannot set the scale for the rest of the outline.
  const distanceTo = (x: number, y: number) =>
    origin ? Math.hypot(x - origin[0], y - origin[1]) : 0;
  let farthest = 0;
  if (origin)
    for (let i = 0; i < edges.length; i += 2)
      farthest = Math.max(farthest, distanceTo(edges[i], edges[i + 1]));
  const widthAt = (x: number, y: number) =>
    farthest > 0
      ? FRUSTUM_NEAR_WIDTH +
        (FRUSTUM_FAR_WIDTH - FRUSTUM_NEAR_WIDTH) *
          Math.min(1, distanceTo(x, y) / farthest)
      : FRUSTUM_NEAR_WIDTH;
  for (let i = 0; i < edges.length; i += 4) {
    const segment = Array.from(edges.subarray(i, i + 4));
    if (!origin) {
      add(segment, 3, 2, 0, 0, color);
      continue;
    }
    // A tapered quad: the renderer interpolates the width along the segment,
    // which a constant-width line primitive cannot express.
    values.push(
      ...segment,
      5,
      2,
      widthAt(segment[0], segment[1]),
      widthAt(segment[2], segment[3]),
      ...rgba(color),
      0,
      0,
      0,
      0
    );
  }
  // No centre cross or footprint-spanning arrow. The triangle has a fixed CSS
  // size and follows the actual light camera's projected ray direction.
  if (light && snapshot.nearCenter && snapshot.forward) {
    const [x, y] = snapshot.nearCenter;
    const [dx, dy] = snapshot.forward;
    const length = Math.hypot(dx, dy);
    if (Number.isFinite(x + y + length) && length > 1e-9)
      add([x, y, 8, 8], 7, 0, dx / length, dy / length, color);
  }
  return new Float32Array(values);
};

export const buildDiagnosticSelection = (
  snapshot: DiagnosticSnapshot,
  selection: DiagnosticFrame["selection"]
) => {
  const values: number[] = [];
  for (const [index, primary] of selection) {
    const offset = index * TILE_RECORD_FLOATS;
    if (offset < 0 || offset + TILE_RECORD_FLOATS > snapshot.tiles.length)
      continue;
    const [x, y, w, h] = snapshot.tiles.subarray(offset, offset + 4);
    values.push(
      x + w / 2,
      y + h / 2,
      w / 2,
      h / 2,
      0,
      1,
      0,
      0,
      ...rgba(primary ? "#fff05a" : "#ff974f"),
      0,
      0,
      0,
      0
    );
  }
  return new Float32Array(values);
};

/** Local cut coordinates retain endpoint depths without subtracting large screen offsets. */
export const buildDiagnosticViewportGeometry = (
  snapshot: Parameters<typeof buildDiagnosticViewport>[0] & {
    edgeDepths?: Float32Array;
    nearDepth?: number;
  },
  color: string = OVERVIEW_COLORS.frustum,
  light = false
) => {
  const source = buildDiagnosticViewport(snapshot, color, light);
  const primitives: number[] = [],
    planes: number[] = [];
  for (let i = 0; i < source.length / PRIMITIVE_FLOATS; i++) {
    const primitive = Array.from(
      source.subarray(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS)
    );
    const [x, y, endX, endY, kind] = primitive;
    if (kind === 3 || kind === 5) {
      const dx = endX - x,
        dy = endY - y,
        length = Math.hypot(dx, dy);
      // The stored Float32 endpoints can collapse even when their double
      // precision projections differ. They have no visible centreline.
      if (!(length > 0) || !Number.isFinite(length)) continue;
      const startDepth = snapshot.edgeDepths?.[i * 2] ?? 0;
      const endDepth = snapshot.edgeDepths?.[i * 2 + 1] ?? startDepth;
      if (!Number.isFinite(startDepth + endDepth)) continue;
      primitive.splice(0, 4, 0, 0, length, 0);
      if (kind === 3) primitive[6] = 1;
      planes.push(
        x,
        y,
        startDepth,
        1,
        dx / length,
        dy / length,
        (endDepth - startDepth) / length,
        0,
        -dy / length,
        dx / length,
        0,
        0
      );
    } else {
      primitive[0] = primitive[1] = 0;
      const depth = snapshot.nearDepth ?? 0;
      planes.push(
        x,
        y,
        Number.isFinite(depth) ? depth : 0,
        1,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0
      );
    }
    primitives.push(...primitive);
  }
  return {
    primitives: new Float32Array(primitives),
    planes: new Float32Array(planes),
  };
};
