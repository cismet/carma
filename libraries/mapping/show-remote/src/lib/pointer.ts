/**
 * The pointer: a spot the presenter steers across the projected model with the
 * phone, as with a laser pointer.
 *
 * Its samples do not go into the display's state document. That document
 * carries the whole configuration and every write of it is applied as a
 * scene, which is far too heavy for something that moves many times a
 * second. The samples go to a session of their own next to the scene session,
 * and the state document only says that session exists (`PointerChannel`).
 * The display subscribes to it only then: a display polling a session nobody
 * opened would count as guessing codes, and the relay throttles that.
 */

import type { RelayTarget } from "./relay-writer";

/** what the pointer does to the picture */
export type PointerMode = "spotlight";

export const POINTER_MODES: readonly PointerMode[] = ["spotlight"];

/**
 * The pointer's entry in the display's state document. `epoch` changes each
 * time the phone opens the pointer, so a display that gave up on the session
 * (the relay restarted, say) subscribes again.
 */
export type PointerChannel = {
  session: string;
  epoch: number;
};

/**
 * One position of the spot, as the phone writes it to the pointer session.
 * Positions are offsets from the middle of the model rectangle in model
 * widths, y pointing south, so the phone never needs the rectangle's aspect.
 */
export type PointerSample = {
  /** the spot shows while the presenter holds the pointer button */
  on: boolean;
  mode: PointerMode;
  dx: number;
  dy: number;
  /** velocity in model widths per second, for the display to lead the spot by the transport delay */
  vx: number;
  vy: number;
  /** spot radius in model widths */
  radius: number;
  /** how dark everything outside the spot gets, 0 to 1 */
  dim: number;
  /** counts up with every sample, so a still hand still writes a new state */
  seq: number;
};

export const DEFAULT_POINTER_RADIUS = 0.06;
export const DEFAULT_POINTER_DIM = 0.75;

/** how far past the model edges the spot may go, in model widths */
export const POINTER_REACH = 0.75;

/** the relay accepts `[A-Z0-9_-]{4,32}` for codes a remote brings along */
export const pointerSessionCode = (code: string): string =>
  `${code.trim().toUpperCase()}-P`;

export const pointerTarget = (target: RelayTarget): RelayTarget => ({
  baseUrl: target.baseUrl,
  code: pointerSessionCode(target.code),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isPointerChannel = (value: unknown): value is PointerChannel =>
  isRecord(value) &&
  typeof value["session"] === "string" &&
  value["session"] !== "" &&
  isFiniteNumber(value["epoch"]);

export const isPointerSample = (value: unknown): value is PointerSample =>
  isRecord(value) &&
  typeof value["on"] === "boolean" &&
  POINTER_MODES.includes(value["mode"] as PointerMode) &&
  isFiniteNumber(value["dx"]) &&
  isFiniteNumber(value["dy"]) &&
  isFiniteNumber(value["vx"]) &&
  isFiniteNumber(value["vy"]) &&
  isFiniteNumber(value["radius"]) &&
  isFiniteNumber(value["dim"]) &&
  isFiniteNumber(value["seq"]);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** the rectangle the model occupies on the display, in css pixels */
export type PointerBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Where an offset lands on the display. Both axes scale with the box width,
 * since the offsets are in model widths.
 */
export const pointerToPixels = (
  box: PointerBox,
  dx: number,
  dy: number
): { x: number; y: number } => ({
  x: box.left + box.width * (0.5 + clamp(dx, -POINTER_REACH, POINTER_REACH)),
  y: box.top + box.height / 2 + box.width * clamp(dy, -POINTER_REACH, POINTER_REACH),
});
