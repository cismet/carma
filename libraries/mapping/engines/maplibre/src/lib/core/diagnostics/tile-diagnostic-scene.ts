import {
  FILL,
  OVERVIEW_COLORS,
  TILE_STEPS,
  type Kind,
  type OverlayModel,
} from "./tile-diagnostic-model";
import type { TileCameraSnapshot } from "../tile-camera-demand";
import type { DiagnosticViewportBasis } from "./tile-diagnostic-model";

export type DiagnosticView = { x: number; y: number; w: number; h: number };
/** x, y, w, h, kind, flags, qMin, qMax, phase, error, bytes, steps…, level. */
export const TILE_RECORD_FLOATS = 12 + TILE_STEPS.length;
/** One slot per step of TILE_STEPS, so a slot's colour is the step's colour. */
export const TILE_STEP_SLOTS = TILE_STEPS.length;
/** Where the step milliseconds start in a record, and where its level sits. */
export const TILE_STEP_OFFSET = 11;
export const TILE_LEVEL_OFFSET = 12 + TILE_STEPS.length - 1;
/** Payload size reads as filled cells of a square grid, one unit per cell. */
export const SIZE_GRID = 10;
/** Each generation above the published cut keeps a third less opacity. */
export const ANCESTOR_OPACITY_STEP = 2 / 3;
/** The size grid is a background mark, not a reading of its own. */
export const SIZE_GRID_OPACITY = 0.2;
export const PRIMITIVE_FLOATS = 16;
export const TILE_KINDS = Object.keys(FILL) as Kind[];
export const TILE_PHASES = ["", "○", "◐", "●", "×", "Ⅱ"] as const;
/** How much of a tile's pie a phase alone fills, with no timings to divide. */
export const PHASE_SWEEP: Readonly<Record<string, number>> = {
  "\u25cb": 0.25,
  "\u25d0": 0.6,
  "\u25cf": 1,
};

/** Transfer-only diagnostic API. Never send Tile, Map, geometry or material objects. */
export type DiagnosticSnapshot = {
  /** What the overview draws beside the tiles themselves. */
  showSize?: boolean;
  showStats?: boolean;
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
  const faded = (color: readonly number[], alpha: number) => [
    color[0],
    color[1],
    color[2],
    color[3] * alpha,
  ];
  const add = (
    position: readonly number[],
    kind: number,
    stroke: number,
    count: number,
    progress: number,
    color: string,
    fill = "rgba(0,0,0,0)",
    alpha = 1
  ) => {
    if (!position.every(Number.isFinite)) return;
    values.push(
      ...position,
      kind,
      stroke,
      count,
      progress,
      ...faded(rgba(color), alpha),
      ...faded(rgba(fill), alpha)
    );
  };
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    stroke: number,
    color: string,
    fill?: string,
    alpha = 1
  ) =>
    add(
      [x + w / 2, y + h / 2, w / 2, h / 2],
      0,
      stroke,
      0,
      0,
      color,
      fill,
      alpha
    );
  if (snapshot.extent) {
    const { x, y, w, h } = snapshot.extent;
    rect(x, y, w, h, 1, OVERVIEW_COLORS.grid);
  }
  const data = snapshot.tiles;
  // Optimistic progress needs a yardstick: the median cost of the tiles that
  // finished, so a tile still loading can show how far along it probably is.
  const totals: number[] = [];
  let maximumBytes = 0;
  const stepsOf = (offset: number) =>
    Array.from(
      data.subarray(
        offset + TILE_STEP_OFFSET,
        offset + TILE_STEP_OFFSET + TILE_STEP_SLOTS
      )
    );
  const LOADED_PHASE = TILE_PHASES.indexOf("\u25cf");
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const total = stepsOf(i).reduce((sum, ms) => sum + ms, 0);
    if (total > 0 && data[i + 8] === LOADED_PHASE) totals.push(total);
    maximumBytes = Math.max(maximumBytes, data[i + 10]);
  }
  totals.sort((a, b) => a - b);
  const medianTotal = totals.length ? totals[totals.length >> 1] : 0;
  // The finest generation carries full opacity; every one above it a third
  // less, so a retained parent stays readable without competing with its
  // children.
  let finestLevel = 0;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS)
    finestLevel = Math.max(finestLevel, data[i + TILE_LEVEL_OFFSET]);
  const opacityOf = (level: number) =>
    level > 0 && finestLevel > level
      ? Math.max(0.15, ANCESTOR_OPACITY_STEP ** (finestLevel - level))
      : 1;
  // An outlier is a tile whose cost stands out from the cut. The yardstick is
  // the median and the median absolute deviation rather than mean and sigma:
  // a handful of very slow tiles would inflate both and hide themselves.
  const deviations = totals
    .map((ms) => Math.abs(ms - medianTotal))
    .sort((a, b) => a - b);
  const medianDeviation = deviations.length
    ? deviations[deviations.length >> 1]
    : 0;
  const outlierThreshold =
    totals.length > 2
      ? Math.max(medianTotal * 3, medianTotal + 3 * 1.4826 * medianDeviation)
      : Infinity;
  const isOutlier = (offset: number) =>
    stepsOf(offset).reduce((sum, ms) => sum + ms, 0) > outlierThreshold;
  // Every tile reads against the same yardstick: one cell of a ten by ten
  // grid is a round number of kilobytes, stepped by ten until the largest
  // tile of the cut fits into the hundred cells.
  let byteUnit = 1024;
  while (maximumBytes / byteUnit > SIZE_GRID * SIZE_GRID) byteUnit *= 10;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, flags] = data.subarray(i, i + 6);
    const outlier = isOutlier(i);
    const color = outlier
      ? OVERVIEW_COLORS.failed
      : flags & 4
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
      outlier ? 1.6 : flags & 3 ? 1 : kind < 0 ? 0.5 : 0.6,
      color,
      kind < 0 ? undefined : FILL[TILE_KINDS[kind]],
      outlier ? 1 : opacityOf(data[i + TILE_LEVEL_OFFSET])
    );
  }
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    const [x, y, w, h, kind, , , , , , bytes] = data.subarray(
      i,
      i + TILE_RECORD_FLOATS
    );
    if (kind < 0 || !(bytes > 0) || snapshot.showSize === false) continue;
    const cells = Math.max(
      1,
      Math.min(SIZE_GRID * SIZE_GRID, Math.ceil(bytes / byteUnit))
    );
    const pitch = Math.min(w, h) / (SIZE_GRID + 2);
    const gap = pitch * 0.12;
    const size = pitch - gap;
    const inset = pitch;
    const gridAlpha =
      SIZE_GRID_OPACITY *
      (isOutlier(i) ? 1 : opacityOf(data[i + TILE_LEVEL_OFFSET]));
    for (let cell = 0; cell < cells; cell++)
      rect(
        x + inset + (cell % SIZE_GRID) * pitch,
        y + inset + Math.floor(cell / SIZE_GRID) * pitch,
        size,
        size,
        0.6,
        OVERVIEW_COLORS.baseline,
        OVERVIEW_COLORS.baseline,
        gridAlpha
      );
  }
  // One instance evaluates every concentric contour; no per-step geometry or cap.
  // Every circular mark answers to one switch: off means no pie, no ring and
  // no contour.
  for (
    let i = 0;
    snapshot.showStats !== false && i < data.length;
    i += TILE_RECORD_FLOATS
  ) {
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
      const pieAlpha = isOutlier(i)
        ? 1
        : opacityOf(data[i + TILE_LEVEL_OFFSET]);
      // The ring is the median cost of this cut; the pie's area is the tile's
      // own cost against it, so a disc that fills its ring took the usual time
      // and a larger one took longer.
      const reference = Math.min(w, h) / 3;
      const radius =
        reference *
        Math.sqrt(
          medianTotal > 0
            ? Math.min(4, Math.max(0.1, stepTotal / medianTotal))
            : 1
        );
      // One wedge per step, in the step's own colour: steps of a kind share a
      // hue, so the pie reads as fetch, raster work, geometry and waiting.
      let start = 0;
      stepTimes.forEach((ms, slot) => {
        if (!(ms > 0)) return;
        const end = start + (ms / stepTotal) * sweep;
        values.push(
          x + w / 2,
          y + h / 2,
          radius,
          radius,
          6,
          1,
          start,
          end,
          ...faded(rgba(TILE_STEPS[slot].color), pieAlpha * 0.85),
          0,
          0,
          0,
          0
        );
        start = end;
      });
      add(
        [x + w / 2, y + h / 2, reference, reference],
        1,
        1.2,
        1,
        0,
        isOutlier(i)
          ? OVERVIEW_COLORS.failed
          : loaded
          ? OVERVIEW_COLORS.quality
          : OVERVIEW_COLORS.processing,
        undefined,
        pieAlpha
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
    if (count)
      add(
        [x + w / 2, y + h / 2, radius, radius],
        minimum < 0 ? 2 : 1,
        1.2,
        count,
        0,
        OVERVIEW_COLORS.quality
      );
    // A tile that reports no timings still reads as a pie: one wedge swept by
    // how far its phase has come, the same shape as everywhere else.
    const progress = PHASE_SWEEP[TILE_PHASES[phase]] ?? 0;
    if (progress <= 0) continue;
    const pieRadius = Math.min(w, h) / 3;
    values.push(
      x + w / 2,
      y + h / 2,
      pieRadius,
      pieRadius,
      6,
      1,
      0,
      progress,
      ...faded(rgba(OVERVIEW_COLORS.processing), 0.75),
      0,
      0,
      0,
      0
    );
    add(
      [x + w / 2, y + h / 2, pieRadius, pieRadius],
      1,
      1.2,
      1,
      0,
      OVERVIEW_COLORS.processing
    );
  }
  return new Float32Array(values);
};

/** Small dynamic tail; resident tile primitives stay untouched during camera motion. */
/** Widths of a frustum edge at the eye and at the far end, in CSS pixels. */
const FRUSTUM_NEAR_WIDTH = 2.4;
const FRUSTUM_FAR_WIDTH = 1.6;

export const buildDiagnosticViewport = (
  snapshot: Pick<DiagnosticSnapshot, "edges" | "center"> & {
    origin?: readonly [number, number] | null;
    forward?: readonly [number, number] | null;
    nadirRadians?: number;
  },
  color: string = OVERVIEW_COLORS.frustum,
  /** A light: an arrow through the middle of the view along its direction. */
  light: false | { x: number; y: number } = false
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
  // Where the shadows fall: one chevron inside the light's own cut, opened by
  // how far the light stands from straight down. A sun overhead closes it to a
  // line along its direction; a low sun opens it towards a right angle.
  const forward = snapshot.forward ?? null;
  if (light && forward && snapshot.edges.length >= 4) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let i = 0; i < snapshot.edges.length; i += 2) {
      sumX += snapshot.edges[i];
      sumY += snapshot.edges[i + 1];
      count += 1;
    }
    const centre: [number, number] = [sumX / count, sumY / count];
    const size = 30;
    const tip: [number, number] = [
      centre[0] + (forward[0] * size) / 2,
      centre[1] + (forward[1] * size) / 2,
    ];
    const spread = Math.min(
      Math.PI / 2,
      Math.max(0, snapshot.nadirRadians ?? Math.PI / 4)
    );
    for (const turn of [spread, -spread]) {
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      // Both arms sweep back from the tip, so the opening is twice the angle.
      const arm: [number, number] = [
        -forward[0] * cos + forward[1] * sin,
        -forward[0] * sin - forward[1] * cos,
      ];
      add(
        [...tip, tip[0] + arm[0] * size, tip[1] + arm[1] * size],
        3,
        2.4,
        0,
        0,
        color
      );
    }
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
    // Only the tile key, z/x/y: the runtime and source prefix says nothing the
    // overview does not show already, and it never fits inside a tile.
    const id = (snapshot.ids[i / TILE_RECORD_FLOATS] ?? "").split(":").pop();
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
    // Screen pixels, fitted to the tile as it is drawn: scaling the font with
    // the crop turned a tight view into overlapping giants.
    text(
      label,
      cx,
      cy,
      Math.max(6, Math.min(13, (w * scale) / Math.max(4, label.length * 0.62)))
    );
  }
};
