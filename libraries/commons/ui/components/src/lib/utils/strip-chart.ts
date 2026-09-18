/**
 * Strip chart: one canvas, one pixel column per push. The previous columns are
 * shifted left with a single drawImage, so a push costs O(rows), whatever the
 * frequency (one per animation frame is the intended use). No React, no
 * allocations per push. The cursor-rate diagnostics story draws the same way.
 */
export type StripChartRow = {
  id: string;
  label: string;
  color: string;
  unit?: string;
  /** Fixed lower bound; omitted autoscales to the recent maximum. */
  min?: number;
  /** Fixed upper bound; omitted autoscales to the recent maximum. */
  max?: number;
  format?: (value: number) => string;
};

export type StripChartOptions = {
  canvas: HTMLCanvasElement;
  rows: readonly StripChartRow[];
  /** CSS pixel height per row. */
  rowHeight?: number;
  background?: string;
  gridColor?: string;
  /** Columns the autoscale looks back over. */
  autoscaleWindow?: number;
  /** Headroom above the recent maximum for autoscaled rows. */
  autoscaleHeadroom?: number;
};

export type StripChart = {
  /** Draw one column; rows absent from `values` repeat their last value. */
  push: (values: Record<string, number>) => void;
  /** Resize to the canvas' CSS size at the device pixel ratio; clears the chart. */
  resize: () => void;
  /** Latest value per row, for labels. */
  current: (id: string) => number;
  formatted: (id: string) => string;
  /** Y (CSS px) of a row's centre, for placing labels over the canvas. */
  rowCenter: (id: string) => number;
  /** Time the last push took, milliseconds, for overhead accounting. */
  lastPushMs: () => number;
  destroy: () => void;
};

const defaultFormat = (value: number): string =>
  Number.isFinite(value)
    ? Math.abs(value) >= 100
      ? value.toFixed(0)
      : value.toFixed(1)
    : "–";

export const createStripChart = (options: StripChartOptions): StripChart => {
  const {
    canvas,
    rows,
    rowHeight = 18,
    background = "#f8fafc",
    gridColor = "rgba(148, 163, 184, 0.42)",
    autoscaleWindow = 240,
    autoscaleHeadroom = 1.1,
  } = options;
  const context = canvas.getContext("2d");
  const rowIndex = new Map(rows.map((row, index) => [row.id, index]));
  const current = new Map<string, number>();
  const previousY = new Map<string, number>();
  const history = new Map<string, number[]>();
  let ratio = 1;
  let width = 0;
  let height = 0;
  let lastPushMs = 0;

  const resize = () => {
    ratio = window.devicePixelRatio || 1;
    width = Math.max(1, Math.floor(canvas.clientWidth || canvas.width / ratio));
    height = rows.length * rowHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = gridColor;
    context.lineWidth = 1;
    rows.forEach((_, index) => {
      const y = index * rowHeight + 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    });
    previousY.clear();
  };

  const scaleOf = (row: StripChartRow): { min: number; max: number } => {
    const samples = history.get(row.id) ?? [];
    let max = row.max ?? Number.NEGATIVE_INFINITY;
    let min = row.min ?? Number.POSITIVE_INFINITY;
    if (row.max === undefined || row.min === undefined) {
      for (const value of samples) {
        if (row.max === undefined && value > max) max = value;
        if (row.min === undefined && value < min) min = value;
      }
    }
    if (!Number.isFinite(max)) max = 1;
    if (!Number.isFinite(min)) min = 0;
    if (row.max === undefined)
      max = Math.max(max * autoscaleHeadroom, min + 1e-9);
    return { min, max };
  };

  const push = (values: Record<string, number>) => {
    const startedAt = performance.now();
    if (!context || width === 0) {
      lastPushMs = 0;
      return;
    }
    for (const [id, value] of Object.entries(values)) {
      if (!rowIndex.has(id)) continue;
      current.set(id, value);
      let samples = history.get(id);
      if (!samples) {
        samples = [];
        history.set(id, samples);
      }
      samples.push(Number.isFinite(value) ? value : 0);
      if (samples.length > autoscaleWindow) samples.shift();
    }
    // Shift everything one column left, clear the new column.
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(canvas, -ratio, 0);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = background;
    context.fillRect(width - 1, 0, 1, height);
    context.lineWidth = 1;
    rows.forEach((row, index) => {
      const top = index * rowHeight;
      context.strokeStyle = gridColor;
      context.beginPath();
      context.moveTo(width - 1, top + 0.5);
      context.lineTo(width, top + 0.5);
      context.stroke();
      const value = current.get(row.id);
      if (value === undefined || !Number.isFinite(value)) return;
      const { min, max } = scaleOf(row);
      const unit = (Math.min(Math.max(value, min), max) - min) / (max - min);
      const y = top + rowHeight - 1.5 - unit * (rowHeight - 3);
      const from = previousY.get(row.id) ?? y;
      context.strokeStyle = row.color;
      context.beginPath();
      context.moveTo(width - 2, from);
      context.lineTo(width - 1, y);
      context.stroke();
      previousY.set(row.id, y);
    });
    lastPushMs = performance.now() - startedAt;
  };

  resize();
  return {
    push,
    resize,
    current: (id) => current.get(id) ?? Number.NaN,
    formatted: (id) => {
      const row = rows[rowIndex.get(id) ?? -1];
      const value = current.get(id);
      if (!row || value === undefined) return "–";
      return `${(row.format ?? defaultFormat)(value)}${
        row.unit ? ` ${row.unit}` : ""
      }`;
    },
    rowCenter: (id) => ((rowIndex.get(id) ?? 0) + 0.5) * rowHeight,
    lastPushMs: () => lastPushMs,
    destroy: () => {
      current.clear();
      history.clear();
      previousY.clear();
    },
  };
};
