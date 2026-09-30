import { afterEach, describe, expect, it, vi } from "vitest";
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
