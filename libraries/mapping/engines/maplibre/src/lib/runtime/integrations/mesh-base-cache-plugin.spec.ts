import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Matrix4 } from "three";
import { snapshotMeshBaseRenderRecord } from "../../core/mesh-base-render-record";
import {
  meshBaseCacheIdentity,
  MESH_BASE_RENDER_FORMAT,
  type MeshBaseCacheRequest,
  type MeshBaseCacheResponse,
} from "../../core/mesh-base-cache-protocol";
import { MeshBaseCachePlugin } from "./mesh-base-cache-plugin";

vi.mock("./three-tiles-runtime-vendor", () => ({
  resolveTileContentUrl: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
const createPlugin = () =>
  new MeshBaseCachePlugin({
    sourceUrl: "https://mesh.test/tileset.json",
    buildId: "test",
    extentError: () => 10,
    memoryBudget: () => 1024,
    canPrepare: () => false,
    onConfirmed: vi.fn(),
    fetchSource: vi.fn(),
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
  const installWorker = (mismatch = false) => {
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
            contentUrl: data.url,
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
});
