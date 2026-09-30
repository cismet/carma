import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { usePreviewResolution } from "./usePreviewResolution";
import { PREVIEW_WIDTH_VAR, PREVIEW_HEIGHT_VAR } from "./usePreviewSizeSync";

vi.mock("../utils/cameraMath", () => ({
  readCameraToCenterDistancePx: () => 500,
}));
afterEach(() => vi.useRealTimers());
const setup = () => {
  vi.useFakeTimers();
  const root = document.createElement("div");
  root.style.setProperty(PREVIEW_WIDTH_VAR, "3000px");
  root.style.setProperty(PREVIEW_HEIGHT_VAR, "2000px");
  const listeners = new Map<string, () => void>();
  const map = {
    on: (name: string, fn: () => void) => listeners.set(name, fn),
    off: (name: string) => listeners.delete(name),
  } as unknown as MaplibreMap;
  const props = {
    map,
    rootRef: { current: root },
    previewPath: "/images",
    imageId: "test",
    qualityLevel: "3" as const,
    loadedImage: { url: "/images/3/test.jpg", width: 1024, height: 700 },
  };
  return { root, props, listeners };
};
describe("on-demand preview resolution", () => {
  it("requests one sharper level after zoom settles, waits for it to decode, and keeps it after zooming out", () => {
    const { root, props, listeners } = setup();
    const { result, rerender } = renderHook(usePreviewResolution, {
      initialProps: props,
    });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("2");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe("2");
    rerender({
      ...props,
      loadedImage: { url: "/images/2/test.jpg", width: 4096, height: 3000 },
    });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("2");
    root.style.setProperty(PREVIEW_WIDTH_VAR, "500px");
    act(() => {
      listeners.get("render")?.();
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("2");
  });
  it("cancels a queued upgrade if the user zooms out and never retries a missing level", () => {
    const { root, props, listeners } = setup();
    const { result, rerender } = renderHook(usePreviewResolution, {
      initialProps: props,
    });
    root.style.setProperty(PREVIEW_WIDTH_VAR, "500px");
    root.style.setProperty(PREVIEW_HEIGHT_VAR, "300px");
    act(() => {
      listeners.get("render")?.();
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("3");
    root.style.setProperty(PREVIEW_WIDTH_VAR, "3000px");
    act(() => {
      listeners.get("render")?.();
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("2");
    rerender({ ...props });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe("2");
  });
});
