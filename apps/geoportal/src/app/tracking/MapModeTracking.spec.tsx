import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useObliqueMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

vi.mock("../oblique/hooks/useOblique", () => ({
  useOblique: () => useObliqueMock(),
}));

import { MapModeTracking } from "./MapModeTracking";
import { MapModeAction, TrackingCategory } from "./taxonomy";
import { setTrackEventDelegate } from "./tracker";

describe("MapModeTracking", () => {
  const trackEventSpy = vi.fn();

  const setMode = ({
    isCesium = false,
    isObliqueMode = false,
  }: {
    isCesium?: boolean;
    isObliqueMode?: boolean;
  }) => {
    useMapFrameworkSwitcherContextMock.mockReturnValue({ isCesium });
    useObliqueMock.mockReturnValue({ isObliqueMode });
  };

  beforeEach(() => {
    trackEventSpy.mockReset();
    useMapFrameworkSwitcherContextMock.mockReset();
    useObliqueMock.mockReset();
    setTrackEventDelegate(trackEventSpy);
  });

  it("does not track the mode the visit starts in", () => {
    setMode({ isCesium: true, isObliqueMode: true });
    render(<MapModeTracking />);

    expect(trackEventSpy).not.toHaveBeenCalled();
  });

  it("tracks a switch into and back out of 3D", () => {
    setMode({ isCesium: false });
    const { rerender } = render(<MapModeTracking />);

    setMode({ isCesium: true });
    rerender(<MapModeTracking />);

    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.MAP_MODE,
      MapModeAction.TO_3D,
      undefined,
      undefined
    );

    setMode({ isCesium: false });
    rerender(<MapModeTracking />);

    expect(trackEventSpy).toHaveBeenLastCalledWith(
      TrackingCategory.MAP_MODE,
      MapModeAction.TO_2D,
      undefined,
      undefined
    );
    expect(trackEventSpy).toHaveBeenCalledTimes(2);
  });

  it("tracks the oblique mode toggle", () => {
    setMode({ isObliqueMode: false });
    const { rerender } = render(<MapModeTracking />);

    setMode({ isObliqueMode: true });
    rerender(<MapModeTracking />);

    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.MAP_MODE,
      MapModeAction.OBLIQUE_ON,
      undefined,
      undefined
    );

    setMode({ isObliqueMode: false });
    rerender(<MapModeTracking />);

    expect(trackEventSpy).toHaveBeenLastCalledWith(
      TrackingCategory.MAP_MODE,
      MapModeAction.OBLIQUE_OFF,
      undefined,
      undefined
    );
  });

  it("does not re-track a rerender that keeps the same mode", () => {
    setMode({ isCesium: true });
    const { rerender } = render(<MapModeTracking />);
    rerender(<MapModeTracking />);
    rerender(<MapModeTracking />);

    expect(trackEventSpy).not.toHaveBeenCalled();
  });
});
