import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PointMarkerOverlayShell } from "./point-marker-visualizer";

describe("PointMarkerOverlayShell", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires longpress on the marker without forwarding the following click", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onLongPress = vi.fn();

    const { container } = render(
      <PointMarkerOverlayShell
        interactive
        onClick={onClick}
        onLongPress={onLongPress}
        longPressDurationMs={320}
      />
    );

    const marker = container.querySelector(
      '[data-runtime-point-marker-circle="true"]'
    );

    expect(marker).toBeInstanceOf(HTMLElement);

    fireEvent.mouseDown(marker!, { button: 0 });
    vi.advanceTimersByTime(320);
    fireEvent.mouseUp(marker!);
    fireEvent.click(marker!);

    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps marker hover interactive without click or longpress handlers", () => {
    const onHoverChange = vi.fn();

    const { container } = render(
      <PointMarkerOverlayShell
        interactive
        onHoverChange={onHoverChange}
        longPressDurationMs={320}
      />
    );

    const marker = container.querySelector(
      '[data-runtime-point-marker-circle="true"]'
    );

    expect(marker).toBeInstanceOf(HTMLElement);

    fireEvent.mouseEnter(marker!);
    fireEvent.mouseLeave(marker!);

    expect(onHoverChange).toHaveBeenNthCalledWith(1, true);
    expect(onHoverChange).toHaveBeenNthCalledWith(2, false);
  });
});
