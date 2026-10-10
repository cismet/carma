import {
  imageTileRect,
  tileRangeFor,
  type ImageLevel,
  type ImageLevelStack,
  type ImageRect,
} from "@carma-commons/image-pyramid";
import type { DevicePixels } from "@carma-units";

export type MosaicRegionQuality = Readonly<{
  signature: string;
  tiles: readonly Readonly<{
    rect: ImageRect;
    density: number;
    token: number;
  }>[];
}>;

// A receipt must not keep decoded bitmaps alive after the pool evicts them.
const bitmapTokens = new WeakMap<object, number>();
let nextBitmapToken = 0;
const tokenFor = (bitmap: object) => {
  let token = bitmapTokens.get(bitmap);
  if (token === undefined) {
    token = ++nextBitmapToken;
    bitmapTokens.set(bitmap, token);
  }
  return token;
};
const positiveInteger = (value: number) =>
  Number.isSafeInteger(value) && value > 0;
const validRect = (rect: ImageRect) =>
  [
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    rect.x + rect.width,
    rect.y + rect.height,
  ].every(Number.isFinite) &&
  rect.width > 0 &&
  rect.height > 0;
const intersect = (a: ImageRect, b: ImageRect): ImageRect | null => {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width),
    bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y
    ? {
        x: x as DevicePixels,
        y: y as DevicePixels,
        width: (right - x) as DevicePixels,
        height: (bottom - y) as DevicePixels,
      }
    : null;
};
const validLevel = (level: ImageLevel) =>
  Number.isSafeInteger(level.level) &&
  level.level >= 0 &&
  [
    level.width,
    level.height,
    level.tileWidth,
    level.tileHeight,
    level.cols,
    level.rows,
  ].every(positiveInteger) &&
  level.cols === Math.ceil(level.width / level.tileWidth) &&
  level.rows === Math.ceil(level.height / level.tileHeight);

/** Exact rectangle union, using vertical strips instead of summed areas (which
 * would count overlap twice and could conceal an uncovered hole). */
const covered = (rect: ImageRect, candidates: readonly ImageRect[]) => {
  const parts = candidates
    .map((candidate) => intersect(rect, candidate))
    .filter((value): value is ImageRect => !!value);
  if (!parts.length) return false;
  const tolerance =
    32 *
    Number.EPSILON *
    Math.max(1, Math.abs(rect.x), Math.abs(rect.y), rect.width, rect.height);
  const xs = [
    ...new Set([
      rect.x,
      rect.x + rect.width,
      ...parts.flatMap((part) => [part.x, part.x + part.width]),
    ]),
  ].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1],
      right = xs[i];
    if (right - left <= tolerance) continue;
    const intervals = parts
      .filter(
        (part) =>
          part.x <= left + tolerance && part.x + part.width >= right - tolerance
      )
      .map((part) => [part.y, part.y + part.height] as const)
      .sort((a, b) => a[0] - b[0]);
    let end: number = rect.y;
    for (const [start, bottom] of intervals) {
      if (start > end + tolerance) return false;
      end = Math.max(end, bottom);
      if (end >= rect.y + rect.height - tolerance) break;
    }
    if (end < rect.y + rect.height - tolerance) return false;
  }
  return true;
};

/** Read resident render pixels only. null means unavailable, unchanged, or a
 * loss of previously captured detail; callers retain the existing snapshot. */
export const readMosaicRegionQuality = (
  stack: Pick<ImageLevelStack, "pyramid" | "plan" | "tile">,
  crop: ImageRect,
  previous?: MosaicRegionQuality
): MosaicRegionQuality | null => {
  const { pyramid, plan } = stack;
  if (
    !pyramid ||
    !plan ||
    !validRect(crop) ||
    !positiveInteger(pyramid.native.width) ||
    !positiveInteger(pyramid.native.height)
  )
    return null;
  const region = intersect(crop, {
    x: 0 as DevicePixels,
    y: 0 as DevicePixels,
    ...pyramid.native,
  });
  if (!region) return null;
  const tiles: MosaicRegionQuality["tiles"][number][] = [];
  for (const index of new Set(plan.layers)) {
    const level = pyramid.levels.find((value) => value.level === index);
    if (!level || !validLevel(level)) return null;
    const range = tileRangeFor(level, pyramid.native, region);
    for (let row = range.row0; row < range.row1; row++)
      for (let col = range.col0; col < range.col1; col++) {
        const bitmap = stack.tile(index, col, row);
        if (
          !bitmap ||
          !positiveInteger(bitmap.width) ||
          !positiveInteger(bitmap.height)
        )
          continue;
        const rect = intersect(
          imageTileRect(level, pyramid.native, col, row),
          region
        );
        if (rect)
          tiles.push({
            rect,
            density: level.width / pyramid.native.width,
            token: tokenFor(bitmap),
          });
      }
  }
  if (!tiles.length) return null;
  tiles.sort(
    (a, b) =>
      a.density - b.density ||
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.rect.height - b.rect.height ||
      a.rect.width - b.rect.width ||
      a.token - b.token
  );
  // Duplicate layer declarations must not look like new pixel content.
  const unique = [
    ...new Map(
      tiles.map((tile) => [
        JSON.stringify([
          tile.density,
          tile.rect.x,
          tile.rect.y,
          tile.rect.width,
          tile.rect.height,
          tile.token,
        ]),
        tile,
      ])
    ).values(),
  ];
  const signature = JSON.stringify(
    unique.map((tile) => [
      tile.density,
      tile.rect.x,
      tile.rect.y,
      tile.rect.width,
      tile.rect.height,
      tile.token,
    ])
  );
  if (signature === previous?.signature) return null;
  if (previous)
    for (const tile of previous.tiles) {
      if (
        !validRect(tile.rect) ||
        !Number.isFinite(tile.density) ||
        tile.density <= 0
      )
        return null;
      const oldRegion = intersect(tile.rect, region);
      if (
        oldRegion &&
        !covered(
          oldRegion,
          unique
            .filter((current) => current.density >= tile.density)
            .map((current) => current.rect)
        )
      )
        return null;
    }
  return { signature, tiles: unique };
};
