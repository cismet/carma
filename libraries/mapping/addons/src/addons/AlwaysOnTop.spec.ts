import { describe, expect, it } from "vitest";

import { keepOnTop } from "./AlwaysOnTop";

/** the map calls `keepOnTop` makes, over a plain layer list */
const fakeMap = (ids: string[]) => {
  let order = [...ids];
  const layers = new Map(ids.map((id) => [id, { id }]));
  const listeners = new Set<() => void>();
  let moves = 0;
  const map = {
    getLayersOrder: () => [...order],
    getLayer: (id: string) => layers.get(id),
    moveLayer: (id: string, beforeId?: string) => {
      moves += 1;
      order = order.filter((other) => other !== id);
      const at = beforeId ? order.indexOf(beforeId) : -1;
      if (at < 0) order.push(id);
      else order.splice(at, 0, id);
    },
    on: (_type: string, listener: () => void) => listeners.add(listener),
    off: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  return {
    map,
    keeper: map as unknown as Parameters<typeof keepOnTop>[0],
    get order() {
      return order;
    },
    get moves() {
      return moves;
    },
    /** a layer added over everything, a new object each time like MapLibre's */
    add: (id: string) => {
      layers.set(id, { id });
      order = [...order.filter((other) => other !== id), id];
    },
    /**
     * `styledata` until nothing moves any more, the number of rounds it took;
     * gives up after 20, which a test reads as the sides taking turns forever
     */
    settle: () => {
      for (let round = 1; round <= 20; round += 1) {
        const before = moves;
        for (const listener of [...listeners]) listener();
        if (moves === before) return round;
      }
      return Infinity;
    },
  };
};

/** cage's occlusion layers: `after` last, `before` right in front of it */
const occlusionLike = (fake: ReturnType<typeof fakeMap>) => {
  fake.map.on("styledata", () => {
    const order = fake.map.getLayersOrder();
    if (order[order.length - 1] !== "after") fake.map.moveLayer("after");
    const now = fake.map.getLayersOrder();
    if (now[now.indexOf("before") + 1] !== "after") {
      fake.map.moveLayer("before", "after");
    }
  });
};

describe("keepOnTop", () => {
  it("moves its layers above a layer added over them", () => {
    const fake = fakeMap(["base", "cover", "ring", "added"]);
    keepOnTop(fake.keeper, ["cover", "ring"]);
    expect(fake.order).toEqual(["base", "added", "cover", "ring"]);
  });

  it("leaves the map alone while they are on top", () => {
    const fake = fakeMap(["base", "cover", "ring"]);
    keepOnTop(fake.keeper, ["cover", "ring"]);
    expect(fake.settle()).toBe(1);
    expect(fake.moves).toBe(0);
  });

  it("gives way to layers that keep themselves last", () => {
    const fake = fakeMap(["base", "before", "after", "cover", "ring"]);
    occlusionLike(fake);
    keepOnTop(fake.keeper, ["cover", "ring"]);
    expect(fake.settle()).toBeLessThan(20);
    expect(fake.order).toEqual(["base", "cover", "ring", "before", "after"]);

    // a layer added later still goes under them, the occlusion stays last
    fake.add("vehicle");
    expect(fake.settle()).toBeLessThan(20);
    expect(fake.order).toEqual([
      "base",
      "vehicle",
      "cover",
      "ring",
      "before",
      "after",
    ]);
  });

  it("starts over when its layers are added anew", () => {
    const fake = fakeMap(["base", "cover", "ring", "added"]);
    keepOnTop(fake.keeper, ["cover", "ring"]);
    // "added" climbs back and is left on top
    fake.add("added");
    fake.settle();
    expect(fake.order).toEqual(["base", "cover", "ring", "added"]);

    // a composition drops and re-adds everything, "added" goes under again
    fake.add("cover");
    fake.add("ring");
    fake.add("added");
    fake.settle();
    expect(fake.order).toEqual(["base", "added", "cover", "ring"]);
  });

  it("stops on the returned function", () => {
    const fake = fakeMap(["base", "cover", "added"]);
    const stop = keepOnTop(fake.keeper, ["cover"]);
    stop();
    fake.add("late");
    fake.settle();
    expect(fake.order).toEqual(["base", "added", "cover", "late"]);
  });
});
