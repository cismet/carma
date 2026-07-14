import type { PointQueryPickResult } from "../registry";

export type ActivePointQueryPickResultStore = {
  getSnapshot: () => PointQueryPickResult | null;
  setSnapshot: (pickResult: PointQueryPickResult | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createActivePointQueryPickResultStore =
  (): ActivePointQueryPickResultStore => {
    let snapshot: PointQueryPickResult | null = null;
    const listeners = new Set<() => void>();

    return {
      getSnapshot: () => snapshot,
      setSnapshot: (pickResult) => {
        if (snapshot === pickResult) {
          return;
        }

        snapshot = pickResult;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  };
