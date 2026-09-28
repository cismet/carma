/** Timestamped parallel plots with bounded, peak-preserving history. */
export type StripChartRow = {
  id: string;
  label: string;
  color: string;
  unit?: string;
  section?: string;
  /** Same-unit metrics with this label share one origin and numeric scale. */
  plot?: string;
  description?: string;
  min?: number;
  max?: number;
  format?: (value: number) => string;
  /** Reference, not a clipping bound. Dynamic values use the same push clock. */
  reference?: { label: string; value?: number; metric?: string };
};

export type StripChartOptions = {
  canvas: HTMLCanvasElement;
  rows: readonly StripChartRow[];
  rowHeight?: number;
  /** Reserved space above each plot for host-rendered labels. */
  plotInsetTop?: number;
  background?: string;
  gridColor?: string;
  /** Maximum buckets; old samples merge as min/max envelopes, never disappear. */
  capacity?: number;
};

type Marker = { at: number; label: string; color: string };
type Sample = {
  from: number;
  at: number;
  low: Float64Array;
  high: Float64Array;
  values: Float64Array;
  gaps: Uint8Array;
};
export type StripChart = {
  /** Milliseconds on one monotonic clock; missing values repeat, NaN is a gap. */
  push: (values: Record<string, number>, at?: number) => void;
  mark: (marker: Marker) => void;
  setWindow: (milliseconds: number | null) => void;
  timeRange: () => Readonly<{ from: number; to: number }>;
  markers: () => readonly Marker[];
  attach: (canvas: HTMLCanvasElement) => void;
  detach: (canvas: HTMLCanvasElement) => boolean;
  window: () => number | null;
  resize: (rowHeight?: number, plotInsetTop?: number) => void;
  current: (id: string) => number;
  formatted: (id: string) => string;
  range: (id: string) => Readonly<{ min: number; max: number }>;
  reference: (id: string) => string;
  rowCenter: (id: string) => number;
  lastPushMs: () => number;
  destroy: () => void;
};

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const defaultFormat = (value: number) =>
  Number.isFinite(value) ? number.format(value) : "–";

export const createStripChart = (options: StripChartOptions): StripChart => {
  const {
    rows,
    rowHeight: initialRowHeight = 64,
    plotInsetTop: initialPlotInsetTop = 0,
    background = "#f8fafc",
    gridColor = "#dce4ec",
    capacity = 2048,
  } = options;
  let rowHeight = initialRowHeight;
  let plotInsetTop = initialPlotInsetTop;
  let canvas = options.canvas;
  let attachedContext = canvas.getContext("2d");
  const plots = new Map<string, StripChartRow[]>();
  for (const row of rows) {
    const key = `${row.section ?? ""}/${row.plot ?? row.id}`;
    const metrics = plots.get(key) ?? [];
    if (
      metrics.some(
        (other) =>
          other.unit !== row.unit ||
          other.min !== row.min ||
          other.max !== row.max
      )
    )
      throw new Error(
        "Overlaid strip-chart metrics must share units and bounds"
      );
    metrics.push(row);
    plots.set(key, metrics);
  }
  const lanes = [...plots.values()];
  const laneOf = new Map(
    lanes.flatMap((metrics, index) =>
      metrics.map((row) => [row.id, index] as const)
    )
  );
  const keys = [
    ...new Set(
      rows.flatMap((row) => [
        row.id,
        ...(row.reference?.metric ? [row.reference.metric] : []),
      ])
    ),
  ];
  const keyOf = new Map(keys.map((key, index) => [key, index]));
  const current = new Float64Array(keys.length).fill(Number.NaN);
  let samples: Sample[] = [];
  let markers: Marker[] = [];
  let ranges: { min: number; max: number }[] = [];
  let windowMs: number | null = 30_000;
  let width = 1,
    height = 1,
    lastPushMs = 0;
  let firstAt: number | undefined;
  const startedAt = performance.now();

  const timeRange = () => {
    const to = samples.at(-1)?.at ?? firstAt ?? 0;
    // A trailing window keeps a fixed duration even before it has filled.
    // New samples always enter at the right; since-start instead fits history.
    if (windowMs !== null) return { from: to - windowMs, to };
    const from = firstAt ?? to;
    return { from, to: Math.max(to, from + 1000) };
  };
  const referenceValue = (row: StripChartRow, values: Float64Array) =>
    row.reference?.metric
      ? values[keyOf.get(row.reference.metric)!]
      : row.reference?.value ?? Number.NaN;

  const draw = () => {
    const context = attachedContext;
    if (!context) return;
    const { from, to } = timeRange();
    const visible = samples.filter(
      (sample) => sample.at >= from && sample.from <= to
    );
    const x = (at: number) =>
      Math.max(0, Math.min(width, ((at - from) / (to - from)) * width));
    context.clearRect(0, 0, width, height);
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1;
    context.setLineDash([]);
    context.strokeStyle = gridColor;
    const column = (position: number) => {
      if (plotInsetTop === 0) {
        context.moveTo(position, 0);
        context.lineTo(position, height);
        return;
      }
      for (let lane = 0; lane < lanes.length; lane++) {
        context.moveTo(position, lane * rowHeight + plotInsetTop);
        context.lineTo(position, (lane + 1) * rowHeight);
      }
    };
    context.beginPath();
    for (let tick = 0; tick <= 4; tick++) column((tick * width) / 4);
    context.stroke();
    ranges = lanes.map((metrics, lane) => {
      const top = lane * rowHeight;
      const first = metrics[0];
      let min = first.min ?? 0,
        max = first.max ?? 1;
      for (const row of metrics) {
        const index = keyOf.get(row.id)!;
        for (const sample of visible) {
          if (first.min === undefined && Number.isFinite(sample.low[index]))
            min = Math.min(min, sample.low[index]);
          if (first.max === undefined && Number.isFinite(sample.high[index]))
            max = Math.max(max, sample.high[index]);
          const reference = referenceValue(row, sample.values);
          if (Number.isFinite(reference)) max = Math.max(max, reference * 1.1);
        }
      }
      // References remain visible, and overshoots grow the axis instead of clipping.
      if (first.max === undefined) max = Math.max(min + 1, max * 1.05);
      const y = (value: number) =>
        top +
        rowHeight -
        3 -
        ((Math.min(max, Math.max(min, value)) - min) / (max - min)) *
          (rowHeight - plotInsetTop - 8);
      context.strokeStyle = gridColor;
      context.beginPath();
      context.moveTo(0, top + rowHeight - 1);
      context.lineTo(width, top + rowHeight - 1);
      context.stroke();
      for (const row of metrics) {
        const index = keyOf.get(row.id)!;
        context.strokeStyle = row.color;
        context.beginPath();
        let connected = false;
        for (const sample of visible) {
          const value = sample.values[index];
          if (sample.gaps[index]) connected = false;
          if (!Number.isFinite(value)) {
            if (
              sample.from !== sample.at &&
              Number.isFinite(sample.low[index])
            ) {
              context.moveTo(x(sample.at), y(sample.low[index]));
              context.lineTo(x(sample.at), y(sample.high[index]));
            }
            connected = false;
            continue;
          }
          if (connected) context.lineTo(x(sample.at), y(value));
          else context.moveTo(x(sample.at), y(value));
          // Merged historic buckets retain brief peaks, not only their last value.
          if (sample.from !== sample.at) {
            context.moveTo(x(sample.at), y(sample.low[index]));
            context.lineTo(x(sample.at), y(sample.high[index]));
            context.moveTo(x(sample.at), y(value));
          }
          connected = !sample.gaps[index];
        }
        context.stroke();
        if (!row.reference) continue;
        context.setLineDash([4, 3]);
        context.globalAlpha = 0.65;
        context.beginPath();
        connected = false;
        for (const sample of visible) {
          const value = referenceValue(row, sample.values);
          if (!Number.isFinite(value)) {
            connected = false;
            continue;
          }
          if (connected) context.lineTo(x(sample.at), y(value));
          else context.moveTo(x(sample.at), y(value));
          connected = true;
        }
        // A constant physical reference extends across the whole time window.
        if (Number.isFinite(row.reference.value)) {
          context.moveTo(0, y(row.reference.value!));
          context.lineTo(width, y(row.reference.value!));
        }
        context.stroke();
        context.globalAlpha = 1;
        context.setLineDash([]);
      }
      return { min, max };
    });
    // All lanes use exactly the same event positions and time range.
    context.setLineDash([2, 4]);
    const pixels = new Set<string>();
    for (const marker of markers) {
      if (marker.at < from || marker.at > to) continue;
      const position = Math.round(x(marker.at));
      const key = `${position}/${marker.color}`;
      if (pixels.has(key)) continue;
      pixels.add(key);
      context.strokeStyle = marker.color;
      context.globalAlpha = 0.45;
      context.beginPath();
      column(position);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.setLineDash([]);
  };

  const resize = (nextRowHeight = rowHeight, nextInset = plotInsetTop) => {
    rowHeight = Math.max(16, nextRowHeight);
    plotInsetTop = Math.max(0, Math.min(nextInset, rowHeight - 16));
    const ratio =
      canvas.ownerDocument?.defaultView?.devicePixelRatio ||
      window.devicePixelRatio ||
      1;
    width = Math.max(1, Math.floor(canvas.clientWidth || 1));
    height = lanes.length * rowHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    attachedContext?.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  };
  const push: StripChart["push"] = (
    values,
    at = performance.now() - startedAt
  ) => {
    if (!Number.isFinite(at) || (samples.length && at < samples.at(-1)!.at))
      return;
    const start = performance.now();
    firstAt ??= at;
    for (let i = 0; i < keys.length; i++)
      if (values[keys[i]] !== undefined) current[i] = values[keys[i]];
    samples.push({
      from: at,
      at,
      values: current.slice(),
      low: current.slice(),
      high: current.slice(),
      gaps: Uint8Array.from(current, (value) =>
        Number.isFinite(value) ? 0 : 1
      ),
    });
    if (samples.length > Math.max(16, capacity)) {
      const merged: Sample[] = [];
      // Keep the latest half at full resolution for the trailing view.
      const end = Math.floor(samples.length / 4) * 2;
      for (let i = 0; i < end; i += 2) {
        const a = samples[i],
          b = samples[i + 1];
        const low = a.low.map((v, j) =>
          Number.isFinite(v)
            ? Number.isFinite(b.low[j])
              ? Math.min(v, b.low[j])
              : v
            : b.low[j]
        );
        const high = a.high.map((v, j) =>
          Number.isFinite(v)
            ? Number.isFinite(b.high[j])
              ? Math.max(v, b.high[j])
              : v
            : b.high[j]
        );
        // Retain peaks on either side of missing data without connecting the gap.
        const gaps = a.gaps.map((value, j) => value || b.gaps[j]);
        merged.push({
          from: a.from,
          at: b.at,
          low,
          high,
          values: b.values,
          gaps,
        });
      }
      samples = [...merged, ...samples.slice(end)];
    }
    draw();
    lastPushMs = performance.now() - start;
  };
  resize();
  return {
    push,
    mark: (marker) => {
      if (!Number.isFinite(marker.at)) return;
      markers.push(marker);
      if (markers.length > 2048)
        markers = markers.filter(
          (_, index) => index >= 1024 || index % 2 === 0
        );
    },
    attach: (next) => {
      canvas = next;
      attachedContext = canvas.getContext("2d");
      resize();
    },
    detach: (previous) => {
      if (canvas !== previous) return false;
      attachedContext = null;
      return true;
    },
    window: () => windowMs,
    markers: () => markers,
    setWindow: (milliseconds) => {
      windowMs = milliseconds === null ? null : Math.max(1000, milliseconds);
      draw();
    },
    timeRange,
    resize,
    current: (id) => current[keyOf.get(id) ?? -1] ?? Number.NaN,
    formatted: (id) => {
      const row = rows.find((row) => row.id === id);
      const value = current[keyOf.get(id) ?? -1];
      return !row || !Number.isFinite(value)
        ? "–"
        : `${(row.format ?? defaultFormat)(value)}${
            row.unit ? ` ${row.unit}` : ""
          }`;
    },
    range: (id) => ranges[laneOf.get(id) ?? 0] ?? { min: 0, max: 1 },
    reference: (id) => {
      const row = rows.find((row) => row.id === id);
      if (!row?.reference) return "";
      const value = referenceValue(row, current);
      return `${row.reference.label}: ${defaultFormat(value)}${
        row.unit ? ` ${row.unit}` : ""
      }`;
    },
    rowCenter: (id) =>
      (laneOf.get(id) ?? 0) * rowHeight +
      plotInsetTop +
      (rowHeight - plotInsetTop) / 2,
    lastPushMs: () => lastPushMs,
    destroy: () => {
      samples = [];
      markers = [];
      ranges = [];
    },
  };
};
