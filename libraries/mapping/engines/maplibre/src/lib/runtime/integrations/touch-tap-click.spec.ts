import { describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";

vi.mock("maplibre-gl", () => ({
  MapMouseEvent: class {
    constructor(
      public type: string,
      _map: unknown,
      public originalEvent: { clientX: number; clientY: number }
    ) {}
  },
}));

import { installTouchTapClick } from "./touch-tap-click";

type Handler = (e: unknown) => void;

const setup = () => {
  const canvas = {};
  const handlers: Record<string, Handler> = {};
  const container = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    removeEventListener: vi.fn(),
  };
  const fire = vi.fn();
  const map = {
    getCanvasContainer: () => container,
    getCanvas: () => canvas,
    fire,
    once: vi.fn(),
  };
  installTouchTapClick(map as unknown as maplibregl.Map);

  const at = (x: number, y: number) => [{ clientX: x, clientY: y }];
  const tap = (moves: Array<[number, number, boolean]>) => {
    handlers.touchstart({ target: canvas, touches: at(0, 0) });
    for (const [x, y, prevented] of moves) {
      handlers.touchmove({ touches: at(x, y), defaultPrevented: prevented });
    }
    const [x, y] = moves.at(-1) ?? [0, 0];
    handlers.touchend({ touches: [], changedTouches: at(x, y) });
  };
  const nativeClick = () => {
    const e = { stopPropagation: vi.fn() };
    handlers.click(e);
    return e.stopPropagation;
  };
  return { tap, nativeClick, fire };
};

describe("installTouchTapClick", () => {
  it("fires a map click for a jittery tap whose touchmove MapLibre cancelled", () => {
    const { tap, nativeClick, fire } = setup();
    tap([[3, 2, true]]);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls[0][0]).toMatchObject({
      type: "click",
      originalEvent: { clientX: 3, clientY: 2 },
    });
    // a native click that still arrives for the same tap is swallowed once
    expect(nativeClick()).toHaveBeenCalled();
    expect(nativeClick()).not.toHaveBeenCalled();
  });

  it("leaves still taps and real pans to MapLibre", () => {
    const { tap, nativeClick, fire } = setup();
    tap([]);
    tap([[2, 1, false]]);
    tap([
      [5, 0, true],
      [40, 0, true],
    ]);
    expect(fire).not.toHaveBeenCalled();
    expect(nativeClick()).not.toHaveBeenCalled();
  });
});
