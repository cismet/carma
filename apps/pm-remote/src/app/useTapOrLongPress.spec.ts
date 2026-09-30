// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { MouseEvent, PointerEvent } from "react";

import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  useTapOrLongPress,
} from "./useTapOrLongPress";

const pointer = (
  x: number,
  y: number,
  pointerType = "touch"
): PointerEvent => ({ clientX: x, clientY: y, pointerType } as PointerEvent);

describe("useTapOrLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const render = () => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() =>
      useTapOrLongPress(onTap, onLongPress)
    );
    return { press: () => result.current, onTap, onLongPress, unmount };
  };

  it("fires the long press after the finger rests long enough", () => {
    const { press, onLongPress, onTap } = render();
    act(() => press().onPointerDown(pointer(10, 10)));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // the click when the finger lifts is swallowed
    act(() => press().onClick());
    expect(onTap).not.toHaveBeenCalled();
  });

  it("survives the cancel and leave iPhone Safari sends with the finger still down", () => {
    const { press, onLongPress } = render();
    act(() => press().onPointerDown(pointer(10, 10)));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 50));
    act(() => press().onPointerLeave(pointer(10, 10)));
    act(() => vi.advanceTimersByTime(50));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("is a tap when the finger lifts early", () => {
    const { press, onLongPress, onTap } = render();
    act(() => press().onPointerDown(pointer(10, 10)));
    act(() => press().onPointerUp());
    act(() => press().onClick());
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("gives up when the finger moves", () => {
    const { press, onLongPress } = render();
    act(() => press().onPointerDown(pointer(10, 10)));
    act(() =>
      press().onPointerMove(pointer(10, 10 + LONG_PRESS_MOVE_TOLERANCE_PX / 2))
    );
    act(() =>
      press().onPointerMove(pointer(10, 10 + LONG_PRESS_MOVE_TOLERANCE_PX * 2))
    );
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("gives up when the page scrolls", () => {
    const { press, onLongPress } = render();
    act(() => press().onPointerDown(pointer(10, 10)));
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("gives up when a mouse leaves", () => {
    const { press, onLongPress } = render();
    act(() => press().onPointerDown(pointer(10, 10, "mouse")));
    act(() => press().onPointerLeave(pointer(500, 10, "mouse")));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("keeps the phone's own menu shut", () => {
    const { press } = render();
    const preventDefault = vi.fn();
    press().onContextMenu({ preventDefault } as unknown as MouseEvent);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("stops the clock when the element goes away", () => {
    const { press, onLongPress, unmount } = render();
    act(() => press().onPointerDown(pointer(10, 10)));
    unmount();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
