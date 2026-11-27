import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;

const setup = async () => {
  vi.resetModules();
  const handlers: Record<string, Handler> = {};
  class FakeElement {
    isConnected = true;
    dispatchEvent = vi.fn();
  }
  class FakeMouseEvent {
    constructor(public type: string, public init: Record<string, unknown>) {}
  }
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("MouseEvent", FakeMouseEvent);
  vi.stubGlobal("window", {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
  });
  const { rescueJitteryTaps } = await import("./rescue-jittery-taps");
  rescueJitteryTaps();
  rescueJitteryTaps(); // idempotent

  const target = new FakeElement();
  const at = (x: number, y: number) => [{ clientX: x, clientY: y }];
  const tap = (
    moves: Array<[number, number, boolean]>,
    endPrevented = false
  ) => {
    handlers.touchstart({ target, touches: at(0, 0) });
    for (const [x, y, prevented] of moves) {
      handlers.touchmove({ touches: at(x, y), defaultPrevented: prevented });
    }
    const [x, y] = moves.at(-1) ?? [0, 0];
    handlers.touchend({
      touches: [],
      changedTouches: at(x, y),
      defaultPrevented: endPrevented,
    });
  };
  const nativeClick = () => {
    const e = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    handlers.click(e);
    return e.stopPropagation;
  };
  return { tap, nativeClick, dispatch: target.dispatchEvent };
};

describe("rescueJitteryTaps", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("clicks the touched element for a jittery tap whose touchmove was cancelled", async () => {
    const { tap, nativeClick, dispatch } = await setup();
    tap([[3, 2, true]]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: "click",
      init: { clientX: 3, clientY: 2, bubbles: true },
    });
    // a native click that still arrives for the same tap is swallowed once
    expect(nativeClick()).toHaveBeenCalled();
    expect(nativeClick()).not.toHaveBeenCalled();
  });

  it("leaves still taps, real drags and cancelled touchends alone", async () => {
    const { tap, nativeClick, dispatch } = await setup();
    tap([]);
    tap([[2, 1, false]]);
    tap([
      [5, 0, true],
      [40, 0, true],
    ]);
    tap([[3, 2, true]], true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(nativeClick()).not.toHaveBeenCalled();
  });
});
