import { describe, expect, it, vi } from "vitest";

import { createStore } from "./store";

describe("createStore", () => {
  it("returns the initial state", () => {
    const store = createStore({ count: 1 });

    expect(store.getState()).toEqual({ count: 1 });
  });

  it("updates state from a plain value", () => {
    const store = createStore({ count: 1 });

    store.setState({ count: 2 });

    expect(store.getState()).toEqual({ count: 2 });
  });

  it("updates state from an updater function", () => {
    const store = createStore({ count: 1 });

    store.setState((previousState) => ({
      count: previousState.count + 1,
    }));

    expect(store.getState()).toEqual({ count: 2 });
  });

  it("notifies subscribers when the state changes", () => {
    const store = createStore({ count: 1 });
    const listener = vi.fn();

    store.subscribe(listener);
    store.setState({ count: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify subscribers when the next state is identical", () => {
    const state = { count: 1 };
    const store = createStore(state);
    const listener = vi.fn();

    store.subscribe(listener);
    store.setState(state);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying unsubscribed listeners", () => {
    const store = createStore({ count: 1 });
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setState({ count: 2 });

    expect(listener).not.toHaveBeenCalled();
  });
});
