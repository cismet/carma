import { describe, expect, it } from "vitest";

import {
  MAX_FRAME_REQUEST_ROUNDS,
  clockMayRun,
  shouldRequestFailedFrames,
  type FrameStatus,
} from "./play-gate";

const status = (overrides: Partial<FrameStatus>): FrameStatus => ({
  isBlending: true,
  cacheFrames: true,
  total: 24,
  loaded: 0,
  failed: 0,
  ...overrides,
});

describe("clockMayRun", () => {
  it("always runs without cage", () => {
    expect(clockMayRun(status({ isBlending: false, loaded: 0 }))).toBe(true);
  });

  it("waits for every frame from the http cache", () => {
    expect(clockMayRun(status({ loaded: 23 }))).toBe(false);
    expect(clockMayRun(status({ loaded: 24 }))).toBe(true);
  });

  it("does not play on the tiles when a frame from the http cache failed", () => {
    expect(clockMayRun(status({ loaded: 23, failed: 1 }))).toBe(false);
  });

  it("does not run on an empty series", () => {
    expect(clockMayRun(status({ total: 0 }))).toBe(false);
  });

  it("runs on the tiles once plain frames settled with a failure", () => {
    const plain = { cacheFrames: false };
    expect(clockMayRun(status({ ...plain, loaded: 22, failed: 1 }))).toBe(false);
    expect(clockMayRun(status({ ...plain, loaded: 23, failed: 1 }))).toBe(true);
  });
});

describe("shouldRequestFailedFrames", () => {
  const settledWithFailure = status({ loaded: 23, failed: 1 });

  it("asks again while playing once nothing is in flight", () => {
    expect(shouldRequestFailedFrames(settledWithFailure, true, 0)).toBe(true);
  });

  it("does not ask while paused", () => {
    expect(shouldRequestFailedFrames(settledWithFailure, false, 0)).toBe(false);
  });

  it("waits for frames still in flight", () => {
    expect(
      shouldRequestFailedFrames(status({ loaded: 20, failed: 1 }), true, 0)
    ).toBe(false);
  });

  it("does not ask when nothing failed", () => {
    expect(shouldRequestFailedFrames(status({ loaded: 24 }), true, 0)).toBe(
      false
    );
  });

  it("stops after its rounds for one press of play", () => {
    expect(
      shouldRequestFailedFrames(
        settledWithFailure,
        true,
        MAX_FRAME_REQUEST_ROUNDS
      )
    ).toBe(false);
  });

  it("leaves plain frames and the build without cage alone", () => {
    expect(
      shouldRequestFailedFrames(
        status({ cacheFrames: false, loaded: 23, failed: 1 }),
        true,
        0
      )
    ).toBe(false);
    expect(
      shouldRequestFailedFrames(
        status({ isBlending: false, loaded: 23, failed: 1 }),
        true,
        0
      )
    ).toBe(false);
  });
});
