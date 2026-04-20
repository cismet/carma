// @vitest-environment jsdom

import type { PropsWithChildren } from "react";

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { HashStateProviderBase, useHashState } from "./hashStateShared";

const TEST_ROUTED_PATH = "/test";

const wrapper = ({ children }: PropsWithChildren) => (
  <HashStateProviderBase routedPath={TEST_ROUTED_PATH}>
    {children}
  </HashStateProviderBase>
);

const setHash = (query: string) => {
  const suffix = query.length > 0 ? `?${query}` : "";
  window.history.replaceState({}, "", `#${TEST_ROUTED_PATH}${suffix}`);
};

describe("HashStateProviderBase alias handling", () => {
  beforeEach(() => {
    setHash("");
  });

  it("ignores canonical managed keys when an alias exists", () => {
    setHash("pitch=45&bearing=180&altitude=157&roll=12");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashValues()).toEqual({});
  });

  it("reads aliased scene-state keys into canonical decoded values", () => {
    setHash("p=45&b=180&h=157&r=12");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashValues()).toEqual({
      pitch: 45,
      bearing: 180,
      altitude: 157,
      roll: 12,
    });
  });

  it("ignores unmanaged keys in typed reads", () => {
    setHash("foo=bar&zoom=17&p=45");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashValues()).toEqual({
      zoom: 17,
      pitch: 45,
    });
  });

  it("prefers the managed alias even when ignored long-form keys are present", () => {
    setHash("pitch=12&p=45&bearing=90&b=180");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashValues()).toEqual({
      pitch: 45,
      bearing: 180,
    });
  });

  it("evaluates only the alias value when pitch and p both appear in the URL", () => {
    setHash("pitch=50&p=40");

    const { result } = renderHook(() => useHashState(), { wrapper });

    expect(result.current.getHashValues()).toEqual({
      pitch: 40,
    });
  });

  it("writes only alias keys for aliased managed fields", () => {
    const { result } = renderHook(() => useHashState(), { wrapper });

    act(() => {
      result.current.updateHash({
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
});
