import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HIERARCHY_OPERATION,
  HIERARCHY_RESULT,
  type HierarchyRequest,
  type HierarchyResponse,
} from "../../core/tileset-hierarchy-protocol";
import { createTilesetHierarchyPageReader } from "../../core/tileset-hierarchy-page";

const storage = vi.hoisted(() => ({
  pages: new Map<string, unknown>(),
  fail: false,
  writes: 0,
}));
vi.mock("@carma-commons/utils", () => ({
  resolveDerivedCacheAssetEpoch: () => "producer-fixture-v1",
  createDerivedBufferCache: () => ({
    register: () => ({
      get: async (key: string) => {
        if (storage.fail) throw new Error("Storage unavailable");
        const value = storage.pages.get(key);
        return value ? { value: structuredClone(value) } : null;
      },
      put: async (key: string, value: unknown) => {
        if (storage.fail) throw new Error("Quota");
        storage.writes++;
        storage.pages.set(key, structuredClone(value));
      },
      remove: async (key: string) => storage.pages.delete(key),
    }),
  }),
}));
const rootUrl = "https://tiles.test/root.json",
  childUrl = "https://tiles.test/child.json";
const document = (revision = 1) => ({
  asset: { version: "1.0", extras: { revision } },
  root: { boundingVolume: { sphere: [revision, 0, 0, 10] }, geometricError: 1 },
});
const boot = async () => {
  vi.resetModules();
  const pending = new Map<number, (value: HierarchyResponse) => void>();
  const scope = {
    location: { href: "https://app.test/assets/hierarchy-worker-a1234567.js" },
    postMessage: (value: HierarchyResponse) => pending.get(value.id)?.(value),
    onmessage: null as ((event: { data: HierarchyRequest }) => void) | null,
  };
  vi.stubGlobal("self", scope);
  await import("./tileset-hierarchy.worker");
  let id = 0;
  return (url: string) =>
    new Promise<HierarchyResponse>((resolve) => {
      const next = ++id;
      pending.set(next, resolve);
      scope.onmessage!({
        data: {
          id: next,
          operation: HIERARCHY_OPERATION.load,
          rootUrl,
          url,
          options: {},
        },
      });
    });
};
beforeEach(() => {
  storage.pages.clear();
  storage.fail = false;
  storage.writes = 0;
});
afterEach(() => vi.unstubAllGlobals());
describe("persistent sparse hierarchy worker", () => {
  it("validates root once and restores known children after a new worker without refetch", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(document())));
    vi.stubGlobal("fetch", fetch);
    const first = await boot();
    await first(rootUrl);
    await first(childUrl);
    await vi.waitFor(() => expect(storage.writes).toBe(2));
    fetch.mockClear();
    const second = await boot();
    await second(rootUrl);
    const result = await second(childUrl);
    expect(result.kind).toBe(HIERARCHY_RESULT.page);
    if (result.kind !== HIERARCHY_RESULT.page) throw new Error("Missing page");
    expect(result.cached).toBe(true);
    const reader = createTilesetHierarchyPageReader(result.page);
    while (reader.read()) {
      /* Native reconstruction */
    }
    expect(reader.finish()).toEqual(document());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(rootUrl);
  });
  it("never reuses old child metadata after the root hash changes", async () => {
    let revision = 1;
    const fetch = vi.fn(
      async () => new Response(JSON.stringify(document(revision)))
    );
    vi.stubGlobal("fetch", fetch);
    const first = await boot();
    await first(rootUrl);
    await first(childUrl);
    await vi.waitFor(() => expect(storage.writes).toBe(2));
    revision = 2;
    fetch.mockClear();
    const second = await boot();
    await second(rootUrl);
    const result = await second(childUrl);
    expect(result).toMatchObject({
      kind: HIERARCHY_RESULT.page,
      cached: false,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps discovery working with blocked/unavailable storage", async () => {
    storage.fail = true;
    const fetch = vi.fn(async () => new Response(JSON.stringify(document())));
    vi.stubGlobal("fetch", fetch);
    const load = await boot();
    await load(rootUrl);
    await expect(load(childUrl)).resolves.toMatchObject({
      kind: HIERARCHY_RESULT.page,
      cached: false,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
