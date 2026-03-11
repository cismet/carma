import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createStore } from "./store";
import { useStoreSelector, useStoreValue } from "./useStoreSelector";

describe("useStoreSelector", () => {
  it("returns the selected store state", () => {
    const store = createStore({ count: 1, label: "one" });

    const { result } = renderHook(() =>
      useStoreSelector(store, (state) => state.count)
    );

    expect(result.current).toBe(1);
  });

  it("updates when the selected snapshot changes", () => {
    const store = createStore({ count: 1, label: "one" });

    const { result } = renderHook(() =>
      useStoreSelector(store, (state) => state.count)
    );

    act(() => {
      store.setState((previousState) => ({
        ...previousState,
        count: previousState.count + 1,
      }));
    });

    expect(result.current).toBe(2);
  });

  it("does not force a rerender when the selected snapshot is unchanged", () => {
    const store = createStore({ count: 1, label: "one" });
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount += 1;
      return useStoreSelector(store, (state) => state.count);
    });

    act(() => {
      store.setState((previousState) => ({
        ...previousState,
        label: "two",
      }));
    });

    expect(result.current).toBe(1);
    expect(renderCount).toBe(1);
  });
});

describe("useStoreValue", () => {
  it("returns the full store state", () => {
    const store = createStore({ count: 1, label: "one" });

    const { result } = renderHook(() => useStoreValue(store));

    expect(result.current).toEqual({ count: 1, label: "one" });
  });
});
