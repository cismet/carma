// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HASH_LAUNCH_MODE } from "@carma-commons/utils";

const frameworkSwitcherMock = vi.hoisted(() => ({
  setActiveFrameworkCesium: vi.fn(),
  setActiveFrameworkLeaflet: vi.fn(),
}));

const hashStateMock = vi.hoisted(() => ({
  updateHashState: vi.fn(),
}));

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => frameworkSwitcherMock,
}));

vi.mock("@carma-providers/hash-state", () => ({
  useHashState: () => hashStateMock,
}));

import { useHashLaunchMode } from "./useHashLaunchMode";

const setHash = (query: string) => {
  window.history.replaceState(
    {},
    "",
    `#/geoportal${query ? `?${query}` : ""}`
  );
};

describe("useHashLaunchMode", () => {
  beforeEach(() => {
    frameworkSwitcherMock.setActiveFrameworkCesium.mockReset();
    frameworkSwitcherMock.setActiveFrameworkLeaflet.mockReset();
    hashStateMock.updateHashState.mockReset();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "#/geoportal");
  });

  it("starts Cesium from 3d scene hash params without writing launch flags", async () => {
    setHash("lat=51&lng=7&h=190&p=45&b=60");

    renderHook(() => useHashLaunchMode());

    await waitFor(() => {
      expect(frameworkSwitcherMock.setActiveFrameworkCesium).toHaveBeenCalled();
    });

    expect(
      frameworkSwitcherMock.setActiveFrameworkLeaflet
    ).not.toHaveBeenCalled();
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();
  });

  it("clears explicit launch flags after consuming them", async () => {
    setHash("lat=51&lng=7&3d=1");

    renderHook(() => useHashLaunchMode());

    await waitFor(() => {
      expect(frameworkSwitcherMock.setActiveFrameworkCesium).toHaveBeenCalled();
    });

    expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
      {
        "2d": undefined,
        "3d": undefined,
        is2d: undefined,
        is3d: undefined,
      },
      {
        label: "hash-launch-mode:clear",
        replace: true,
      }
    );
  });

  it("uses the configured default mode without writing when no launch flag exists", async () => {
    setHash("");

    renderHook(() =>
      useHashLaunchMode({ defaultMode: HASH_LAUNCH_MODE.THREE_D })
    );

    await waitFor(() => {
      expect(frameworkSwitcherMock.setActiveFrameworkCesium).toHaveBeenCalled();
    });

    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();
  });
});
