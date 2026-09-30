import { formatTileResidentBytes } from "./tile-diagnostic-labels";
import { FILL, OVERVIEW_COLORS, TILE_STEPS } from "./tile-diagnostic-model";
import {
  TILE_RECORD_FLOATS,
  TILE_STEP_SLOTS,
  TILE_STEP_OFFSET,
  TILE_LEVEL_OFFSET,
  SIZE_GRID,
  ANCESTOR_OPACITY_STEP,
  SIZE_GRID_OPACITY,
  TILE_DIAGNOSTIC_PHASE,
  TILE_KINDS,
  TILE_PHASES,
  PHASE_SWEEP,
  PRIMITIVE_FLOATS,
  type DiagnosticLegendEntry,
  type DiagnosticSnapshot,
  rgba,
} from "./tile-diagnostic-scene";

export const buildDiagnosticPrimitives = (
  snapshot: DiagnosticSnapshot,
  onLegend?: (entries: DiagnosticLegendEntry[]) => void,
  onPrimitive?: (offset: number, record: number) => void
): Float32Array => {
  const values: number[] = [];
  let record = -1;
  const legend = onLegend ? new Map<string, DiagnosticLegendEntry>() : null;
  const remember = (
    entry?: readonly [id: string, label: string],
    append = false
  ) => {
    if (!entry || !legend) return;
    const previous = legend.get(entry[0]);
    if (
      previous &&
      (!append || previous.primitives.length >= PRIMITIVE_FLOATS * 2)
    )
      return;
    const primitive = values.slice(-PRIMITIVE_FLOATS);
    if (!primitive.every(Number.isFinite)) return;
    primitive.splice(
      0,
      4,
      6,
      6,
      primitive[4] === 4 ? 3 : 5,
      primitive[4] === 4 ? 3 : 5
    );
    if (primitive[4] === 1 || primitive[4] === 2)
      primitive[6] = Math.min(2, primitive[6]);
    if (primitive[4] === 6 && entry[0].startsWith("step-")) {
      primitive[6] = 0;
      primitive[7] = 0.25;
    }
    legend.set(entry[0], {
      id: entry[0],
      label: entry[1],
      primitives: previous ? [...previous.primitives, ...primitive] : primitive,
    });
  };
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
    alpha = 1,
    legendEntry?: readonly [id: string, label: string],
    appendLegend = false
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
    onPrimitive?.(values.length - PRIMITIVE_FLOATS, record);
    remember(legendEntry, appendLegend);
  };
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    stroke: number,
    color: string,
    fill?: string,
    alpha = 1,
    legendEntry?: readonly [id: string, label: string]
  ) =>
    add(
      [x + w / 2, y + h / 2, w / 2, h / 2],
      0,
      stroke,
      0,
      0,
      color,
      fill,
      alpha,
      legendEntry
    );
  if (snapshot.extent) {
    const { x, y, w, h } = snapshot.extent;
    rect(x, y, w, h, 1, OVERVIEW_COLORS.grid, undefined, 1, [
      "extent",
      "Tileset extent",
    ]);
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
  const LOADED_PHASE = TILE_PHASES.indexOf(TILE_DIAGNOSTIC_PHASE.LOADED);
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
  let byteUnit = 10 * 1024;
  while (maximumBytes / byteUnit > SIZE_GRID * SIZE_GRID) byteUnit *= 10;
  const byteLegend: readonly [string, string] | undefined = legend
    ? ["bytes", `1 cell = ${formatTileResidentBytes(byteUnit)}`]
    : undefined;
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    record = i / TILE_RECORD_FLOATS;
    const [x, y, w, h, kind, flags] = data.subarray(i, i + 6);
    const outlier = isOutlier(i);
    const [id, label, color] = outlier
      ? ["slow", "Slow tile", OVERVIEW_COLORS.failed]
      : flags & 32
      ? ["viewport", "Viewport", OVERVIEW_COLORS.grid]
      : flags & 64
      ? ["seam", "Seam", OVERVIEW_COLORS.seam]
      : flags & 128
      ? ["base", "Base", OVERVIEW_COLORS.reserve]
      : flags & 4
      ? ["retained", "Outside views", OVERVIEW_COLORS.baseline]
      : flags & 1
      ? ["base", "Base", OVERVIEW_COLORS.reserve]
      : flags & 2
      ? ["ring", "LOD ring", OVERVIEW_COLORS.ring]
      : kind < 0
      ? ["ancestor", "Coarser boundary", OVERVIEW_COLORS.parent]
      : ["content", "Content", OVERVIEW_COLORS.grid];
    rect(
      x,
      y,
      w,
      h,
      outlier ? 1.6 : flags & 3 ? 1 : kind < 0 ? 0.5 : 0.6,
      color,
      kind < 0
        ? undefined
        : flags & 32
        ? "rgba(0,224,255,0.30)"
        : flags & 64
        ? "rgba(255,196,107,0.22)"
        : flags & 128
        ? "rgba(255,156,240,0.18)"
        : FILL[TILE_KINDS[kind]],
      outlier ? 1 : opacityOf(data[i + TILE_LEVEL_OFFSET]),
      [id, label]
    );
  }
  for (let i = 0; i < data.length; i += TILE_RECORD_FLOATS) {
    record = i / TILE_RECORD_FLOATS;
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
        gridAlpha,
        byteLegend
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
    record = i / TILE_RECORD_FLOATS;
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
        add(
          [x + w / 2, y + h / 2, radius, radius],
          6,
          1,
          start,
          end,
          TILE_STEPS[slot].color,
          undefined,
          pieAlpha * 0.85,
          [`step-${slot}`, TILE_STEPS[slot].label]
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
        pieAlpha,
        ["time", "Ring = median · area = time"]
      );
      continue;
    }
    if (kind < 0 || (flags & 4 && !phase)) continue;
    // A terminal tile cannot refine further: a fixed-size centroid dot replaces
    // hypothetical remaining LOD circles.
    if (flags & 16 && minimum > 0) {
      add(
        [x + w / 2, y + h / 2, 3, 3],
        4,
        0,
        0,
        0,
        OVERVIEW_COLORS.quality,
        undefined,
        1,
        ["quality-leaf", "Finest tile · target unmet"]
      );
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
        OVERVIEW_COLORS.quality,
        undefined,
        1,
        minimum < 0
          ? ["quality-excess", "Finer than target"]
          : ["quality-detail", "Needs detail"]
      );
    // A tile that reports no timings still reads as a pie: one wedge swept by
    // how far its phase has come, the same shape as everywhere else.
    const progress = PHASE_SWEEP[TILE_PHASES[phase]] ?? 0;
    if (progress <= 0) continue;
    const pieRadius = Math.min(w, h) / 3;
    add(
      [x + w / 2, y + h / 2, pieRadius, pieRadius],
      6,
      1,
      0,
      progress,
      OVERVIEW_COLORS.processing,
      undefined,
      0.75,
      [`phase-${phase}`, ["", "Queued", "Downloading", "Ready"][phase]]
    );
    add(
      [x + w / 2, y + h / 2, pieRadius, pieRadius],
      1,
      1.2,
      1,
      0,
      OVERVIEW_COLORS.processing,
      undefined,
      1,
      [`phase-${phase}`, ["", "Queued", "Downloading", "Ready"][phase]],
      true
    );
  }
  if (legend) onLegend?.([...legend.values()]);
  return new Float32Array(values);
};
