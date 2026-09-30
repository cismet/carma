import { useCallback, useRef, useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import { usePreviewPan } from "./usePreviewPan";
import {
  usePreviewSizeSync,
  PREVIEW_OFFSET_X_VAR,
  PREVIEW_OFFSET_Y_VAR,
} from "./usePreviewSizeSync";

vi.mock("../utils/cameraMath", () => ({
  readCameraToCenterDistancePx: () => 500,
}));

const setup = () => {
  let padding: PaddingOptions = { top: 0, bottom: 10, left: 20, right: 0 };
  const original = { ...padding };
  const listeners = new Map<string, Set<() => void>>();
  const transform = {
    width: 800,
    height: 600,
    get centerOffset() {
      return {
        x: (padding.left - padding.right) / 2,
        y: (padding.top - padding.bottom) / 2,
      };
    },
    isPaddingEqual: (p: PaddingOptions) =>
      (Object.keys(original) as (keyof PaddingOptions)[]).every(
        (key) => p[key] === padding[key]
      ),
  };
  const map = {
    transform,
    getPadding: () => ({ ...padding }),
    setPadding: vi.fn((next: PaddingOptions) => {
      padding = next;
      listeners.get("render")?.forEach((fn) => fn());
    }),
    on: (name: string, fn: () => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    off: (name: string, fn: () => void) => listeners.get(name)?.delete(fn),
  };
  const close = vi.fn(),
    end = vi.fn();
  const busy = { current: false };
  let reset = () => {};
  const Harness = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const attachRoot = useCallback((node: HTMLDivElement | null) => {
      rootRef.current = node;
      setRoot(node);
    }, []);
    reset = usePreviewPan({
      map: map as unknown as MaplibreMap,
      root,
      enabled: true,
      imageId: "test",
      busyRef: busy,
      onPanEnd: end,
    });
    usePreviewSizeSync({
      map: map as unknown as MaplibreMap,
      rootRef,
      enabled: true,
      isVertical: false,
      imageAspectRatio: 1.5,
      halfFovTan: 0.3,
    });
    return (
      <div ref={attachRoot} data-testid="preview">
        <div onClick={close} data-testid="backdrop" />
      </div>
    );
  };
  const view = render(<Harness />);
  const root = view.getByTestId("preview");
  const captured = new Set<number>();
  root.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  root.hasPointerCapture = (id) => captured.has(id);
  root.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    fireEvent(root, event);
  };
  return {
    ...view,
    root,
    map,
    pointer,
    close,
    end,
    busy,
    original,
    reset: () => reset(),
  };
};

describe("image preview panning", () => {
  it("moves the image principal point with the map projection and consumes the drag click", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 300, 200);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe(
      "210px"
    );
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe("95px");
    expect(view.map.setPadding).toHaveBeenLastCalledWith(
      { top: 200, bottom: 10, left: 420, right: 0 },
      { obliqueFov: true }
    );
    view.pointer("pointerup", 300, 200);
    fireEvent.click(view.getByTestId("backdrop"));
    expect(view.close).not.toHaveBeenCalled();
    expect(view.end).toHaveBeenCalledOnce();
    act(() => view.reset());
    expect(view.map.getPadding()).toEqual(view.original);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe("10px");
    view.unmount();
  });
  it("keeps a click to close and ignores dragging during a camera flight", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 101, 101);
    view.pointer("pointerup", 101, 101);
    fireEvent.click(view.getByTestId("backdrop"));
    expect(view.close).toHaveBeenCalledOnce();
    expect(view.map.setPadding).not.toHaveBeenCalled();
    view.busy.current = true;
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 200, 200);
    expect(view.map.setPadding).not.toHaveBeenCalled();
    view.unmount();
  });
  it("allows another drag after a press ends outside the overlay before capture", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    const release = new MouseEvent("pointerup", { bubbles: true });
    Object.defineProperty(release, "pointerId", { value: 1 });
    fireEvent(window, release);
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 150, 150);
    expect(view.map.setPadding).toHaveBeenCalledOnce();
    view.unmount();
  });
  it("reverses immediately at the viewport boundary and restores the host padding on unmount", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 10000, 10000);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe(
      "400px"
    );
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe(
      "300px"
    );
    view.pointer("pointermove", 9900, 9900);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe(
      "300px"
    );
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe(
      "200px"
    );
    view.unmount();
    expect(view.map.getPadding()).toEqual(view.original);
    expect(view.root.releasePointerCapture).toHaveBeenCalledWith(1);
  });
});
