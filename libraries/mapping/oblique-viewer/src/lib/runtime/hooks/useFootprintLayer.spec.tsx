import { act, renderHook } from "@testing-library/react";
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
  setHoveredImage: vi.fn(),
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

const setup = (
  findAtScreenPoint?: (point: {
    x: number;
    y: number;
  }) => Promise<ObliqueImageRecord | null | undefined>
) => {
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  const control = document.createElement("button");
  container.append(canvas, control);
  canvas.style.cursor = "grab";
  canvas.getBoundingClientRect = () => ({ left: 40, top: 20 } as DOMRect);
  const map = {
    getCanvasContainer: () => container,
    getCanvas: () => canvas,
    on: vi.fn(),
    off: vi.fn(),
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
    nearbyRecords: undefined as readonly ObliqueImageRecord[] | undefined,
    onClick,
    findAtScreenPoint,
    onHoveredRecord: vi.fn(),
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

describe("catalog footprint hover activation", () => {
  it("starts on one click before hover has completed, without native features", async () => {
    const record = {
      id: "2026:one-click",
      seriesId: "2026",
    } as ObliqueImageRecord;
    const find = vi.fn(async () => record);
    const view = setup(find);
    try {
      view.dispatch("click", 220, 100);
      expect(view.hostQuery).not.toHaveBeenCalled();
      await act(async () => {
        await Promise.resolve();
      });
      expect(find).toHaveBeenCalledWith({ x: 180, y: 80 });
      expect(view.onClick).toHaveBeenCalledOnce();
      expect(view.onClick).toHaveBeenCalledWith(record.id);
    } finally {
      view.unmount();
    }
  });
  it("ignores a delayed click pick after the viewer is disabled", async () => {
    let resolve = (_record: ObliqueImageRecord) => {};
    const find = () =>
      new Promise<ObliqueImageRecord>((done) => {
        resolve = done;
      });
    const view = setup(find);
    view.dispatch("click", 220, 100);
    view.rerender({ ...view.props, enabled: false });
    await act(async () => {
      resolve({ id: "2026:late" } as ObliqueImageRecord);
    });
    expect(view.onClick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("accepts a hover reply while the next pointer position is still coalescing", async () => {
    vi.useFakeTimers();
    const record = {
      id: "2026:moving",
      seriesId: "2026",
      footprint: [
        [7, 51],
        [7.01, 51],
        [7.01, 50.99],
        [7, 50.99],
        [7, 51],
      ],
    } as ObliqueImageRecord;
    let resolve = (_record: ObliqueImageRecord) => {};
    const find = vi.fn(
      () =>
        new Promise<ObliqueImageRecord>((done) => {
          resolve = done;
        })
    );
    const view = setup(find);
    try {
      view.dispatch("pointermove", 200, 70);
      await vi.advanceTimersByTimeAsync(50);
      view.dispatch("pointermove", 210, 70);
      await act(async () => {
        resolve(record);
      });
      expect(find).toHaveBeenCalledOnce();
      expect(footprint.setHoveredImage).toHaveBeenLastCalledWith(
        record.id,
        expect.objectContaining({ id: record.id })
      );
      expect(view.canvas.style.cursor).toBe("pointer");
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("highlights and opens a catalog match outside the displayed click targets", async () => {
    vi.useFakeTimers();
    const record = {
      id: "2026:outside",
      seriesId: "2026",
      footprint: [
        [7.2, 51.27],
        [7.21, 51.27],
        [7.21, 51.28],
        [7.2, 51.28],
        [7.2, 51.27],
      ],
    } as ObliqueImageRecord;
    const find = vi.fn(async () => record);
    const view = setup(find);
    try {
      view.dispatch("pointermove", 200, 70);
      await vi.advanceTimersByTimeAsync(50);
      expect(find).toHaveBeenCalledWith({ x: 160, y: 50 });
      expect(footprint.setHoveredImage).toHaveBeenLastCalledWith(
        record.id,
        expect.objectContaining({ id: record.id, ring: record.footprint })
      );
      expect(view.canvas.style.cursor).toBe("pointer");
      view.dispatch("click", 200, 70);
      expect(view.onClick).toHaveBeenCalledWith(record.id);
      expect(view.hostQuery).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("reports only actual hovered record changes and clears the prefetch candidate on leave", async () => {
    vi.useFakeTimers();
    const record = {
      id: "2026:hover",
      seriesId: "2026",
      footprint: [
        [7, 51],
        [7.01, 51],
        [7.01, 50.99],
        [7, 50.99],
        [7, 51],
      ],
    } as ObliqueImageRecord;
    const view = setup(vi.fn(async () => record));
    try {
      view.dispatch("pointermove", 200, 70);
      await vi.advanceTimersByTimeAsync(50);
      view.dispatch("pointermove", 210, 70);
      await vi.advanceTimersByTimeAsync(50);
      expect(view.props.onHoveredRecord).toHaveBeenCalledOnce();
      expect(view.props.onHoveredRecord).toHaveBeenCalledWith(record);
      view.dispatch("pointercancel");
      expect(view.props.onHoveredRecord).toHaveBeenLastCalledWith(null);
      expect(view.props.onHoveredRecord).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("ignores late hover replies after the pointer leaves", async () => {
    vi.useFakeTimers();
    let resolve: (record: ObliqueImageRecord) => void = () => {};
    const find = vi.fn(
      () =>
        new Promise<ObliqueImageRecord>((done) => {
          resolve = done;
        })
    );
    const view = setup(find);
    try {
      view.dispatch("pointermove", 200, 70);
      await vi.advanceTimersByTimeAsync(50);
      view.dispatch("pointercancel");
      resolve({ id: "late", footprint: [[7.2, 51.27]] } as ObliqueImageRecord);
      await vi.advanceTimersByTimeAsync(0);
      expect(view.canvas.style.cursor).toBe("grab");
      expect(footprint.setHoveredImage).not.toHaveBeenCalledWith(
        "late",
        expect.anything()
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });
  it("keeps catalog-neighbor updates out of the drawing effect while retaining full-catalog hover", () => {
    const view = setup();
    const center = {
      id: "2024:image",
      seriesId: "2024",
      footprint: [
        [7, 51],
        [7.01, 51],
        [7.01, 50.99],
        [7, 50.99],
        [7, 51],
      ],
    } as unknown as ObliqueImageRecord;
    view.rerender({ ...view.props, selectedRecord: center, nearbyRecords: [] });
    const commits = footprint.setRing.mock.calls.length;
    for (let index = 0; index < 20; index++) {
      view.rerender({
        ...view.props,
        selectedRecord: center,
        nearbyRecords: [{ ...center, id: "candidate-" + index }],
      });
    }
    expect(footprint.setRing).toHaveBeenCalledTimes(commits);
    view.unmount();
  });
});
