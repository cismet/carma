import {
  FILL,
  OVERVIEW_COLORS,
  type Kind,
  type OverlayModel,
} from "./tile-diagnostic-model";
import type { TileCameraSnapshot } from "../tile-camera-demand";
import type { DiagnosticViewportBasis } from "./tile-diagnostic-model";

export type DiagnosticView = { x: number; y: number; w: number; h: number };
/** x, y, w, h, kind, flags, qMin, qMax, phase, error, bytes, then 4 step ms. */
export const TILE_RECORD_FLOATS = 15;
/** Processing steps a tile record can carry; further ones fold into the last. */
export const TILE_STEP_SLOTS = 4;
export const PRIMITIVE_FLOATS = 16;
export const TILE_KINDS = Object.keys(FILL) as Kind[];
export const TILE_PHASES = ["", "○", "◐", "●", "×", "Ⅱ"] as const;
export const tilePhaseFill = (phase: string): number =>
  phase === "◐" ? 1 / 3 : phase === "●" ? 2 / 3 : 0;

/** Transfer-only diagnostic API. Never send Tile, Map, geometry or material objects. */
export type DiagnosticSnapshot = {
  tileBounds?: Float64Array;
  viewportBasis?: DiagnosticViewportBasis;
  tiles: Float32Array;
  ids: string[];
  extent: DiagnosticView | null;
  edges: Float32Array;
  center: readonly [number, number] | null;
  target: number;
};
export type DiagnosticFrame = {
  followCamera?: boolean;
  /** all, overview-live (main), or a shared-scene camera id. */
  cameraFocus?: string;
  followPaddingPercent?: number;
  showFrustum?: boolean;
  view: DiagnosticView;
  width: number;
  height: number;
  pixelRatio: number;
  opacity: number;
  popout: boolean;
  labels: "none" | "id" | "id and error" | "id and stats";
  selection: ReadonlyArray<readonly [number, number]>;
};
export type DiagnosticWorkerMessage =
  | {
      type: "init";
      foreground: OffscreenCanvas;
      contrast: OffscreenCanvas;
      text: OffscreenCanvas;
    }
  | { type: "dispose" }
  | {
      type: "camera";
      camera: TileCameraSnapshot;
      cameras?: readonly TileCameraSnapshot[];
    }
  | { type: "frame"; frame: DiagnosticFrame; snapshot?: DiagnosticSnapshot };

export const diagnosticProjection = (
  view: DiagnosticView,
  width: number,
  height: number
) => {
  const scale = Math.min(
    width / Math.max(view.w, 1e-6),
    height / Math.max(view.h, 1e-6)
  );
  const offsetX = (width - view.w * scale) / 2 - view.x * scale;
  const offsetY = (height - view.h * scale) / 2 - view.y * scale;
  return {
    scale,
    offsetX,
    offsetY,
    matrix: new Float32Array([
      (2 * scale) / width,
      0,
      0,
      0,
      0,
      (-2 * scale) / height,
      0,
      0,
      0,
      0,
      1,
      0,
      (2 * offsetX) / width - 1,
      1 - (2 * offsetY) / height,
      0,
      1,
    ]),
  };
};

/** Reverse draw order, without allocating a reversed tile array on pointer moves. */
export const hitTestDiagnosticLabel = (
  model: OverlayModel,
  view: DiagnosticView,
  width: number,
  height: number,
  screenX: number,
  screenY: number
) => {
  const { scale, offsetX, offsetY } = diagnosticProjection(view, width, height);
  const x = (screenX - offsetX) / scale,
    y = (screenY - offsetY) / scale;
  for (let i = model.rects.length - 1; i >= 0; i--) {
    const rect = model.rects[i];
    if (
      rect.kind !== "ancestor" &&
      rect.w * scale >= 26 &&
      rect.h * scale >= 12 &&
      Math.abs(x - rect.x - rect.w / 2) < Math.min(rect.w / 2, 50 / scale) &&
      Math.abs(y - rect.y - rect.h / 2) < 7 / scale
    )
      return rect.tile;
  }
  return null;
};

// The palette is intentionally restricted to the diagnostic's hex/rgba constants.
const colors = new Map<string, readonly number[]>();
const rgba = (value: string): readonly number[] => {
  const cached = colors.get(value);
  if (cached) return cached;
  const result = value.startsWith("#")
    ? [1, 3, 5]
        .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
        .concat(1)
    : (value.match(/[\d.]+/g) ?? []).map(
        (v, i) => Number(v) / (i < 3 ? 255 : 1)
      );
  colors.set(value, result);
  return result;
};

export const buildDiagnosticPrimitives = (
  snapshot: DiagnosticSnapshot
): Float32Array => {
  const values: number[] = [];
  const add = (
    position: readonly number[],
    kind: number,
    stroke: number,
    count: number,
    progress: number,
    color: string,
    fill = "rgba(0,0,0,0)"
  ) => {
    if (!position.every(Number.isFinite)) return;
    values.push(
      ...position,
      kind,
      stroke,
      count,
      progress,
      ...rgba(color),
      ...rgba(fill)
    );
  };
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    stroke: number,
    color: string,
    fill?: string
  ) => add([x + w / 2, y + h / 2, w / 2, h / 2], 0, stroke, 0, 0, color, fill);
  if (snapshot.extent) {
    const { x, y, w, h } = snapshot.extent;
    rect(x, y, w, h, 1, OVERVIEW_COLORS.grid);
  }
  const data = snapshot.tiles;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, flags] = data.subarray(i, i + 6);
    const color =
      flags & 4
        ? OVERVIEW_COLORS.baseline
        : flags & 1
        ? OVERVIEW_COLORS.reserve
        : flags & 2
        ? OVERVIEW_COLORS.ring
        : kind < 0
        ? OVERVIEW_COLORS.parent
        : OVERVIEW_COLORS.grid;
    rect(
      x,
      y,
      w,
      h,
      flags & 3 ? 1 : kind < 0 ? 0.5 : 0.6,
      color,
      kind < 0 ? undefined : FILL[TILE_KINDS[kind]]
    );
  }
  // Optimistic progress needs a yardstick: the median cost of the tiles that
  // finished, so a tile still loading can show how far along it probably is.
  const totals: number[] = [];
  let maximumBytes = 0;
  const stepsOf = (offset: number) =>
    Array.from(data.subarray(offset + 11, offset + 11 + TILE_STEP_SLOTS));
  const LOADED_PHASE = TILE_PHASES.indexOf("\u25cf");
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const total = stepsOf(i).reduce((sum, ms) => sum + ms, 0);
    if (total > 0 && data[i + 8] === LOADED_PHASE) totals.push(total);
    maximumBytes = Math.max(maximumBytes, data[i + 10]);
  }
  totals.sort((a, b) => a - b);
  const medianTotal = totals.length ? totals[totals.length >> 1] : 0;
  // One box is a round number of kilobytes, chosen so the largest tile in the
  // cut stays readable as a short diagonal run rather than a filled square.
  const byteUnit =
    maximumBytes > 512 * 1024
      ? 100 * 1024
      : maximumBytes > 64 * 1024
      ? 10 * 1024
      : 1024;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, , , , , , bytes] = data.subarray(
      i,
      i + TILE_RECORD_FLOATS
    );
    if (kind < 0 || !(bytes > 0)) continue;
    const boxes = Math.max(1, Math.min(24, Math.round(bytes / byteUnit)));
    const size = Math.max(2, Math.min(w, h) / 22);
    const inset = size;
    const spanX = Math.max(0, w - 2 * inset - size);
    const spanY = Math.max(0, h - 2 * inset - size);
    const steps = Math.max(1, boxes - 1);
    for (let box = 0; box < boxes; box++)
      rect(
        x + inset + (spanX * box) / steps,
        y + inset + (spanY * box) / steps,
        size,
        size,
        0.8,
        OVERVIEW_COLORS.baseline,
        OVERVIEW_COLORS.baseline
      );
  }
  // One instance evaluates every concentric contour; no per-step geometry or cap.
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, flags, minimum, maximum, phase] = data.subarray(
      i,
      i + 9
    );
    const stepTimes = stepsOf(i);
    const stepTotal = stepTimes.reduce((sum, ms) => sum + ms, 0);
    // A tile that reports its processing steps shows them as a pie instead of
    // the phase fill: one wedge per step, the sweep its progress.
    if (kind >= 0 && stepTotal > 0) {
      const loaded = phase === LOADED_PHASE;
      const sweep = loaded
        ? 1
        : medianTotal > 0
        ? Math.min(0.95, Math.max(0.03, stepTotal / medianTotal))
        : 0.25;
      let cumulative = 0;
      // Exactly three boundaries: a missing step collapses to a full turn.
      const boundaries = [0, 1, 2].map((slot) => {
        cumulative += (stepTimes[slot] ?? 0) / stepTotal;
        return Math.min(1, cumulative);
      });
      values.push(
        x + w / 2,
        y + h / 2,
        Math.min(w, h) / 3,
        Math.min(w, h) / 3,
        6,
        1.2,
        sweep,
        0,
        ...rgba(loaded ? OVERVIEW_COLORS.quality : OVERVIEW_COLORS.processing),
        ...boundaries,
        1
      );
      continue;
    }
    if (kind < 0 || (flags & 4 && !phase)) continue;
    // A terminal tile cannot refine further: a fixed-size centroid dot replaces
    // hypothetical remaining LOD circles.
    if (flags & 16 && minimum > 0) {
      add([x + w / 2, y + h / 2, 3, 3], 4, 0, 0, 0, OVERVIEW_COLORS.quality);
      if (!phase) continue;
    }
    const count = Number.isFinite(minimum)
      ? flags & 16 && minimum > 0
        ? 0
        : Math.max(Math.abs(minimum), Math.abs(maximum))
      : 0;
    if (!count && !phase) continue;
    const radius = Math.min(w, h) / 2;
    add(
      [x + w / 2, y + h / 2, radius, radius],
      minimum < 0 ? 2 : 1,
      count ? 1.2 : 1.5,
      Math.max(count, 1),
      tilePhaseFill(TILE_PHASES[phase]),
      count ? OVERVIEW_COLORS.quality : OVERVIEW_COLORS.processing,
      OVERVIEW_COLORS.processing
    );
  }
  return new Float32Array(values);
};

/** Small dynamic tail; resident tile primitives stay untouched during camera motion. */
/** Widths of a frustum edge at the eye and at the far end, in CSS pixels. */
const FRUSTUM_NEAR_WIDTH = 2.8;
const FRUSTUM_FAR_WIDTH = 0.7;

export const buildDiagnosticViewport = (
  snapshot: Pick<DiagnosticSnapshot, "edges" | "center"> & {
    origin?: readonly [number, number] | null;
  },
  color: string = OVERVIEW_COLORS.frustum
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
  const origin = snapshot.origin ?? null;
  // Distance from the eye taken over every endpoint of this cut, so one edge
  // cannot set the scale for the rest of the outline.
  const distanceTo = (x: number, y: number) =>
    origin ? Math.hypot(x - origin[0], y - origin[1]) : 0;
  let farthest = 0;
  if (origin)
    for (let i = 0; i < snapshot.edges.length; i += 2)
      farthest = Math.max(
        farthest,
        distanceTo(snapshot.edges[i], snapshot.edges[i + 1])
      );
  const widthAt = (x: number, y: number) =>
    farthest > 0
      ? FRUSTUM_NEAR_WIDTH +
        (FRUSTUM_FAR_WIDTH - FRUSTUM_NEAR_WIDTH) *
          Math.min(1, distanceTo(x, y) / farthest)
      : FRUSTUM_NEAR_WIDTH;
  for (let i = 0; i < snapshot.edges.length; i += 4) {
    const segment = Array.from(snapshot.edges.subarray(i, i + 4));
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
  if (snapshot.center) {
    const [x, y] = snapshot.center;
    add([x - 6, y, x + 6, y], 3, 1, 0, 0, color);
    add([x, y - 6, x, y + 6], 3, 1, 0, 0, color);
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

/** Canvas text stays in the worker too; no per-tile DOM or font atlas dependency. */
export const drawDiagnosticText = (
  context: OffscreenCanvasRenderingContext2D,
  snapshot: DiagnosticSnapshot,
  frame: DiagnosticFrame
) => {
  const { width, height, pixelRatio, view } = frame;
  const { scale, offsetX, offsetY } = diagnosticProjection(view, width, height);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.globalAlpha = frame.opacity;
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string = OVERVIEW_COLORS.text
  ) => {
    if (size < 3) return;
    context.font = `${size}px monospace`;
    context.strokeStyle = "rgba(0,0,0,.65)";
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.strokeText(value, x, y);
    context.fillStyle = color;
    context.fillText(value, x, y);
  };
  const data = snapshot.tiles;
  const totalOf = (offset: number) =>
    Array.from(
      data.subarray(offset + 11, offset + 11 + TILE_STEP_SLOTS)
    ).reduce((sum, ms) => sum + ms, 0);
  // The percentile is the tile's rank among the costs in this cut, so "p90"
  // means only a tenth of the drawn tiles were more expensive.
  const ranked =
    frame.labels === "id and stats"
      ? Array.from(
          { length: Math.floor(data.length / TILE_RECORD_FLOATS) },
          (_, index) => totalOf(index * TILE_RECORD_FLOATS)
        )
          .filter((total) => total > 0)
          .sort((a, b) => a - b)
      : [];
  const compactBytes = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)}M`
      : `${Math.round(bytes / 1024)}k`;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, flags, minimum, maximum, phase, error, bytes] =
      data.subarray(i, i + 11);
    if (kind < 0) continue;
    const cx = (x + w / 2) * scale + offsetX,
      cy = (y + h / 2) * scale + offsetY;
    if (
      cx < -w * scale ||
      cy < -h * scale ||
      cx > width + w * scale ||
      cy > height + h * scale
    )
      continue;
    const diameter = Math.min(w, h) * scale,
      radius = Math.max(0, diameter / 2 - Math.max(0.5, diameter * 0.08));
    if (diameter >= 4 && (!(flags & 4) || phase)) {
      if (phase >= 4)
        text(
          TILE_PHASES[phase],
          cx,
          cy,
          radius * 0.9,
          phase === 4 ? OVERVIEW_COLORS.failed : OVERVIEW_COLORS.processing
        );
      if (flags & 8 && (minimum || maximum))
        text("≈", cx, cy + radius * 0.78, radius * 0.22);
    }
    if (frame.labels === "none" || w * scale < 26 || h * scale < 12) continue;
    const id = snapshot.ids[i / TILE_RECORD_FLOATS];
    const label =
      flags & 4
        ? `${id} · outside views`
        : frame.labels === "id and stats"
        ? [
            id,
            bytes > 0 ? compactBytes(bytes) : null,
            totalOf(i) > 0 ? `${Math.round(totalOf(i))}ms` : null,
            ranked.length > 1 && totalOf(i) > 0
              ? `p${Math.round(
                  (100 * ranked.filter((total) => total <= totalOf(i)).length) /
                    ranked.length
                )}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : frame.labels === "id and error"
        ? `${id} ${Number.isFinite(error) ? error.toFixed(1) : "–"}px ${
            Number.isFinite(minimum)
              ? `${flags & 8 ? "~" : ""}${minimum}…${maximum}`
              : ""
          }`
        : id;
    text(label, cx, cy, 10 * scale);
  }
};
