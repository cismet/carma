/**
 * What the display is, for the remote: a projection onto a table the
 * presenter walks around, or a screen they stand in front of. The display
 * writes it into a session of its own, since the display state belongs to the
 * remote. A display that writes nothing is a table, as before this existed.
 */

import type { RelayTarget } from "./relay-writer";

export const SURFACES = ["table", "screen"] as const;
export type Surface = (typeof SURFACES)[number];
export const DEFAULT_SURFACE: Surface = "table";

export type DisplayInfo = { surface: Surface };

/** the relay accepts `[A-Z0-9_-]{4,32}` for codes a remote brings along */
export const displayInfoSessionCode = (code: string): string =>
  `${code.trim().toUpperCase()}-D`;

export const displayInfoTarget = (target: RelayTarget): RelayTarget => ({
  baseUrl: target.baseUrl,
  code: displayInfoSessionCode(target.code),
});

export const isSurface = (value: unknown): value is Surface =>
  SURFACES.includes(value as Surface);

export const isDisplayInfo = (value: unknown): value is DisplayInfo =>
  typeof value === "object" &&
  value !== null &&
  isSurface((value as Record<string, unknown>)["surface"]);

/** the surface a session holds, the default for an empty or foreign one */
export const surfaceOf = (state: unknown): Surface =>
  isDisplayInfo(state) ? state.surface : DEFAULT_SURFACE;
