import type { DevicePixels, Ratio } from "@carma-units";

/** One stored pyramid level; level 0 is the finest stored level. */
export type ImageLevel = Readonly<{
  level: number;
  width: DevicePixels;
  height: DevicePixels;
  tileWidth: DevicePixels;
  tileHeight: DevicePixels;
  cols: number;
  rows: number;
}>;
export type ImageSize = Readonly<{ width: DevicePixels; height: DevicePixels }>;
/** Rectangle in native image pixels. */
export type ImageRect = Readonly<{
  x: DevicePixels;
  y: DevicePixels;
  width: DevicePixels;
  height: DevicePixels;
}>;
export type ImageView = Readonly<{
  /** Visible native-image bounding box; may extend beyond the image. */
  visible: ImageRect;
  /** Physical display pixels per native image pixel. */
  density: Ratio;
  /** Foveation and zoom anchor in native pixels; defaults to the visible center. */
  focus?: Readonly<{ x: DevicePixels; y: DevicePixels }>;
}>;
export type ImageTileRange = Readonly<{
  level: number;
  col0: number;
  col1: number;
  row0: number;
  row1: number;
}>;
export type ImageTileRole =
  | "floor"
  | "underlay"
  | "target"
  | "target-periphery"
  | "underlay-ring"
  | "target-ring"
  | "zoom-out"
  | "finer"
  | "finer-ring";
export type ImageTileWant = Readonly<{
  key: string;
  level: number;
  col: number;
  row: number;
  role: ImageTileRole;
  /** Lower runs first. */
  priority: number;
  /** False keeps only the compressed bytes local. */
  decode: boolean;
  /** Decoded RGBA bytes. */
  bytes: number;
}>;
export type ImageLevelPlan = Readonly<{
  target: number;
  underlay: number | null;
  /** Coarsest used level, pinned whole. */
  floor: number;
  finer: number | null;
  /**
   * Target-level tiles inside the visible rectangle, whatever role planned them:
   * when the target is the floor they are floor wants. Null when nothing is visible.
   */
  visibleTarget: ImageTileRange | null;
  /** Bottom-to-top draw order; only resident tiles are drawn. */
  layers: readonly number[];
  /** Physical display pixels per level pixel. */
  scale: (level: number) => number;
  wants: readonly ImageTileWant[];
  decodedBytes: number;
}>;
export type ImageLevelPlanOptions = Readonly<{
  /** Tiles kept around the visible range of target and underlay. */
  ringTiles?: number;
  /** Upscale tolerated on the target before switching to the next finer level. */
  maxUpscale?: number;
  /**
   * Levels with a shorter long edge are not used; the coarsest remaining level is
   * the pinned floor. Default one tile (512): smaller levels add nothing over it.
   */
  minLevelEdge?: DevicePixels;
  /**
   * Decode next-finer tiles once the target is displayed at this scale or larger.
   * Default 0: always, as the lowest decoded priority within the budget.
   */
  decodeFinerAt?: number;
  /** Prepare the next finer ROI before it is needed. Default true. */
  prefetchFiner?: boolean;
  /** Coarser levels cover this multiple of the visible extent for zoom-out. */
  zoomOutFactor?: number;
  /** Fovea radius as fraction of the visible half diagonal; null disables foveation. */
  foveaRadius?: number | null;
  decodedByteBudget?: number;
  zoomIntent?: "in" | "out" | null;
}>;

const CATEGORY = 1e9;
export const imageTileKey = (level: number, col: number, row: number) =>
  `${level}:${col}:${row}`;

/** Native pixels per level pixel, per axis: rounded level sizes keep exact edges. */
export const levelToNative = (level: ImageLevel, native: ImageSize) => ({
  x: native.width / level.width,
  y: native.height / level.height,
});

/** Native rectangle of one tile, clipped to the level edge. */
export const imageTileRect = (
  level: ImageLevel,
  native: ImageSize,
  col: number,
  row: number
): ImageRect => {
  const k = levelToNative(level, native);
  const x0 = col * level.tileWidth,
    y0 = row * level.tileHeight;
  const x1 = Math.min(level.width, x0 + level.tileWidth),
    y1 = Math.min(level.height, y0 + level.tileHeight);
  return {
    x: (x0 * k.x) as DevicePixels,
    y: (y0 * k.y) as DevicePixels,
    width: ((x1 - x0) * k.x) as DevicePixels,
    height: ((y1 - y0) * k.y) as DevicePixels,
  };
};

export const tileRangeFor = (
  level: ImageLevel,
  native: ImageSize,
  rect: ImageRect,
  ring = 0
): ImageTileRange => {
  const k = levelToNative(level, native);
  const left = rect.x / k.x / level.tileWidth,
    top = rect.y / k.y / level.tileHeight;
  const right = (rect.x + rect.width) / k.x / level.tileWidth,
    bottom = (rect.y + rect.height) / k.y / level.tileHeight;
  return {
    level: level.level,
    col0: Math.max(0, Math.floor(left) - ring),
    col1: Math.min(level.cols, Math.ceil(right) + ring),
    row0: Math.max(0, Math.floor(top) - ring),
    row1: Math.min(level.rows, Math.ceil(bottom) + ring),
  };
};

/** Same-level neighbors that are missing; image edges never count. Bits: 1 left, 2 right, 4 top, 8 bottom. */
export const missingNeighbors = (
  level: ImageLevel,
  col: number,
  row: number,
  resident: (col: number, row: number) => boolean
) =>
  (col > 0 && !resident(col - 1, row) ? 1 : 0) |
  (col + 1 < level.cols && !resident(col + 1, row) ? 2 : 0) |
  (row > 0 && !resident(col, row - 1) ? 4 : 0) |
  (row + 1 < level.rows && !resident(col, row + 1) ? 8 : 0);

const DEFAULT_MIN_LEVEL_EDGE = 512 as DevicePixels;

/** Levels the stack uses, finest first; the finest level always stays. */
export const usedImageLevels = (
  levels: readonly ImageLevel[],
  minLevelEdge: DevicePixels = DEFAULT_MIN_LEVEL_EDGE
): ImageLevel[] => {
  const ordered = [...levels].sort((a, b) => a.level - b.level);
  const used = ordered.filter(
    (level) => Math.max(level.width, level.height) >= minLevelEdge
  );
  return used.length ? used : ordered.slice(0, 1);
};

/** Coarsest level that is not upscaled; the finest level once zoomed past it. */
export const targetLevel = (
  levels: readonly ImageLevel[],
  native: ImageSize,
  density: number,
  maxUpscale = 1.002
) => {
  const coarseFirst = [...levels].sort((a, b) => b.level - a.level);
  for (const level of coarseFirst)
    if (density * levelToNative(level, native).x <= maxUpscale) return level;
  return coarseFirst[coarseFirst.length - 1];
};

const clipRect = (rect: ImageRect, native: ImageSize): ImageRect | null => {
  const x0 = Math.max(0, rect.x),
    y0 = Math.max(0, rect.y);
  const x1 = Math.min(native.width, rect.x + rect.width),
    y1 = Math.min(native.height, rect.y + rect.height);
  return x1 > x0 && y1 > y0
    ? {
        x: x0 as DevicePixels,
        y: y0 as DevicePixels,
        width: (x1 - x0) as DevicePixels,
        height: (y1 - y0) as DevicePixels,
      }
    : null;
};

const expand = (
  rect: ImageRect,
  factor: number,
  focus: { x: number; y: number }
): ImageRect => ({
  x: (focus.x + (rect.x - focus.x) * factor) as DevicePixels,
  y: (focus.y + (rect.y - focus.y) * factor) as DevicePixels,
  width: (rect.width * factor) as DevicePixels,
  height: (rect.height * factor) as DevicePixels,
});

/**
 * Plan which tiles of which pyramid levels must be local or decoded for one view.
 * The target is never upscaled, its parent underlays holes, coarser levels are
 * cheap zoom-out cover, and the coarsest used level is the floor, pinned whole.
 */
export const planImageLevels = (
  levels: readonly ImageLevel[],
  native: ImageSize,
  view: ImageView,
  options: ImageLevelPlanOptions = {}
): ImageLevelPlan => {
  if (!levels.length) throw new RangeError("Image pyramid has no levels");
  const ring = options.ringTiles ?? 1;
  const ordered = usedImageLevels(levels, options.minLevelEdge);
  const byIndex = new Map(ordered.map((level) => [level.level, level]));
  const coarser = (level: number) =>
    ordered.find((candidate) => candidate.level > level) ?? null;
  const finerOf = (level: number) =>
    [...ordered].reverse().find((candidate) => candidate.level < level) ?? null;
  const scale = (level: number) => {
    const entry = byIndex.get(level);
    return entry ? view.density * levelToNative(entry, native).x : NaN;
  };
  const target = targetLevel(ordered, native, view.density, options.maxUpscale);
  const underlay = coarser(target.level);
  const floor = ordered[ordered.length - 1];
  const finer = options.prefetchFiner === false ? null : finerOf(target.level);
  const focus = view.focus ?? {
    x: view.visible.x + view.visible.width / 2,
    y: view.visible.y + view.visible.height / 2,
  };
  const halfDiagonal = Math.hypot(view.visible.width, view.visible.height) / 2;
  const fovea =
    options.foveaRadius == null ? Infinity : options.foveaRadius * halfDiagonal;
  const visible = clipRect(view.visible, native);
  const wants = new Map<string, ImageTileWant>();
  const add = (
    level: ImageLevel,
    range: ImageTileRange,
    role: ImageTileRole,
    category: number,
    decode: boolean
  ) => {
    for (let row = range.row0; row < range.row1; row++)
      for (let col = range.col0; col < range.col1; col++) {
        const key = imageTileKey(level.level, col, row);
        if (wants.has(key)) continue;
        const rect = imageTileRect(level, native, col, row);
        const distance = Math.hypot(
          rect.x + rect.width / 2 - focus.x,
          rect.y + rect.height / 2 - focus.y
        );
        let tileRole = role,
          tileCategory = category;
        if (role === "target" && distance > fovea) {
          tileRole = "target-periphery";
          tileCategory = 6.5;
        }
        const width = Math.min(
          level.tileWidth,
          level.width - col * level.tileWidth
        );
        const height = Math.min(
          level.tileHeight,
          level.height - row * level.tileHeight
        );
        wants.set(key, {
          key,
          level: level.level,
          col,
          row,
          role: tileRole,
          priority: tileCategory * CATEGORY + distance,
          decode,
          bytes: width * height * 4,
        });
      }
  };
  const all = (level: ImageLevel): ImageTileRange => ({
    level: level.level,
    col0: 0,
    col1: level.cols,
    row0: 0,
    row1: level.rows,
  });
  add(floor, all(floor), "floor", 0, true);
  const visibleTarget = visible ? tileRangeFor(target, native, visible) : null;
  if (visible && visibleTarget) {
    if (underlay)
      add(
        underlay,
        tileRangeFor(underlay, native, visible),
        "underlay",
        1,
        true
      );
    // Skipped when the target is the floor: its tiles keep the floor role.
    add(target, visibleTarget, "target", 2, true);
    if (underlay)
      add(
        underlay,
        tileRangeFor(underlay, native, visible, ring),
        "underlay-ring",
        4,
        true
      );
    add(
      target,
      tileRangeFor(target, native, visible, ring),
      "target-ring",
      5,
      true
    );
    const zoomOut = clipRect(
      expand(view.visible, options.zoomOutFactor ?? 2, focus),
      native
    );
    // The underlay and every coarser bridge level cover a zoom-out by zoomOutFactor.
    for (
      let level: ImageLevel | null = underlay;
      level && zoomOut && level.level < floor.level;
      level = coarser(level.level)
    )
      add(level, tileRangeFor(level, native, zoomOut), "zoom-out", 6, true);
    if (finer) {
      const decodeFiner =
        options.zoomIntent === "in" ||
        scale(target.level) >= (options.decodeFinerAt ?? 0);
      add(finer, tileRangeFor(finer, native, visible), "finer", 7, decodeFiner);
      add(
        finer,
        tileRangeFor(finer, native, visible, ring),
        "finer-ring",
        8,
        false
      );
    }
  }
  const sorted = [...wants.values()].sort((a, b) => a.priority - b.priority);
  const budget = options.decodedByteBudget ?? Infinity;
  let decodedBytes = 0;
  const planned = sorted.map((want) => {
    if (!want.decode) return want;
    if (want.role !== "floor" && decodedBytes + want.bytes > budget)
      return { ...want, decode: false };
    decodedBytes += want.bytes;
    return want;
  });
  // The floor may be the underlay or the target itself; draw each level once.
  const layers = [
    ...new Set([
      floor.level,
      ...ordered
        .filter(
          (level) =>
            level.level > (underlay?.level ?? target.level) &&
            level.level < floor.level
        )
        .map((level) => level.level)
        .reverse(),
      ...(underlay ? [underlay.level] : []),
      target.level,
    ]),
  ];
  return {
    target: target.level,
    underlay: underlay?.level ?? null,
    floor: floor.level,
    finer: finer?.level ?? null,
    visibleTarget,
    layers,
    scale,
    wants: planned,
    decodedBytes,
  };
};
