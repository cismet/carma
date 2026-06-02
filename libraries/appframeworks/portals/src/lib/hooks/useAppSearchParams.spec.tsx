// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HASH_LAUNCH_MODE } from "@carma-commons/utils";

const routingMock = vi.hoisted(() => ({
  getHashParams: vi.fn(),
  updateHashHistoryState: vi.fn(),
}));
const useHashLaunchModeMock = vi.hoisted(() => vi.fn());
const hashStateMock = vi.hoisted(() => ({
  popStateCallbacks: [] as Array<
    (event: { hashParams: Record<string, string> }) => void
  >,
}));

vi.mock("@carma-commons/utils", () => ({
  HASH_LAUNCH_MODE: {
    TWO_D: "2d",
    THREE_D: "3d",
    UNSET: "unset",
  },
  getHashParams: routingMock.getHashParams,
  updateHashHistoryState: routingMock.updateHashHistoryState,
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/geoportal" }),
}));

vi.mock("@carma-providers/hash-state", () => ({
  useHashState: () => ({
    getHashParams: routingMock.getHashParams,
    registerOnPopState: (
      callback: (event: { hashParams: Record<string, string> }) => void
    ) => {
      hashStateMock.popStateCallbacks.push(callback);
      return () => {
        hashStateMock.popStateCallbacks = hashStateMock.popStateCallbacks.filter(
          (registeredCallback) => registeredCallback !== callback
        );
      };
    },
  }),
}));

vi.mock("./useHashLaunchMode", () => ({
  useHashLaunchMode: useHashLaunchModeMock,
}));

import { useAppSearchParams } from "./useAppSearchParams";

const emitPopState = (hashParams: Record<string, string>) => {
  act(() => {
    hashStateMock.popStateCallbacks.forEach((callback) => {
      callback({ hashParams });
    });
  });
};

describe("useAppSearchParams", () => {
  beforeEach(() => {
    routingMock.getHashParams.mockReset();
    routingMock.updateHashHistoryState.mockReset();
    useHashLaunchModeMock.mockReset();
    hashStateMock.popStateCallbacks = [];
  });

  it("uses the configured launch mode resolver for initial hash launch mode", () => {
    routingMock.getHashParams.mockReturnValue({ mm: "1" });

    renderHook(() =>
      useAppSearchParams({
        resolveLaunchMode: () => HASH_LAUNCH_MODE.THREE_D,
      })
    );

    expect(useHashLaunchModeMock).toHaveBeenCalledWith({
      defaultMode: HASH_LAUNCH_MODE.THREE_D,
    });
  });

  it("uses launchMode from the custom hash state when available", () => {
    routingMock.getHashParams.mockReturnValue({ mm: "1" });

    renderHook(() =>
      useAppSearchParams({
        resolveCustomHashState: () => ({
          launchMode: HASH_LAUNCH_MODE.THREE_D,
        }),
      })
    );

    expect(useHashLaunchModeMock).toHaveBeenCalledWith({
      defaultMode: HASH_LAUNCH_MODE.THREE_D,
    });
  });

  it("writes configured default hash params when the supplied predicate applies", async () => {
    routingMock.getHashParams.mockReturnValue({});

    renderHook(() =>
      useAppSearchParams({
        defaultHashParams: {
          buildParams: () => ({ lat: "51", lng: "7", zoom: "12" }),
          label: "test:init-default-view",
          shouldApply: () => true,
        },
      })
    );

    await waitFor(() => {
      expect(routingMock.updateHashHistoryState).toHaveBeenCalledWith(
        { lat: "51", lng: "7", zoom: "12" },
        "/geoportal",
        {
          label: "test:init-default-view",
          replace: true,
        }
      );
    });
  });

  it("leaves the hash untouched when the configured predicate does not apply", async () => {
    routingMock.getHashParams.mockReturnValue({});

    renderHook(() =>
      useAppSearchParams({
        defaultHashParams: {
          buildParams: () => ({ lat: "51", lng: "7", zoom: "12" }),
          label: "test:init-default-view",
          shouldApply: () => false,
        },
      })
    );

    await waitFor(() => {
      expect(routingMock.updateHashHistoryState).not.toHaveBeenCalled();
    });
  });

  it("returns configured custom hash state for the initial hash and popstate events", () => {
    routingMock.getHashParams.mockReturnValue({ mm: "1" });

    const { result } = renderHook(() =>
      useAppSearchParams({
        resolveCustomHashState: (hashParams) => ({
          measurementModeRequested: hashParams.mm === "1",
        }),
      })
    );

    expect(result.current.customHashState).toMatchObject({
      measurementModeRequested: true,
      source: "initial",
      version: 0,
    });

    emitPopState({ mm: "0" });

    expect(result.current.customHashState).toMatchObject({
      measurementModeRequested: false,
      source: "popstate",
      version: 1,
    });
  });
});
