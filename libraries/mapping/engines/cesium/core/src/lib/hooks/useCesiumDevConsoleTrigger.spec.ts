import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCesiumDevConsoleTrigger } from "./useCesiumDevConsoleTrigger";

describe("useCesiumDevConsoleTrigger", () => {
  beforeEach(() => {
    // Reset any prior trigger
    delete (window as unknown as { CARMA_CESIUM_TRIGGER?: unknown })
      .CARMA_CESIUM_TRIGGER;
  });

  it("does not register when developer mode is off", () => {
    renderHook(() => useCesiumDevConsoleTrigger({ isDeveloperMode: false }));
    expect(
      (
        window as unknown as {
          CARMA_CESIUM_TRIGGER?: { renderError?: () => void };
        }
      ).CARMA_CESIUM_TRIGGER?.renderError
    ).toBeUndefined();
  });

  it("registers renderError when developer mode is on and dispatches event", () => {
    const handler = vi.fn();
    window.addEventListener("carma:cesium:renderError", handler);

    renderHook(() => useCesiumDevConsoleTrigger({ isDeveloperMode: true }));
    expect(
      typeof (
        window as unknown as {
          CARMA_CESIUM_TRIGGER: { renderError: () => void };
        }
      ).CARMA_CESIUM_TRIGGER.renderError
    ).toBe("function");

    (
      window as unknown as { CARMA_CESIUM_TRIGGER: { renderError: () => void } }
    ).CARMA_CESIUM_TRIGGER.renderError();
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener("carma:cesium:renderError", handler);
  });
});
