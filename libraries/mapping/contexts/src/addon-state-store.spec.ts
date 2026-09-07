import { describe, expect, it, vi } from "vitest";
import { createAddonStateStore } from "./addon-state-store";

describe("addon channel subscriptions", () => {
  it("publishes initial state immediately and only notifies the changed channel", () => {
    const initial = {
      shadowSimulation: { enabled: true },
      shadowDate: { minutes: 660 },
    };
    const store = createAddonStateStore(initial);
    const simulation = vi.fn();
    const date = vi.fn();
    const snapshot = vi.fn();
    store.subscribe("shadowSimulation", simulation);
    const unsubscribe = store.subscribe("shadowDate", date);
    store.subscribe(undefined, snapshot);
    expect(store.getSnapshot()).toBe(initial);
    store.set("shadowDate", { minutes: 661 });
    expect(simulation).not.toHaveBeenCalled();
    expect(date).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
    store.set("shadowDate", store.getSnapshot().shadowDate);
    expect(date).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set("shadowDate", { minutes: 662 });
    expect(date).toHaveBeenCalledTimes(1);
  });
});
