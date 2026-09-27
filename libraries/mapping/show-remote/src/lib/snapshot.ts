/**
 * A small picture of what the display shows, for the remote: the presenter
 * finds their side of the table by it. The remote asks in the display state
 * (`SnapshotRequest`), the display answers in a session of its own, since
 * writing into the display state would overwrite what the remote wants.
 */

import type { RelayTarget } from "./relay-writer";

/** a new `id` for every picture wanted; the display takes each id once */
export type SnapshotRequest = { id: number };

/**
 * The display's answer to the request with the same `id`: a JPEG data url of
 * the model's rectangle as the map draws it, overlays and blackout left out,
 * or why there is none.
 */
export type Snapshot =
  | { id: number; image: string; width: number; height: number }
  | { id: number; error: string };

/** the relay accepts `[A-Z0-9_-]{4,32}` for codes a remote brings along */
export const snapshotSessionCode = (code: string): string =>
  `${code.trim().toUpperCase()}-S`;

export const snapshotTarget = (target: RelayTarget): RelayTarget => ({
  baseUrl: target.baseUrl,
  code: snapshotSessionCode(target.code),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const isSnapshotRequest = (value: unknown): value is SnapshotRequest =>
  isRecord(value) &&
  typeof value["id"] === "number" &&
  Number.isFinite(value["id"]);

export const isSnapshot = (value: unknown): value is Snapshot =>
  isRecord(value) &&
  typeof value["id"] === "number" &&
  Number.isFinite(value["id"]) &&
  ((typeof value["image"] === "string" &&
    value["image"].startsWith("data:image/") &&
    isPositive(value["width"]) &&
    isPositive(value["height"])) ||
    typeof value["error"] === "string");
