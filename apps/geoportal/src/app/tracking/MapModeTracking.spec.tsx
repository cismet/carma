import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const libre3dMock = vi.hoisted(() => ({ value: false }));

vi.mock("react-redux", () => ({
  useSelector: () => libre3dMock.value,
}));

vi.mock("../store/slices/ui", () => ({
  getLibre3d: () => libre3dMock.value,
}));

import { MapModeTracking } from "./MapModeTracking";
import { MapModeAction, TrackingCategory } from "./taxonomy";
import { setTrackEventDelegate } from "./tracker";

describe("MapModeTracking", () => {
  const trackEventSpy = vi.fn();

  beforeEach(() => {
    trackEventSpy.mockReset();
    libre3dMock.value = false;
    setTrackEventDelegate(trackEventSpy);
  });

  it("does not track the mode the visit starts in", () => {
    libre3dMock.value = true;
    render(<MapModeTracking />);

    expect(trackEventSpy).not.toHaveBeenCalled();
  });

  it("tracks a switch into and back out of the maplibre 3D view", () => {
    const { rerender } = render(<MapModeTracking />);

    libre3dMock.value = true;
    rerender(<MapModeTracking />);

    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.MAP_MODE,
      MapModeAction.TO_3D_LIBRE,
      undefined,
      undefined
    );

    libre3dMock.value = false;
    rerender(<MapModeTracking />);

    expect(trackEventSpy).toHaveBeenLastCalledWith(
      TrackingCategory.MAP_MODE,
      MapModeAction.TO_2D,
      undefined,
      undefined
    );
    expect(trackEventSpy).toHaveBeenCalledTimes(2);
  });

  it("does not re-track a rerender that keeps the same mode", () => {
    libre3dMock.value = true;
    const { rerender } = render(<MapModeTracking />);
    rerender(<MapModeTracking />);
    rerender(<MapModeTracking />);

    expect(trackEventSpy).not.toHaveBeenCalled();
  });
});
