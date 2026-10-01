import { renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueImageRecord } from "../../core/types";
import { useFootprintLayer } from "./useFootprintLayer";

const footprint = vi.hoisted(() => ({
  locked: false,
  containsScreenPoint: vi.fn(
    (point: { x: number; y: number }) =>
      !footprint.locked &&
      point.x >= 20 &&
      point.x <= 100 &&
      point.y >= 20 &&
      point.y <= 100
  ),
  imageAtScreenPoint: vi.fn(() => "2024:image"),
  setRing: vi.fn(),
  setStyle: vi.fn(),
  setLocked: vi.fn((locked: boolean) => {
    footprint.locked = locked;
  }),
  destroy: vi.fn(),
}));
vi.mock("../footprint-outline-layer", () => ({
  createFootprintOutlineLayer: () => footprint,
}));
vi.mock(
  "@carma-mapping/engines/maplibre",
  async () =>
    await import("../../../../../engines/maplibre/src/utils/clickClaims")
);

const setup = () => {
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  const control = document.createElement("button");
  container.append(canvas, control);
  canvas.style.cursor = "grab";
  canvas.getBoundingClientRect = () => ({ left: 40, top: 20 } as DOMRect);
  const map = {
    getCanvasContainer: () => container,
    getCanvas: () => canvas,
  } as unknown as MaplibreMap;
  const onClick = vi.fn();
  const hostSelection = vi.fn((event: MouseEvent) => {
    if (!(event as unknown as Record<string, unknown>).__carmaClaimedClick)
      hostQuery();
  });
  const hostQuery = vi.fn();
  canvas.addEventListener("click", hostSelection);
  const props = {
    map,
    enabled: true,
    locked: false,
    selectedImageId: "2024:image",
    selectedRecord: null as ObliqueImageRecord | null,
    footprintData: null,
    onClick,
  };
  const view = renderHook(useFootprintLayer, { initialProps: props });
  const dispatch = (
    type: string,
    x = 90,
    y = 70,
    target: HTMLElement = canvas,
    button = 0
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button,
    });
    target.dispatchEvent(event);
    return event;
  };
  return { ...view, props, canvas, control, dispatch, onClick, hostQuery };
};

beforeEach(() => vi.clearAllMocks());
describe("footprint click activation", () => {
  it("opens the image on an interior click and claims it before host selection", () => {
    const view = setup();
    view.dispatch("click");
    expect(footprint.containsScreenPoint).toHaveBeenCalledWith({
      x: 50,
      y: 50,
    });
    expect(view.onClick).toHaveBeenCalledOnce();
    expect(footprint.setLocked).toHaveBeenLastCalledWith(true, undefined);
    expect(view.hostQuery).not.toHaveBeenCalled();
    view.dispatch("click");
    expect(view.onClick).toHaveBeenCalledOnce();
    view.dispatch("click", 190, 70);
    expect(view.onClick).toHaveBeenCalledOnce();
    expect(view.hostQuery).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("ignores right clicks, controls, claimed events and drags that return to their start", () => {
    const view = setup();
    view.dispatch("click", 90, 70, view.canvas, 2);
    view.dispatch("click", 90, 70, view.control);
    const claimed = new MouseEvent("click", {
      bubbles: true,
      clientX: 90,
      clientY: 70,
    });
    (claimed as unknown as Record<string, unknown>).__carmaClaimedClick = true;
    view.canvas.dispatchEvent(claimed);
    view.dispatch("pointerdown");
    view.dispatch("pointermove", 100, 70);
    view.dispatch("pointermove");
    view.dispatch("click");
    expect(view.onClick).not.toHaveBeenCalled();
    view.dispatch("pointerdown");
    view.dispatch("click", 100, 70);
    expect(view.onClick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("uses the current callback and disables activation during locks, empty selection and viewer shutdown", () => {
    const view = setup();
    const next = vi.fn();
    view.rerender({ ...view.props, onClick: next });
    view.dispatch("click");
    expect(next).toHaveBeenCalledOnce();
    expect(view.onClick).not.toHaveBeenCalled();
    view.rerender({ ...view.props, locked: true });
    view.dispatch("click");
    view.rerender({ ...view.props, selectedImageId: "" });
    view.dispatch("click");
    view.rerender({ ...view.props, enabled: false });
    view.dispatch("click");
    expect(view.onClick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("shows a pointer over the interior and restores the cursor and listeners on lock or unmount", () => {
    const view = setup();
    view.dispatch("pointermove");
    expect(view.canvas.style.cursor).toBe("pointer");
    view.dispatch("pointermove", 190, 70);
    expect(view.canvas.style.cursor).toBe("grab");
    view.dispatch("pointermove");
    view.rerender({ ...view.props, locked: true });
    expect(view.canvas.style.cursor).toBe("grab");
    view.rerender(view.props);
    view.dispatch("pointermove");
    view.unmount();
    expect(view.canvas.style.cursor).toBe("grab");
    view.dispatch("click");
    expect(view.onClick).not.toHaveBeenCalled();
    expect(footprint.destroy).toHaveBeenCalledOnce();
  });
});
