// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { StyleSpecification } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STYLE_RESOURCE_TIMEOUT_MS } from "../utils/fetch-style-resource";
import { useInitialMapStyle } from "./useInitialMapStyle";

const background: StyleSpecification = { version: 8, sources: {}, layers: [] };
const composed: StyleSpecification = { ...background, name: "composed" };
const props = {
  backgroundStyle: background,
  defer: true,
  layerMode: "merged" as const,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("initial map style", () => {
  it("uses a completed composition and clears the fallback timer", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInitialMapStyle(props));
    expect(result.current.initialStyle).toBeNull();
    act(() => result.current.completeInitialStyle(composed));
    expect(result.current.initialStyle).toBe(composed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mounts a background after the deadline and keeps its identity when composition arrives late", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInitialMapStyle(props));
    act(() => vi.advanceTimersByTime(STYLE_RESOURCE_TIMEOUT_MS - 1));
    expect(result.current.initialStyle).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.initialStyle).toBe(background);
    act(() => result.current.completeInitialStyle(composed));
    expect(result.current.initialStyle).toBe(background);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the current background without restarting the startup deadline", () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(useInitialMapStyle, {
      initialProps: props,
    });
    act(() => vi.advanceTimersByTime(STYLE_RESOURCE_TIMEOUT_MS - 1));
    const latest = { ...background, name: "new background" };
    rerender({ ...props, backgroundStyle: latest });
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.initialStyle).toBe(latest);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait for merged composition in imperative mode", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useInitialMapStyle({ ...props, layerMode: "imperative" })
    );
    expect(result.current.initialStyle).toBe(background);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("has no startup gate when deferral is off and clears pending timers on removal", () => {
    vi.useFakeTimers();
    const ordinary = renderHook(() =>
      useInitialMapStyle({ ...props, defer: false })
    );
    expect(ordinary.result.current.initialStyle).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    ordinary.unmount();
    const deferred = renderHook(() => useInitialMapStyle(props));
    expect(vi.getTimerCount()).toBe(1);
    deferred.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
