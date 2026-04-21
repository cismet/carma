// @vitest-environment jsdom

import type { PropsWithChildren } from "react";

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  HASH_CLEAR_STATE_KEY_SET,
  RoutedHashStateProvider,
  useHashState,
} from "./hashStateShared";

const TEST_ROUTED_PATH = "/test";

const wrapper = ({ children }: PropsWithChildren) => (
  <RoutedHashStateProvider routedPath={TEST_ROUTED_PATH}>
    {children}
  </RoutedHashStateProvider>
);

const setHash = (query: string) => {
  const suffix = query.length > 0 ? `?${query}` : "";
  window.history.replaceState({}, "", `#${TEST_ROUTED_PATH}${suffix}`);
};

describe("RoutedHashStateProvider alias handling", () => {
  beforeEach(() => {
    setHash("");
  });

  it("ignores canonical managed keys when an alias exists", () => {
    setHash("pitch=45&bearing=180&altitude=157&roll=12");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashStateValues()).toEqual({});
  });

  it("reads aliased scene-state keys into canonical decoded values", () => {
    setHash("p=45&b=180&h=157&r=12");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashStateValues()).toEqual({
      pitch: 45,
      bearing: 180,
      altitude: 157,
      roll: 12,
    });
  });

  it("ignores unmanaged keys in typed reads", () => {
    setHash("foo=bar&zoom=17&p=45");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashStateValues()).toEqual({
      zoom: 17,
      pitch: 45,
    });
  });

  it("prefers the managed alias even when ignored long-form keys are present", () => {
    setHash("pitch=12&p=45&bearing=90&b=180");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashStateValues()).toEqual({
      pitch: 45,
      bearing: 180,
    });
  });

  it("evaluates only the alias value when pitch and p both appear in the URL", () => {
    setHash("pitch=50&p=40");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashStateValues()).toEqual({
      pitch: 40,
    });
  });

  it("writes only alias keys for aliased managed fields", () => {
    const { result } = renderHook(() => useHashState(), { wrapper });

    act(() => {
      result.current.updateHashState({
        pitch: 45,
        bearing: 180,
        altitude: 157,
        roll: 12,
      });
    });

    expect(window.location.hash).toContain("p=45");
    expect(window.location.hash).toContain("b=180");
    expect(window.location.hash).toContain("h=157");
    expect(window.location.hash).toContain("r=12");
    expect(window.location.hash).not.toContain("pitch=");
    expect(window.location.hash).not.toContain("bearing=");
    expect(window.location.hash).not.toContain("altitude=");
    expect(window.location.hash).not.toContain("roll=");
  });

  it("removes an aliased managed key when its codec encodes to undefined", () => {
    setHash("m=1&zoom=17");

    const { result } = renderHook(() => useHashState(), { wrapper });

    act(() => {
      result.current.updateHashState({
        mapStyle: "unknown-style",
      });
    });

    const searchParams = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );

    expect(searchParams.get("zoom")).toBe("17");
    expect(searchParams.has("m")).toBe(false);
    expect(result.current.getHashStateValues()).toEqual({
      zoom: 17,
    });
  });

  it("keeps an unmanaged hash param unchanged unless it is explicitly cleared", () => {
    setHash("unmanagedhashparam=keep-me&zoom=17&p=40");

    const { result } = renderHook(() => useHashState(), { wrapper });

    act(() => {
      result.current.updateHashState(
        {
          pitch: 45,
        },
        {
          clearStateKeySetIds: [HASH_CLEAR_STATE_KEY_SET.SCENE_VIEW_STATE],
        }
      );
    });

    let searchParams = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );

    expect(searchParams.get("unmanagedhashparam")).toBe("keep-me");
    expect(searchParams.get("p")).toBe("45");

    act(() => {
      result.current.updateHashState(
        {
          pitch: 45,
        },
        {
          clearStateKeySetIds: [HASH_CLEAR_STATE_KEY_SET.SCENE_VIEW_STATE],
          clearStateKeys: ["unmanagedhashparam"],
        }
      );
    });

    searchParams = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );

    expect(searchParams.has("unmanagedhashparam")).toBe(false);
    expect(searchParams.get("p")).toBe("45");
  });
});
