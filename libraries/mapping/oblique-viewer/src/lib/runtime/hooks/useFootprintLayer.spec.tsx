import { act, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  setLabelsVisible: vi.fn(),
  setMissingImages: vi.fn(),
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
  const listeners = new Map<string, () => void>();
  const map = {
    getCanvasContainer: () => container,
    getCanvas: () => canvas,
    isMoving: vi.fn(() => false),
    listens: vi.fn(() => false),
    on: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
    off: vi.fn((type: string, listener: () => void) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
  } as unknown as MaplibreMap;
  const onClick = vi.fn();
  const onDoubleClick = vi.fn();
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
    hidden: false,
    selectedImageId: "2024:image",
    selectedRecord: null as ObliqueImageRecord | null,
    nearbyRecords: undefined as readonly ObliqueImageRecord[] | undefined,
    showSeriesLabels: true,
    missingImageIds: undefined as ReadonlySet<string> | undefined,
    onClick: onClick as typeof onClick | undefined,
    onDoubleClick: onDoubleClick as typeof onDoubleClick | undefined,
    findAtScreenPoint,
    onHoveredRecord: vi.fn(),
  };
  const view = renderHook(useFootprintLayer, { initialProps: props });
  const dispatch = (
    type: string,
    x = 90,
    y = 70,
    target: HTMLElement = canvas,
    button = 0,
    detail = 0,
    pointerType?: string,
    buttons = 0
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      detail,
      clientX: x,
      clientY: y,
      button,
      buttons,
    });
    if (pointerType)
      Object.defineProperty(event, "pointerType", { value: pointerType });
    target.dispatchEvent(event);
    return event;
  };
  return {
    ...view,
    props,
    container,
    canvas,
    control,
    dispatch,
    onClick,
    onDoubleClick,
    hostQuery,
    listeners,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const advance = async (duration: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(duration);
  });
};
describe("footprint appearance", () => {
  it("locks interaction without hiding the contour until the preview outline is ready", async () => {
    const view = setup();
    expect(footprint.setLocked).toHaveBeenLastCalledWith(false, undefined);
    const visibilityCalls = footprint.setLocked.mock.calls.length;
    view.rerender({ ...view.props, locked: true, hidden: false });
    expect(footprint.setLocked).toHaveBeenCalledTimes(visibilityCalls);
    expect(footprint.setLocked).toHaveBeenLastCalledWith(false, undefined);
    expect(footprint.locked).toBe(false);
    view.dispatch("click");
    expect(view.onClick).not.toHaveBeenCalled();
    view.rerender({ ...view.props, locked: true, hidden: true });
    expect(footprint.setLocked).toHaveBeenLastCalledWith(true, undefined);
    expect(footprint.locked).toBe(true);
    view.dispatch("click");
    expect(view.onClick).not.toHaveBeenCalled();
    view.rerender({ ...view.props, locked: true, hidden: false });
    expect(footprint.setLocked).toHaveBeenLastCalledWith(false, undefined);
    view.dispatch("click");
    expect(view.onClick).not.toHaveBeenCalled();
    view.rerender({ ...view.props, locked: false, hidden: false });
    view.dispatch("click");
    await advance(500);
    expect(view.onClick).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("uses a two CSS pixel outline and updates labels without recreating the layer", () => {
    const view = setup();
    expect(footprint.setStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 2 })
    );
    expect(footprint.setLabelsVisible).toHaveBeenLastCalledWith(true);
    view.rerender({ ...view.props, showSeriesLabels: false });
    expect(footprint.setLabelsVisible).toHaveBeenLastCalledWith(false);
    expect(footprint.destroy).not.toHaveBeenCalled();
    view.rerender(view.props);
    expect(footprint.setLabelsVisible).toHaveBeenLastCalledWith(true);
    view.unmount();
  });
});

describe("footprint click activation", () => {
  it("leaves classic pointer input to the host when footprint callbacks are absent", async () => {
    const view = setup();
    try {
      view.rerender({
        ...view.props,
        onClick: undefined,
        onDoubleClick: undefined,
      });
      footprint.setHoveredImage.mockClear();
      view.dispatch("pointermove");
      view.dispatch("click");
      view.dispatch("dblclick");
      await advance(500);
      expect(view.hostQuery).toHaveBeenCalledOnce();
      expect(view.onClick).not.toHaveBeenCalled();
      expect(view.onDoubleClick).not.toHaveBeenCalled();
      expect(footprint.setHoveredImage).not.toHaveBeenCalled();
      expect(view.canvas.style.cursor).toBe("grab");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      view.unmount();
    }
  });

  it("claims the interior click immediately and opens the image only after the 500 ms window", async () => {
    const view = setup();
    view.dispatch("click");
    expect(footprint.containsScreenPoint).toHaveBeenCalledWith({
      x: 50,
      y: 50,
    });
    expect(view.onClick).not.toHaveBeenCalled();
    expect(view.hostQuery).not.toHaveBeenCalled();
    await advance(499);
    expect(view.onClick).not.toHaveBeenCalled();
    await advance(1);
    expect(view.onClick).toHaveBeenCalledOnce();
    expect(footprint.setLocked).toHaveBeenLastCalledWith(false, undefined);
    view.rerender({ ...view.props, locked: true });
    expect(view.hostQuery).not.toHaveBeenCalled();
    view.dispatch("click");
    expect(view.onClick).toHaveBeenCalledOnce();
    view.dispatch("click", 190, 70);
    expect(view.onClick).toHaveBeenCalledOnce();
    expect(view.hostQuery).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("keeps the picked image across callback rerenders and chooses only the double-click action", async () => {
    const view = setup();
    const centered = vi.fn();
    const preview = document.createElement("div");
    const dismissPreview = vi.fn();
    preview.addEventListener("click", dismissPreview);
    view.canvas.parentElement!.append(preview);
    try {
      view.dispatch("click");
      await advance(250);
      view.rerender({
        ...view.props,
        selectedImageId: "2026:updated",
        onDoubleClick: centered,
      });
      const second = view.dispatch("click", 90, 70, preview, 0, 2);
      expect(second.defaultPrevented).toBe(true);
      expect(dismissPreview).not.toHaveBeenCalled();
      const double = view.dispatch("dblclick", 90, 70, preview);
      expect(double.defaultPrevented).toBe(true);
      expect(centered).toHaveBeenCalledOnce();
      expect(centered).toHaveBeenCalledWith("2024:image");
      expect(view.onClick).not.toHaveBeenCalled();
      await advance(1000);
      expect(view.onClick).not.toHaveBeenCalled();
      view.dispatch("dblclick", 90, 70, preview);
      expect(centered).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });

  it("ignores unrelated, expired, control and disabled-viewer double clicks", async () => {
    const view = setup();
    const controlClick = vi.fn();
    view.control.addEventListener("click", controlClick);
    try {
      view.dispatch("dblclick");
      view.dispatch("click");
      view.dispatch("dblclick", 90, 70, view.canvas, 2);
      view.dispatch("dblclick", 120, 70);
      const secondOnControl = view.dispatch(
        "click",
        90,
        70,
        view.control,
        0,
        2
      );
      expect(secondOnControl.defaultPrevented).toBe(false);
      expect(controlClick).toHaveBeenCalledOnce();
      view.dispatch("dblclick", 90, 70, view.control);
      await advance(501);
      view.dispatch("dblclick");
      view.rerender({ ...view.props, enabled: false });
      view.dispatch("dblclick");
      view.rerender(view.props);
      view.dispatch("dblclick");
      expect(view.onDoubleClick).not.toHaveBeenCalled();
      expect(view.onClick).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
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

  it("uses the current callback and disables activation during locks, empty selection and viewer shutdown", async () => {
    const view = setup();
    const next = vi.fn();
    view.rerender({ ...view.props, onClick: next });
    view.dispatch("click");
    await advance(500);
    expect(next).toHaveBeenCalledOnce();
    expect(view.onClick).not.toHaveBeenCalled();
    view.rerender({ ...view.props, locked: true });
    view.dispatch("click");
    view.rerender({ ...view.props, selectedImageId: "" });
    view.dispatch("click");
    view.rerender({ ...view.props, enabled: false });
    view.dispatch("click");
    await advance(1000);
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

describe("native mousemove coordination", () => {
  it("skips an unused native terrain pick while the separate pointer-hover query remains active", async () => {
    vi.useFakeTimers();
    const record = {
      id: "2026:pointer",
      footprint: [[7, 51]],
    } as ObliqueImageRecord;
    const find = vi.fn(async () => record);
    const view = setup(find);
    const nativeMove = vi.fn();
    view.container.addEventListener("mousemove", nativeMove);
    try {
      const event = view.dispatch("mousemove");
      expect(nativeMove).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      view.dispatch("pointermove", 200, 70);
      await vi.advanceTimersByTimeAsync(50);
      expect(find).toHaveBeenCalledWith({ x: 160, y: 50 });
      expect(view.canvas.style.cursor).toBe("pointer");
      view.unmount();
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledOnce();
    } finally {
      view.container.removeEventListener("mousemove", nativeMove);
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("preserves registered mousemove listeners, pressed buttons, drag and camera movement", () => {
    const view = setup(vi.fn(async () => null));
    const nativeMove = vi.fn();
    view.container.addEventListener("mousemove", nativeMove);
    try {
      vi.mocked(view.props.map.listens).mockReturnValue(true);
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(1);
      vi.mocked(view.props.map.listens).mockReturnValue(false);
      view.dispatch("mousemove", 90, 70, view.canvas, 0, 0, undefined, 1);
      expect(nativeMove).toHaveBeenCalledTimes(2);
      view.dispatch("pointerdown");
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(3);
      view.dispatch("pointercancel");
      vi.mocked(view.props.map.isMoving).mockReturnValue(true);
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(4);
      vi.mocked(view.props.map.isMoving).mockReturnValue(false);
      view.dispatch("mousemove", 90, 70, view.control);
      expect(nativeMove).toHaveBeenCalledTimes(5);
    } finally {
      view.container.removeEventListener("mousemove", nativeMove);
      view.unmount();
    }
  });

  it("keeps unused terrain hover suppressed during preview and resumes suppression after a window pointer release", () => {
    const find = vi.fn(async () => null);
    const view = setup(find);
    const nativeMove = vi.fn();
    view.container.addEventListener("mousemove", nativeMove);
    try {
      view.rerender({ ...view.props, locked: true });
      view.dispatch("mousemove");
      expect(nativeMove).not.toHaveBeenCalled();
      view.dispatch("pointermove");
      expect(find).not.toHaveBeenCalled();
      view.dispatch("pointerdown");
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new MouseEvent("pointerup"));
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(1);
      view.dispatch("pointerdown");
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new MouseEvent("pointercancel"));
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(2);
    } finally {
      view.container.removeEventListener("mousemove", nativeMove);
      view.unmount();
    }
  });

  it("keeps one native-hover effect across preview locks and removes its window listeners on disable and unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const view = setup(vi.fn(async () => null));
    const nativeMove = vi.fn();
    view.container.addEventListener("mousemove", nativeMove);
    const releaseHandlers = () =>
      add.mock.calls.filter(
        ([type, , capture]) =>
          (type === "pointerup" || type === "pointercancel") && capture === true
      );
    try {
      expect(releaseHandlers()).toHaveLength(2);
      view.rerender({ ...view.props, locked: true });
      expect(releaseHandlers()).toHaveLength(2);
      view.rerender({ ...view.props, enabled: false, locked: true });
      for (const [type, handler] of releaseHandlers())
        expect(remove).toHaveBeenCalledWith(type, handler, true);
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(1);
      view.rerender({ ...view.props, locked: true });
      expect(releaseHandlers()).toHaveLength(4);
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(1);
      view.unmount();
      for (const [type, handler] of releaseHandlers())
        expect(remove).toHaveBeenCalledWith(type, handler, true);
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledTimes(2);
    } finally {
      view.container.removeEventListener("mousemove", nativeMove);
      view.unmount();
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it("does not suppress native mousemove without catalog hover", () => {
    const view = setup();
    const nativeMove = vi.fn();
    view.container.addEventListener("mousemove", nativeMove);
    try {
      view.dispatch("mousemove");
      expect(nativeMove).toHaveBeenCalledOnce();
    } finally {
      view.container.removeEventListener("mousemove", nativeMove);
      view.unmount();
    }
  });
});

describe("catalog footprint hover activation", () => {
  it("preserves a pending catalog pick for a double click even after the click window expires", async () => {
    let resolve: (record: ObliqueImageRecord) => void = () => {};
    const find = vi.fn(
      () =>
        new Promise<ObliqueImageRecord>((done) => {
          resolve = done;
        })
    );
    const view = setup(find);
    try {
      view.dispatch("click", 220, 100);
      expect(find).toHaveBeenCalledOnce();
      await advance(250);
      view.dispatch("pointerdown", 220, 100, view.canvas, 0, 0, "touch");
      const second = view.dispatch("click", 220, 100, view.canvas, 0, 2);
      const double = view.dispatch("dblclick", 220, 100);
      expect(second.defaultPrevented).toBe(true);
      expect(double.defaultPrevented).toBe(true);
      await advance(1000);
      expect(view.onClick).not.toHaveBeenCalled();
      expect(view.onDoubleClick).not.toHaveBeenCalled();
      expect(find).toHaveBeenCalledOnce();
      await act(async () => {
        resolve({ id: "2026:slow-double" } as ObliqueImageRecord);
      });
      expect(view.onDoubleClick).toHaveBeenCalledOnce();
      expect(view.onDoubleClick).toHaveBeenCalledWith("2026:slow-double");
      await advance(500);
      expect(view.onClick).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  it("opens a slow single pick as soon as it resolves after the original deadline", async () => {
    let resolve: (record: ObliqueImageRecord) => void = () => {};
    const find = vi.fn(
      () =>
        new Promise<ObliqueImageRecord>((done) => {
          resolve = done;
        })
    );
    const view = setup(find);
    try {
      view.dispatch("click", 220, 100);
      await advance(600);
      expect(view.onClick).not.toHaveBeenCalled();
      await act(async () => {
        resolve({ id: "2026:slow-single" } as ObliqueImageRecord);
      });
      expect(view.onClick).toHaveBeenCalledOnce();
      expect(view.onClick).toHaveBeenCalledWith("2026:slow-single");
      expect(view.onDoubleClick).not.toHaveBeenCalled();
      await advance(500);
      expect(view.onClick).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });

  it.each(["move", "lock", "disable", "unmount", "pointercancel"])(
    "cancels both the click deadline and a late catalog pick on %s",
    async (reason) => {
      let resolve: (record: ObliqueImageRecord) => void = () => {};
      const view = setup(
        () =>
          new Promise<ObliqueImageRecord>((done) => {
            resolve = done;
          })
      );
      try {
        view.dispatch("click", 220, 100);
        await advance(250);
        act(() => {
          if (reason === "move") view.listeners.get("move")?.();
          else if (reason === "lock")
            view.rerender({ ...view.props, locked: true });
          else if (reason === "disable")
            view.rerender({ ...view.props, enabled: false });
          else if (reason === "pointercancel") view.dispatch("pointercancel");
          else view.unmount();
        });
        expect(vi.getTimerCount()).toBe(0);
        await advance(750);
        await act(async () => {
          resolve({ id: "2026:cancelled" } as ObliqueImageRecord);
        });
        expect(view.onClick).not.toHaveBeenCalled();
        expect(view.onDoubleClick).not.toHaveBeenCalled();
      } finally {
        view.unmount();
      }
    }
  );

  it("picks immediately without a previous hover and waits from the original click", async () => {
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
      expect(view.onClick).not.toHaveBeenCalled();
      await advance(499);
      expect(view.onClick).not.toHaveBeenCalled();
      await advance(1);
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
    await advance(500);
    expect(view.onClick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps the center highlight suppressed while a pointer query is pending or misses", async () => {
    vi.useFakeTimers();
    let resolve: (record: ObliqueImageRecord | null) => void = () => {};
    const find = vi.fn(
      () =>
        new Promise<ObliqueImageRecord | null>((done) => {
          resolve = done;
        })
    );
    const view = setup(find);
    try {
      view.dispatch("pointermove", 200, 70);
      expect(footprint.setHoveredImage).toHaveBeenLastCalledWith(
        null,
        undefined,
        true
      );
      await vi.advanceTimersByTimeAsync(50);
      expect(find).toHaveBeenCalledWith({ x: 160, y: 50 });
      await act(async () => {
        resolve(null);
      });
      expect(footprint.setHoveredImage).toHaveBeenLastCalledWith(
        null,
        undefined,
        true
      );
      expect(view.canvas.style.cursor).toBe("grab");
      view.dispatch("pointercancel");
      expect(footprint.setHoveredImage).toHaveBeenLastCalledWith(
        null,
        undefined,
        false
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it.each(["pointerdown", "pointermove"])(
    "restores the center highlight on touch %s without starting another hover query",
    async (eventType) => {
      vi.useFakeTimers();
      const record = {
        id: "2026:touch",
        seriesId: "2026",
        footprint: [
          [7, 51],
          [7.01, 51],
          [7.01, 50.99],
          [7, 50.99],
          [7, 51],
        ],
      } as ObliqueImageRecord;
      const find = vi.fn(async () => record);
      const view = setup(find);
      try {
        view.dispatch("pointermove", 200, 70);
        await vi.advanceTimersByTimeAsync(50);
        expect(view.canvas.style.cursor).toBe("pointer");
        find.mockClear();
        view.dispatch(eventType, 220, 70, view.canvas, 0, 0, "touch");
        expect(footprint.setHoveredImage).toHaveBeenLastCalledWith(
          null,
          undefined,
          false
        );
        expect(view.props.onHoveredRecord).toHaveBeenLastCalledWith(null);
        expect(view.canvas.style.cursor).toBe("grab");
        await vi.advanceTimersByTimeAsync(50);
        expect(find).not.toHaveBeenCalled();
      } finally {
        view.unmount();
        vi.useRealTimers();
      }
    }
  );

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
      expect(view.onClick).not.toHaveBeenCalled();
      await advance(500);
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

describe("missing photo labels", () => {
  it("updates only the label status for a preview-locked selected photo even with year labels hidden", () => {
    const view = setup();
    const rings = footprint.setRing.mock.calls.length;
    const missing = new Set(["2024:image"]);
    view.rerender({
      ...view.props,
      locked: true,
      hidden: true,
      showSeriesLabels: false,
      missingImageIds: missing,
    });
    expect(footprint.setMissingImages).toHaveBeenLastCalledWith(missing);
    expect(footprint.setLabelsVisible).toHaveBeenLastCalledWith(false);
    expect(footprint.setRing).toHaveBeenCalledTimes(rings);
    expect(footprint.destroy).not.toHaveBeenCalled();
    expect(footprint.setLocked).toHaveBeenLastCalledWith(false, undefined);
    view.unmount();
  });
  it("does not block a known missing footprint from activating its existing click callback", async () => {
    const view = setup();
    view.rerender({ ...view.props, missingImageIds: new Set(["2024:image"]) });
    act(() => view.dispatch("click"));
    await advance(500);
    expect(view.onClick).toHaveBeenCalledWith("2024:image");
    view.unmount();
  });
});
