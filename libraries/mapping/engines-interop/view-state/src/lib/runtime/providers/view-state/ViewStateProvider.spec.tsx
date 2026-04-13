// @vitest-environment jsdom

import { useContext, type PropsWithChildren } from "react";

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViewStateContext } from "./ViewStateContext";
import { ViewStateProvider } from "./ViewStateProvider";
const wrapper = ({ children }: PropsWithChildren) => (
  <ViewStateProvider>{children}</ViewStateProvider>
);

describe("ViewStateProvider controller lifetime", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let rafQueue: Array<{ id: number; callback: FrameRequestCallback }> = [];
  let nextRafId = 1;

  const advanceFrames = (count: number) => {
    for (let index = 0; index < count; index += 1) {
      const nextFrame = rafQueue.shift();
      if (!nextFrame) {
        return;
      }
      nextFrame.callback(index * 16);
    }
  };

  beforeEach(() => {
    rafQueue = [];
    nextRafId = 1;
    globalThis.requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        const id = nextRafId++;
        rafQueue.push({ id, callback });
        return id;
      }
    );
    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      rafQueue = rafQueue.filter((entry) => entry.id !== id);
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("expires stale sync controllers", () => {
    const { result } = renderHook(() => useContext(ViewStateContext), {
      wrapper,
    });

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current?.register("slot-1", "maplibre");
      result.current?.claimControl("slot-1", "sync");
      advanceFrames(12);
    });

    expect(result.current?.getControllerId()).toBeNull();

    unregister?.();
  });

  it("keeps user-interaction controllers latched across idle frames", () => {
    const { result } = renderHook(() => useContext(ViewStateContext), {
      wrapper,
    });

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current?.register("slot-1", "maplibre");
      result.current?.claimControl("slot-1", "user-interaction");
      advanceFrames(12);
    });

    expect(result.current?.getControllerId()).toBe("slot-1");

    unregister?.();
  });
});
