import { useCallback, useRef, useState } from "react";
import { act, configure, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import type { Radians, Ratio } from "@carma-units";
import { usePreviewPan } from "./usePreviewPan";
import {
  usePreviewSizeSync,
  PREVIEW_OFFSET_X_VAR,
  PREVIEW_OFFSET_Y_VAR,
} from "./usePreviewSizeSync";

configure({ testIdAttribute: "data-test-id" });

vi.mock("../utils/cameraMath", () => ({
  readCameraToCenterDistancePx: () => 500,
}));

const setup = (initialActive = true) => {
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
  let beginPreview = () => {};
  const Harness = ({ show = true, active = true } = {}) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const attachRoot = useCallback((node: HTMLDivElement | null) => {
      rootRef.current = node;
      setRoot(node);
    }, []);
    const pan = usePreviewPan({
      map: map as unknown as MaplibreMap,
      root,
      enabled: active,
      imageId: "test",
      imageGeometry: {
        aspectRatio: 1.5 as Ratio,
        halfFovTan: 0.3 as Ratio,
        principal: { xOffset: 0 as Ratio, yOffset: 0 as Ratio },
        roll: 0 as Radians,
      },
      busyRef: busy,
      onPanEnd: end,
    });
    reset = pan.resetPan;
    beginPreview = pan.beginPreview;
    usePreviewSizeSync({
      map: map as unknown as MaplibreMap,
      rootRef,
      enabled: true,
      isVertical: false,
      imageAspectRatio: 1.5,
      halfFovTan: 0.3,
    });
    if (!show) return null;
    return (
      <div ref={attachRoot} data-test-id="preview">
        <div onClick={close} data-test-id="backdrop" />
      </div>
    );
  };
  const view = render(<Harness active={initialActive} />);
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
    beginPreview: () => beginPreview(),
    showPreview: () => view.rerender(<Harness />),
    hidePreview: () => view.rerender(<Harness show={false} />),
    finishReturn: () => view.rerender(<Harness show={false} active={false} />),
  };
};

describe("image preview panning", () => {
  it("retains browsing padding when an entering flight prepares and offsets the projection before showing the image", () => {
    const view = setup(false);
    act(() => view.beginPreview());
    view.map.setPadding({ left: 200, right: 0, top: 40, bottom: 0 });
    view.showPreview();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 130, 100);
    view.pointer("pointerup", 130, 100);
    expect(view.map.getPadding().left).toBe(260);
    view.hidePreview();
    expect(view.map.getPadding().left).toBe(260);
    view.finishReturn();
    expect(view.map.getPadding()).toEqual(view.original);
    view.unmount();
  });

  it("retains panned padding after the photo disappears until its camera return finishes", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 200, 200);
    view.pointer("pointerup", 200, 200);
    const panned = view.map.getPadding();
    view.hidePreview();
    expect(view.map.getPadding()).toEqual(panned);
    view.finishReturn();
    expect(view.map.getPadding()).toEqual(view.original);
    view.unmount();
  });
  it("moves the image principal point with the map projection and consumes the drag click", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 200, 200);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe(
      "110px"
    );
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe("95px");
    expect(view.map.setPadding).toHaveBeenLastCalledWith(
      { top: 200, bottom: 10, left: 220, right: 0 },
      { obliqueFov: true }
    );
    view.pointer("pointerup", 200, 200);
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
  it("stops at image edges at the screen centre, reverses immediately and restores padding", () => {
    const view = setup();
    view.pointer("pointerdown", 100, 100);
    view.pointer("pointermove", 10000, 10000);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe(
      "150px"
    );
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe(
      "100px"
    );
    view.pointer("pointermove", 11000, 11000);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe(
      "150px"
    );
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe(
      "100px"
    );
    view.pointer("pointermove", 10900, 10900);
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_X_VAR)).toBe("50px");
    expect(view.root.style.getPropertyValue(PREVIEW_OFFSET_Y_VAR)).toBe("0px");
    view.unmount();
    expect(view.map.getPadding()).toEqual(view.original);
    expect(view.root.releasePointerCapture).toHaveBeenCalledWith(1);
  });
});
