import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReloadOnCesiumRenderError } from "./useReloadOnCesiumRenderError";
import { carmaWindow } from "@carma-commons/utils";

describe("useReloadOnCesiumRenderError", () => {
  it("reloads window by default when event is dispatched", () => {
    const reloadSpy = vi
      .spyOn(carmaWindow.location, "reload")
      .mockImplementation(() => {});
    renderHook(() => useReloadOnCesiumRenderError());
    window.dispatchEvent(new CustomEvent("carma:cesium:renderError"));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("calls provided onReload callback instead of reloading", () => {
    const onReloadRequested = vi.fn();
    renderHook(() => useReloadOnCesiumRenderError({ onReloadRequested }));
    window.dispatchEvent(new CustomEvent("carma:cesium:renderError"));
    expect(onReloadRequested).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    const onReloadRequested = vi.fn();
    const reloadSpy = vi
      .spyOn(carmaWindow.location, "reload")
      .mockImplementation(() => {});
    renderHook(() =>
      useReloadOnCesiumRenderError({ enabled: false, onReloadRequested })
    );
    window.dispatchEvent(new CustomEvent("carma:cesium:renderError"));
    expect(onReloadRequested).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
