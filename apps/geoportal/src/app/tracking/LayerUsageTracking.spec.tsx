import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stack = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("react-redux", () => ({
  useSelector: () => stack.current,
}));

vi.mock("../store/slices/mapping", () => ({
  getLayerStack: () => stack.current,
}));

vi.mock("@carma-mapping/layers", () => ({
  isLayerGroup: (entry: { type?: string }) => entry?.type === "group",
}));

import { LayerUsageTracking } from "./LayerUsageTracking";
import { resetDailyLayerUsage } from "./dailyLayerUsage";
import { LayerAction, TrackingCategory } from "./taxonomy";
import { setTrackEventDelegate } from "./tracker";

describe("LayerUsageTracking", () => {
  const trackEventSpy = vi.fn();

  beforeEach(() => {
    trackEventSpy.mockReset();
    window.localStorage.clear();
    resetDailyLayerUsage();
    setTrackEventDelegate(trackEventSpy);
    stack.current = [];
  });

  it("counts the layers restored at start up", () => {
    stack.current = [
      { id: "poi_awg", title: "AWG" },
      { id: "baum", title: "Kronenumringe" },
    ];
    render(<LayerUsageTracking />);

    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.LAYER,
      LayerAction.USED,
      "AWG (poi_awg)",
      undefined,
    );
    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.LAYER,
      LayerAction.USED,
      "Kronenumringe (baum)",
      undefined,
    );
    expect(trackEventSpy).toHaveBeenCalledTimes(2);
  });

  it("counts a layer only once, however often the app is opened", () => {
    stack.current = [{ id: "poi_awg", title: "AWG" }];
    const first = render(<LayerUsageTracking />);
    expect(trackEventSpy).toHaveBeenCalledTimes(1);

    // same day, app opened again
    first.unmount();
    render(<LayerUsageTracking />);

    expect(trackEventSpy).toHaveBeenCalledTimes(1);
  });

  it("counts the members of a group, not the group itself", () => {
    stack.current = [
      {
        id: "fz_hitze",
        title: "Hitze",
        type: "group",
        layers: [{ id: "kronen", title: "Kronenumringe" }],
      },
    ];
    render(<LayerUsageTracking />);

    // the group itself is not reported, only what is inside it
    expect(trackEventSpy).toHaveBeenCalledTimes(1);
    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.LAYER,
      LayerAction.USED,
      "Kronenumringe (kronen)",
      undefined,
    );
  });

  it("ignores the layer bar's mode rows", () => {
    stack.current = [
      { id: "__measurement", title: "Messung" },
      { id: "real", title: "Echter Layer" },
    ];
    render(<LayerUsageTracking />);

    expect(trackEventSpy).toHaveBeenCalledTimes(1);
    expect(trackEventSpy).toHaveBeenCalledWith(
      TrackingCategory.LAYER,
      LayerAction.USED,
      "Echter Layer (real)",
      undefined,
    );
  });

  it("counts a layer added later in the same session only once", () => {
    stack.current = [{ id: "a", title: "A" }];
    const { rerender } = render(<LayerUsageTracking />);

    stack.current = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    rerender(<LayerUsageTracking />);

    expect(trackEventSpy).toHaveBeenCalledTimes(2);

    stack.current = [{ id: "a", title: "A" }];
    rerender(<LayerUsageTracking />);
    stack.current = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    rerender(<LayerUsageTracking />);

    expect(trackEventSpy).toHaveBeenCalledTimes(2);
  });
});
