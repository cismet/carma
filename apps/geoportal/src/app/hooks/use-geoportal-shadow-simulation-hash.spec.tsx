import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import { HASH_LAUNCH_MODE } from "@carma-commons/utils";
import { CARMA_MAP_FRAMEWORKS } from "@carma-mapping/components";

import type { GeoportalCustomHashState } from "../helper/geoportal-custom-hash-state";

type ShadowStateFixture = {
  enabled: boolean;
  selection: { year: number; dayOfYear: number; minutes: number };
  terrainColor: string;
  buildingsFullOpacity: boolean;
  buildingColorMix: number;
  buildingColor: string;
  shadowQuality: 4 | 16 | 64;
  showSunDebugVector: boolean;
};

const addonStateMock = vi.hoisted(() => ({
  setShadowState: vi.fn(),
  shadowState: undefined as ShadowStateFixture | undefined,
}));

const hashStateMock = vi.hoisted(() => ({
  updateHashState: vi.fn(),
}));

const libreContextMock = vi.hoisted(() => ({
  getCenter: vi.fn(() => ({ lat: 51.256, lng: 7.15 })),
}));

vi.mock("@carma-mapping/addons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@carma-mapping/addons")>();

  return {
    ...actual,
    useAddonState: () => [
      addonStateMock.shadowState,
      addonStateMock.setShadowState,
    ],
  };
});

vi.mock("@carma-providers/hash-state", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@carma-providers/hash-state")
  >();

  return {
    ...actual,
    useHashState: () => ({ updateHashState: hashStateMock.updateHashState }),
  };
});

vi.mock("@carma-mapping/contexts", () => ({
  useLibreContext: () => ({ map: { getCenter: libreContextMock.getCenter } }),
}));

import { clampShadowSimulationSelectionToDaylight } from "@carma-mapping/shadow-simulation";
import { useGeoportalShadowSimulationHash } from "./use-geoportal-shadow-simulation-hash";

const createShadowState = (
  overrides: Partial<ShadowStateFixture> = {}
): ShadowStateFixture => ({
  enabled: false,
  selection: { year: 2026, dayOfYear: 172, minutes: 900 },
  terrainColor: "#d8d1c4",
  buildingsFullOpacity: true,
  buildingColorMix: 0,
  buildingColor: "#d8d1c4",
  shadowQuality: 4,
  showSunDebugVector: false,
  ...overrides,
});

const createCustomHashState = ({
  selection,
  source = "initial",
  version = 0,
}: {
  selection: GeoportalCustomHashState["shadowSimulationSelection"];
  source?: AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState>["source"];
  version?: number;
}): AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState> => ({
  measurementModeRequested: false,
  shadowSimulationSelection: selection,
  launchMode: HASH_LAUNCH_MODE.TWO_D,
  initialMapFramework: CARMA_MAP_FRAMEWORKS.LEAFLET,
  source,
  version,
});

describe("useGeoportalShadowSimulationHash", () => {
  beforeEach(() => {
    addonStateMock.shadowState = undefined;
    addonStateMock.setShadowState.mockReset();
    hashStateMock.updateHashState.mockReset();
    libreContextMock.getCenter.mockReset();
    libreContextMock.getCenter.mockReturnValue({ lat: 51.256, lng: 7.15 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for addon initialization before restoring and writing shadow state", async () => {
    const customHashState = createCustomHashState({
      selection: { minutes: 660, dayOfYear: 140 },
    });
    const { rerender } = renderHook(() =>
      useGeoportalShadowSimulationHash({ customHashState })
    );

    expect(addonStateMock.setShadowState).not.toHaveBeenCalled();
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

    act(() => {
      addonStateMock.shadowState = createShadowState();
      rerender();
    });

    await waitFor(() => {
      expect(addonStateMock.setShadowState).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          terrainColor: "#d8d1c4",
          shadowQuality: 4,
          selection: { year: 2026, minutes: 660, dayOfYear: 140 },
        })
      );
    });
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

    act(() => {
      addonStateMock.shadowState = addonStateMock.setShadowState.mock
        .calls[0][0] as ShadowStateFixture;
      rerender();
    });

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { shadow: "660;140" },
        { label: "geoportal:sync-shadow-simulation", replace: true }
      );
    });
  });

  it("writes local selection changes without replaying the stale hash snapshot", async () => {
    const customHashState = createCustomHashState({
      selection: { minutes: 660, dayOfYear: 140 },
    });
    addonStateMock.shadowState = createShadowState({
      enabled: true,
      selection: { year: 2026, minutes: 660, dayOfYear: 140 },
    });
    const { rerender } = renderHook(() =>
      useGeoportalShadowSimulationHash({ customHashState })
    );

    await waitFor(() =>
      expect(hashStateMock.updateHashState).toHaveBeenCalled()
    );
    hashStateMock.updateHashState.mockClear();

    act(() => {
      addonStateMock.shadowState = createShadowState({
        enabled: true,
        selection: { year: 2026, minutes: 720, dayOfYear: 141 },
      });
      rerender();
    });

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { shadow: "720;141" },
        { label: "geoportal:sync-shadow-simulation", replace: true }
      );
    });
    expect(addonStateMock.setShadowState).not.toHaveBeenCalled();
  });

  it("throttles rapid selection changes and writes the latest value", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    const customHashState = createCustomHashState({
      selection: { minutes: 660, dayOfYear: 140 },
    });
    addonStateMock.shadowState = createShadowState({
      enabled: true,
      selection: { year: 2026, minutes: 660, dayOfYear: 140 },
    });
    const { rerender } = renderHook(() =>
      useGeoportalShadowSimulationHash({ customHashState })
    );

    expect(hashStateMock.updateHashState).toHaveBeenCalledTimes(1);
    hashStateMock.updateHashState.mockClear();

    act(() => {
      addonStateMock.shadowState = createShadowState({
        enabled: true,
        selection: { year: 2026, minutes: 661, dayOfYear: 140 },
      });
      rerender();
      addonStateMock.shadowState = createShadowState({
        enabled: true,
        selection: { year: 2026, minutes: 662, dayOfYear: 141 },
      });
      rerender();
    });

    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(hashStateMock.updateHashState).toHaveBeenCalledTimes(1);
    expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
      { shadow: "662;141" },
      { label: "geoportal:sync-shadow-simulation", replace: true }
    );
  });

  it("cancels a pending local write when history navigation wins", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    let customHashState = createCustomHashState({
      selection: { minutes: 660, dayOfYear: 140 },
    });
    addonStateMock.shadowState = createShadowState({
      enabled: true,
      selection: { year: 2026, minutes: 660, dayOfYear: 140 },
    });
    const { rerender } = renderHook(() =>
      useGeoportalShadowSimulationHash({ customHashState })
    );

    expect(hashStateMock.updateHashState).toHaveBeenCalledTimes(1);
    hashStateMock.updateHashState.mockClear();

    act(() => {
      addonStateMock.shadowState = createShadowState({
        enabled: true,
        selection: { year: 2026, minutes: 720, dayOfYear: 141 },
      });
      rerender();
    });
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

    act(() => {
      customHashState = createCustomHashState({
        selection: null,
        source: "popstate",
        version: 1,
      });
      rerender();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();
    expect(addonStateMock.setShadowState).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("disables the simulation when history navigation removes the hash state", async () => {
    const customHashState = createCustomHashState({
      selection: null,
      source: "popstate",
      version: 1,
    });
    addonStateMock.shadowState = createShadowState({
      enabled: true,
      selection: { year: 2026, minutes: 660, dayOfYear: 140 },
    });
    const { rerender } = renderHook(() =>
      useGeoportalShadowSimulationHash({ customHashState })
    );

    await waitFor(() => {
      expect(addonStateMock.setShadowState).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

    act(() => {
      addonStateMock.shadowState = addonStateMock.setShadowState.mock
        .calls[0][0] as ShadowStateFixture;
      rerender();
    });

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { shadow: undefined },
        { label: "geoportal:sync-shadow-simulation", replace: true }
      );
    });
  });

  it("does not restore day 366 in a non-leap selection year", async () => {
    const customHashState = createCustomHashState({
      selection: { minutes: 660, dayOfYear: 366 },
    });
    addonStateMock.shadowState = createShadowState();

    renderHook(() => useGeoportalShadowSimulationHash({ customHashState }));

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { shadow: undefined },
        { label: "geoportal:sync-shadow-simulation", replace: true }
      );
    });
    expect(addonStateMock.setShadowState).not.toHaveBeenCalled();
  });

  it("clamps a night hash selection to the lower-limb horizon at the map center", async () => {
    const berlinCenter = { lat: 52.52, lng: 13.405 };
    libreContextMock.getCenter.mockReturnValue(berlinCenter);
    const hashSelection = { year: 2026, dayOfYear: 64, minutes: 0 };
    const expectedSelection = clampShadowSimulationSelectionToDaylight(
      hashSelection,
      {
        latitude: berlinCenter.lat,
        longitude: berlinCenter.lng,
        timeZone: "Europe/Berlin",
      }
    );
    const defaultLocationSelection =
      clampShadowSimulationSelectionToDaylight(hashSelection);
    expect(expectedSelection).not.toBeNull();
    expect(expectedSelection?.minutes).not.toBe(
      defaultLocationSelection?.minutes
    );

    const customHashState = createCustomHashState({
      selection: {
        minutes: hashSelection.minutes,
        dayOfYear: hashSelection.dayOfYear,
      },
    });
    addonStateMock.shadowState = createShadowState();
    const { rerender } = renderHook(() =>
      useGeoportalShadowSimulationHash({ customHashState })
    );

    await waitFor(() => {
      expect(addonStateMock.setShadowState).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          selection: expectedSelection,
        })
      );
    });

    act(() => {
      addonStateMock.shadowState = addonStateMock.setShadowState.mock
        .calls[0][0] as ShadowStateFixture;
      rerender();
    });

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        {
          shadow: `${expectedSelection?.minutes};${expectedSelection?.dayOfYear}`,
        },
        { label: "geoportal:sync-shadow-simulation", replace: true }
      );
    });
  });
});
