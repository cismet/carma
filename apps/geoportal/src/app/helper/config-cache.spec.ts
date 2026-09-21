import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, unknown>());

// copies in both directions, the way IndexedDB behind localforage does
vi.mock("localforage", () => ({
  default: {
    getItem: (key: string) =>
      Promise.resolve(structuredClone(storage.get(key) ?? null)),
    setItem: (key: string, value: unknown) => {
      storage.set(key, structuredClone(value));
      return Promise.resolve(value);
    },
  },
}));

// the real modules pull in the route list and the portals framework
vi.mock("../config", () => ({ APP_KEY: "geoportal", STORAGE_PREFIX: "1" }));
vi.mock("../store/app-key", () => ({ STORE_APP_KEY: "outlet" }));

import { readCachedConfig, writeCachedConfig } from "./config-cache";

const urlOf = (n: number) => `https://ceepr.example/config/${n}`;
const configOf = (n: number) => ({ layers: [{ id: `layer-${n}` }] });

/** lets the fire-and-forget reorder a hit triggers land */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("config-cache", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns undefined for a url it never stored", async () => {
    expect(await readCachedConfig(urlOf(1))).toBeUndefined();
  });

  it("returns what was stored for a url", async () => {
    await writeCachedConfig(urlOf(1), configOf(1));
    expect(await readCachedConfig(urlOf(1))).toEqual(configOf(1));
  });

  it("keeps one entry per url, the latest write winning", async () => {
    await writeCachedConfig(urlOf(1), configOf(1));
    await writeCachedConfig(urlOf(1), configOf(2));
    expect(await readCachedConfig(urlOf(1))).toEqual(configOf(2));
    const [entries] = [...storage.values()] as { url: string }[][];
    expect(entries).toHaveLength(1);
  });

  it("drops the least recently used entry past 50", async () => {
    for (let n = 1; n <= 50; n++) {
      await writeCachedConfig(urlOf(n), configOf(n));
    }
    // reading the oldest makes it the most recently used
    expect(await readCachedConfig(urlOf(1))).toEqual(configOf(1));
    await settle();

    await writeCachedConfig(urlOf(51), configOf(51));

    expect(await readCachedConfig(urlOf(1))).toEqual(configOf(1));
    expect(await readCachedConfig(urlOf(2))).toBeUndefined();
    expect(await readCachedConfig(urlOf(51))).toEqual(configOf(51));
  });
});
