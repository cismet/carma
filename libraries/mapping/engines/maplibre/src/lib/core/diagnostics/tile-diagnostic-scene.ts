import { FILL, TILE_STEPS, type Kind } from "./tile-diagnostic-model";
import type { TileCameraSnapshot } from "../tile-camera-demand";
import type { DiagnosticViewportBasis } from "./tile-diagnostic-model";
import type { TileDiagnosticLabelMode } from "./tile-diagnostic-options";

/** Symbols are samples of the emitted primitives, normalized to a 12×12 swatch. */
export type DiagnosticLegendEntry = {
  id: string;
  label: string;
  primitives: readonly number[];
};

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

/** The glyph of a tile's load phase; a tile with no phase to show has none. */
export const TILE_DIAGNOSTIC_PHASE = {
  NONE: "",
  QUEUED: "○",
  LOADING: "◐",
  LOADED: "●",
  FAILED: "×",
  DEFERRED: "Ⅱ",
} as const;

/** The phases in the order records encode them: a record stores the index. */
export const TILE_PHASES = [
  TILE_DIAGNOSTIC_PHASE.NONE,
  TILE_DIAGNOSTIC_PHASE.QUEUED,
  TILE_DIAGNOSTIC_PHASE.LOADING,
  TILE_DIAGNOSTIC_PHASE.LOADED,
  TILE_DIAGNOSTIC_PHASE.FAILED,
  TILE_DIAGNOSTIC_PHASE.DEFERRED,
] as const;

/** How much of a tile's pie a phase alone fills, with no timings to divide. */
export const PHASE_SWEEP: Readonly<Record<string, number>> = {
  [TILE_DIAGNOSTIC_PHASE.QUEUED]: 0.25,
  [TILE_DIAGNOSTIC_PHASE.LOADING]: 0.6,
  [TILE_DIAGNOSTIC_PHASE.LOADED]: 1,
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
  orbit?: { yaw: number; pitch: number };
  /** Overview-space depth range; the worker preserves each face and cut depth. */
  depthRange?: readonly [number, number];
  view: DiagnosticView;
  width: number;
  height: number;
  pixelRatio: number;
  opacity: number;
  popout: boolean;
  labels: TileDiagnosticLabelMode;
  selection: ReadonlyArray<readonly [number, number]>;
};

/** What the host asks of the diagnostic worker. */
export const TILE_DIAGNOSTIC_WORKER_COMMAND = {
  INIT: "init",
  DISPOSE: "dispose",
  CAMERA: "camera",
  FRAME: "frame",
} as const;

/** What the diagnostic worker reports back to its host. */
export const TILE_DIAGNOSTIC_WORKER_REPLY = {
  ERROR: "error",
  READY: "ready",
  FRAME: "frame",
  DISPOSED: "disposed",
} as const;

export type DiagnosticWorkerMessage =
  | {
      type: typeof TILE_DIAGNOSTIC_WORKER_COMMAND.INIT;
      foreground: OffscreenCanvas;
      contrast: OffscreenCanvas;
      text: OffscreenCanvas;
    }
  | { type: typeof TILE_DIAGNOSTIC_WORKER_COMMAND.DISPOSE }
  | {
      type: typeof TILE_DIAGNOSTIC_WORKER_COMMAND.CAMERA;
      camera: TileCameraSnapshot;
      cameras?: readonly TileCameraSnapshot[];
    }
  | {
      type: typeof TILE_DIAGNOSTIC_WORKER_COMMAND.FRAME;
      frame: DiagnosticFrame;
      snapshot?: DiagnosticSnapshot;
    };

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

// The palette is intentionally restricted to the diagnostic's hex/rgba constants.
const colors = new Map<string, readonly number[]>();

export const rgba = (value: string): readonly number[] => {
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
