import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Matrix4 } from "three";
import { snapshotMeshBaseRenderRecord } from "../../core/mesh-base-render-record";
import {
  meshBaseCacheIdentity,
  MESH_BASE_RENDER_FORMAT,
  type MeshBaseCacheRequest,
  type MeshBaseCacheResponse,
} from "../../core/mesh-base-cache-protocol";
import {
  createMeshBasePayload,
  parseMeshBasePayload,
  type MeshBaseNativeRenderer,
} from "./mesh-base-cache-payload";
import type { Tile } from "3d-tiles-renderer/core";
import { MeshBaseCachePlugin } from "./mesh-base-cache-plugin";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";

vi.mock("./three-tiles-runtime-vendor", () => ({
  resolveTileContentUrl: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
});
const createPlugin = (fetchSource = vi.fn()) =>
  new MeshBaseCachePlugin({
    sourceUrl: "https://mesh.test/tileset.json",
    buildId: "test",
    extentError: () => 10,
    memoryBudget: () => 1024,
    canPrepare: () => false,
    onConfirmed: vi.fn(),
    fetchSource,
  });

describe("base cache worker lifetime", () => {
  it("does not create a worker when disposed during the source digest", async () => {
    let finishDigest!: (value: ArrayBuffer) => void;
    vi.stubGlobal("crypto", {
      subtle: {
        digest: () =>
          new Promise<ArrayBuffer>((resolve) => {
            finishDigest = resolve;
          }),
      },
    });
    const worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    const plugin = createPlugin();
    const pending = plugin.initialize({ root: {} });
    plugin.dispose();
    finishDigest(new ArrayBuffer(32));
    await pending;
    expect(worker).not.toHaveBeenCalled();
  });

  it("terminates an existing worker and settles its pending initialization", async () => {
    vi.stubGlobal("crypto", {
      subtle: { digest: async () => new ArrayBuffer(32) },
    });
    const terminate = vi.fn();
    const postMessage = vi.fn();
    vi.stubGlobal(
      "Worker",
      class {
        terminate = terminate;
        postMessage = postMessage;
      }
    );
    const plugin = createPlugin();
    const pending = plugin.initialize({ root: {} });
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledOnce();
    plugin.dispose();
    await pending;
    expect(terminate).toHaveBeenCalledOnce();
    expect(plugin.getStats().confirmed).toBe(false);
  });
});

describe("mesh cache source compatibility", () => {
  const installWorker = (mismatch = false, invalidRecord = false) => {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: async (_algorithm: string, bytes: Uint8Array) =>
          new Uint8Array(32).fill(bytes.length).buffer,
      },
    });
    const instances: FakeWorker[] = [];
    const closeImage = vi.fn();
    class FakeWorker {
      onmessage: ((event: MessageEvent<MeshBaseCacheResponse>) => void) | null =
        null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      identity = "";
      constructor() {
        instances.push(this);
      }
      postMessage(data: MeshBaseCacheRequest) {
        let value: MeshBaseCacheResponse["value"] = null;
        if (data.operation === "initialize") {
          this.identity = meshBaseCacheIdentity(data);
          value = {
            format: MESH_BASE_RENDER_FORMAT,
            sourceUrl: data.sourceUrl,
            sourceRevision: data.sourceRevision,
            buildId: mismatch ? "other-build" : data.buildId,
            extentError: 10,
            residentBytes: 100,
            urls: ["https://mesh.test/root.b3dm"],
          };
        } else if (data.operation === "get") {
          value = {
            ...snapshotMeshBaseRenderRecord(new Group(), new Matrix4())!,
            cacheIdentity: this.identity,
            contentUrl: invalidRecord
              ? "https://mesh.test/different.b3dm"
              : data.url,
          };
          // Ownership of decoded cache images moves to the plugin until hydration.
          value.textures["decoded"] = {
            image: { close: closeImage } as unknown as ImageBitmap,
            properties: {},
            offset: [0, 0],
            repeat: [1, 1],
            center: [0, 0],
            matrix: [],
          };
        }
        queueMicrotask(() =>
          this.onmessage?.({
            data: { id: data.id, value },
          } as MessageEvent<MeshBaseCacheResponse>)
        );
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    return { instances, closeImage };
  };
  it("rejects a saved baseline from another build before any hydration", async () => {
    installWorker(true);
    const plugin = createPlugin();
    await plugin.initialize({ root: {} });
    expect(plugin.getStats().confirmed).toBe(false);
    expect(plugin.fetchData("https://mesh.test/root.b3dm", {})).toBeNull();
    plugin.dispose();
  });
  it("retains compatible prepared records on repeated initialize, but closes them on changed source revision", async () => {
    const { instances, closeImage } = installWorker();
    const plugin = createPlugin();
    await plugin.initialize({ root: {} });
    await plugin.fetchData("https://mesh.test/root.b3dm", {});
    await plugin.initialize({ root: {} });
    expect(instances).toHaveLength(1);
    expect(closeImage).not.toHaveBeenCalled();
    await plugin.initialize({ root: { changed: true } });
    expect(instances).toHaveLength(2);
    expect(instances[0].terminate).toHaveBeenCalledOnce();
    expect(closeImage).toHaveBeenCalledOnce();
    plugin.dispose();
  });
  it("returns raw source bytes when a compatible manifest supplies an incompatible prepared record", async () => {
    const { closeImage } = installWorker(false, true);
    const raw = new ArrayBuffer(32);
    const fetchSource = vi.fn().mockResolvedValue(raw);
    const plugin = createPlugin(fetchSource);
    const signal = new AbortController().signal;
    try {
      await plugin.initialize({ root: {} });
      expect(
        await plugin.fetchData("https://mesh.test/root.b3dm", { signal })
      ).toBe(raw);
      expect(fetchSource).toHaveBeenCalledOnce();
      expect(closeImage).toHaveBeenCalledOnce();
      expect(plugin.getStats().confirmed).toBe(false);
    } finally {
      plugin.dispose();
    }
  });
});

describe("prepared mesh parse fallback", () => {
  it("refreshes request lifetime for a cache hit after an aborted source and another cache retry", async () => {
    const signals: AbortSignal[] = [];
    const prepareModel = vi.fn(
      async (_scene, { signal, tile: currentTile }) => {
        expect(currentTile).toBe(tile);
        signals.push(signal);
        signal.throwIfAborted();
      }
    );
    const source = new Gltf1UpgradePlugin({ prepareModel });
    const cache = new MeshBaseCachePlugin({
      sourceUrl: "https://mesh.test/tileset.json",
      buildId: "test",
      extentError: () => 10,
      memoryBudget: () => 1024,
      canPrepare: () => false,
      onConfirmed: vi.fn(),
      fetchSource: vi.fn(),
      prepareModel: (scene, tile, signal) =>
        source.processTileModel(scene, tile, signal),
    });
    const tile = {} as Tile,
      scene = new Group();
    const renderer = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      parseTile: vi.fn(async (_buffer, _tile, _extension, _url, signal) => {
        signal.throwIfAborted();
        // Native invokeAllPlugins starts cache before the later source hook.
        await Promise.all([
          cache.processTileModel(scene, tile),
          source.processTileModel(scene, tile),
        ]);
      }),
    } as unknown as MeshBaseNativeRenderer;
    cache.init(renderer);
    const old = new AbortController();
    source.parseTile(new ArrayBuffer(0), tile, "b3dm", "mesh.b3dm", old.signal);
    old.abort();
    const first = new AbortController();
    await cache.parseTile(
      createMeshBasePayload(1),
      tile,
      "b3dm",
      "mesh.b3dm",
      first.signal
    );
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    expect(signals[1]).toBe(signals[0]);
    first.abort();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    const retry = new AbortController();
    await cache.parseTile(
      createMeshBasePayload(2),
      tile,
      "b3dm",
      "mesh.b3dm",
      retry.signal
    );
    expect(signals.slice(2).every((signal) => !signal.aborted)).toBe(true);
    expect(signals[2]).not.toBe(signals[0]);
    retry.abort();
    expect(signals[2].aborted).toBe(true);
    cache.dispose();
    source.dispose();
  });

  it.each(["buffer", "response"] as const)(
    "falls back once with the original %s source contract",
    async (contract) => {
      const prepared = createMeshBasePayload(17),
        raw = new ArrayBuffer(64);
      const tile = {} as Tile,
        signal = new AbortController().signal;
      const parseTile = vi
        .fn()
        .mockRejectedValueOnce(new Error("corrupt prepared geometry"));
      const prepareFresh = vi.fn().mockResolvedValue(undefined);
      const invokeOnePlugin = vi.fn((callback) =>
        callback({ parseTile: prepareFresh })
      );
      const tiles = {
        parseTile,
        invokeOnePlugin,
        fetchOptions: { credentials: "include" },
      } as unknown as MeshBaseNativeRenderer;
      const response = new Response();
      const read = vi.spyOn(response, "arrayBuffer").mockResolvedValue(raw);
      const fetchSource = vi
        .fn()
        .mockResolvedValue(contract === "buffer" ? raw : response);
      const invalid = vi.fn();
      await parseMeshBasePayload(
        tiles,
        { buffer: prepared, tile, extension: "b3dm", url: "mesh.b3dm", signal },
        fetchSource,
        invalid
      );
      expect(invalid).toHaveBeenCalledOnce();
      expect(fetchSource).toHaveBeenCalledWith("mesh.b3dm", {
        credentials: "include",
        signal,
      });
      expect(parseTile).toHaveBeenCalledOnce();
      expect(invokeOnePlugin).toHaveBeenCalledOnce();
      expect(prepareFresh).toHaveBeenLastCalledWith(
        raw,
        tile,
        "b3dm",
        "mesh.b3dm",
        signal
      );
      expect(read).toHaveBeenCalledTimes(contract === "buffer" ? 0 : 1);
    }
  );

  it("does not parse a failed fallback HTTP response", async () => {
    const parseTile = vi.fn().mockRejectedValueOnce(new Error("cache invalid"));
    const tiles = {
      parseTile,
      fetchOptions: {},
    } as unknown as MeshBaseNativeRenderer;
    await expect(
      parseMeshBasePayload(
        tiles,
        {
          buffer: createMeshBasePayload(18),
          tile: {} as Tile,
          extension: "b3dm",
          url: "mesh.b3dm",
          signal: new AbortController().signal,
        },
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
        vi.fn()
      )
    ).rejects.toThrow("Tile response 503");
    expect(parseTile).toHaveBeenCalledOnce();
  });

  it("does not parse a raw fallback that arrives after cancellation", async () => {
    const caller = new AbortController();
    const parseTile = vi.fn().mockRejectedValueOnce(new Error("cache invalid"));
    const tiles = {
      parseTile,
      fetchOptions: {},
    } as unknown as MeshBaseNativeRenderer;
    const fetchSource = vi.fn(async () => {
      caller.abort();
      return new ArrayBuffer(64);
    });
    await expect(
      parseMeshBasePayload(
        tiles,
        {
          buffer: createMeshBasePayload(19),
          tile: {} as Tile,
          extension: "b3dm",
          url: "mesh.b3dm",
          signal: caller.signal,
        },
        fetchSource,
        vi.fn()
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(parseTile).toHaveBeenCalledOnce();
  });
});
