import {
  CanvasTexture,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

import { createCanvas2d } from "./maplibre-canvas-2d";
import type { ResolvedMapLibreAreaFillStyle } from "./maplibre-area-fill-style";
import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-primitive-defaults";

/**
 * Pattern tiles, one per style and screen scale, shared by every fill that
 * uses them; a material clones its texture because repeat and offset live
 * on the texture. Null without a 2D canvas (tests).
 */
const fillTextureCache = new Map<string, Texture | null>();

const createPatternTexture = (
  key: string,
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  options: { mipmaps?: boolean } = {}
): Texture | null => {
  const cached = fillTextureCache.get(key);
  if (cached !== undefined) return cached;
  const size = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.fillGridTextureSize;
  const surface = createCanvas2d(size);
  if (!surface) {
    fillTextureCache.set(key, null);
    return null;
  }
  const { canvas, context } = surface;
  context.clearRect(0, 0, size, size);
  draw(context, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (options.mipmaps === false) {
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
  }
  fillTextureCache.set(key, texture);
  return texture;
};

/** Two by two cells per tile, the diagonal pair at full alpha, the others darker. */
export const resolveCheckerTexture = (style: ResolvedMapLibreAreaFillStyle) =>
  createPatternTexture(`checker:${style.checkerDarkShare}`, (context, size) => {
    const half = size / 2;
    context.fillStyle = `rgba(255, 255, 255, ${style.checkerDarkShare})`;
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, half, half);
    context.fillRect(half, half, half, half);
  });

/**
 * One crosshair per tile, centred, with arms and line width that come out
 * at the configured CSS pixels for a cell of `cellCssPx` on screen. The
 * tile is placed so its centre sits on a grid corner.
 */
export const resolveCrosshairTexture = (
  style: ResolvedMapLibreAreaFillStyle,
  cellCssPx: number
) => {
  const cell = Math.max(1, Math.round(cellCssPx));
  return createPatternTexture(
    `crosshair:${style.crosshairArmCssPx}:${style.crosshairWidthCssPx}:${cell}`,
    (context, size) => {
      const arm = Math.min(size / 2, (style.crosshairArmCssPx / cell) * size);
      const width = Math.max(1, (style.crosshairWidthCssPx / cell) * size);
      const centre = size / 2;
      context.fillStyle = "#ffffff";
      context.fillRect(centre - arm, centre - width / 2, arm * 2, width);
      context.fillRect(centre - width / 2, centre - arm, width, arm * 2);
    },
    // The tile is redrawn per screen cell size, so it is viewed near its own
    // scale; mipmaps would only average the hairlines away on foreshortened walls.
    { mipmaps: false }
  );
};
