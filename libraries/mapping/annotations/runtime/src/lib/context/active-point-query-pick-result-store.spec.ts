import { describe, expect, it, vi } from "vitest";

import type { PointQueryPickResult } from "../registry";
import { createActivePointQueryPickResultStore } from "./active-point-query-pick-result-store";

const createPickResult = (): PointQueryPickResult =>
  ({
    coordinate: { longitude: 7, latitude: 51, altitude: 100 },
  } as PointQueryPickResult);

describe("createActivePointQueryPickResultStore", () => {
  it("publishes point-query samples without React-owned state", () => {
    const store = createActivePointQueryPickResultStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const pickResult = createPickResult();

    store.setSnapshot(pickResult);

    expect(store.getSnapshot()).toBe(pickResult);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.setSnapshot(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not publish the same snapshot twice", () => {
    const store = createActivePointQueryPickResultStore();
    const listener = vi.fn();
    const pickResult = createPickResult();
    store.subscribe(listener);

    store.setSnapshot(pickResult);
    store.setSnapshot(pickResult);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
