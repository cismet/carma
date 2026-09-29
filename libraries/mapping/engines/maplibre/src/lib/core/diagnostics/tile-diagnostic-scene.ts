import { FILL, TILE_STEPS, type Kind } from "./tile-diagnostic-model";
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
  orbit?: { yaw: number; pitch: number };
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
