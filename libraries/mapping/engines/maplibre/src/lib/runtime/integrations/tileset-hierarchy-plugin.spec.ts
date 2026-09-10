import { afterEach, describe, expect, it, vi } from "vitest";
import {
  packTilesetHierarchyPage,
  type TilesetDescriptor,
} from "../../core/tileset-hierarchy-page";
import {
  HIERARCHY_OPERATION,
  HIERARCHY_RESULT,
  type HierarchyRequest,
  type HierarchyResponse,
} from "../../core/tileset-hierarchy-protocol";
import { TilesetHierarchyPlugin } from "./tileset-hierarchy-plugin";

class MockWorker {
  static latest: MockWorker;
  onmessage?: (event: { data: HierarchyResponse }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  messages: HierarchyRequest[] = [];
  terminate = vi.fn();
  postMessage = (message: HierarchyRequest) => {
    this.messages.push(message);
  };
  constructor() {
    MockWorker.latest = this;
  }
  reply(response: HierarchyResponse) {
    this.onmessage?.({ data: response });
  }
}
const document: TilesetDescriptor = {
  asset: { version: "1.0" },
  root: { boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 0 },
};
const rootUrl = "https://tiles.test/root.json";
const setup = () => {
  vi.stubGlobal("Worker", MockWorker);
  const fetch = vi.fn(async () => new Response(JSON.stringify(document)));
  vi.stubGlobal("fetch", fetch);
  return { plugin: new TilesetHierarchyPlugin(rootUrl), fetch };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native hierarchy worker adapter", () => {
  it("restores descriptors without JSON refetch and preserves headers", async () => {
    const f = setup();
    const pending = f.plugin.fetchData(rootUrl, {
      headers: { Accept: "application/json" },
    });
    const worker = MockWorker.latest;
    expect(worker.messages[0]).toMatchObject({
      rootUrl,
      url: rootUrl,
      options: { headers: [["accept", "application/json"]] },
    });
    worker.reply({
      id: 1,
      kind: HIERARCHY_RESULT.page,
      page: packTilesetHierarchyPage(document),
      cached: true,
    });
    expect(await pending).toEqual(document);
    expect(f.fetch).not.toHaveBeenCalled();
    f.plugin.dispose();
  });
  it("leaves binary payloads to the normal loader", () => {
    const f = setup();
    expect(f.plugin.fetchData("https://tiles.test/a.b3dm", {})).toBeNull();
    f.plugin.dispose();
  });
  it("cancels one job without aborting sibling requests or fetching a fallback", async () => {
    const f = setup(),
      abort = new AbortController();
    const first = f.plugin.fetchData(rootUrl, { signal: abort.signal })!;
    const second = f.plugin.fetchData("https://tiles.test/child.json", {})!;
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejected;
    MockWorker.latest.reply({
      id: 2,
      kind: HIERARCHY_RESULT.document,
      document,
    });
    expect(await second).toEqual(document);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(MockWorker.latest.messages).toContainEqual({
      id: 1,
      operation: HIERARCHY_OPERATION.cancel,
    });
    f.plugin.dispose();
  });
  it("invalidates malformed cached pages and uses the native HTTP fallback", async () => {
    const f = setup();
    const pending = f.plugin.fetchData(rootUrl, {});
    const page = packTilesetHierarchyPage(document);
    page.parents[0] = 0;
    MockWorker.latest.reply({
      id: 1,
      kind: HIERARCHY_RESULT.page,
      page,
      cached: true,
    });
    expect(await pending).toBeInstanceOf(Response);
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(MockWorker.latest.messages.at(-1)).toMatchObject({
      operation: HIERARCHY_OPERATION.invalidate,
      url: rootUrl,
    });
    f.plugin.dispose();
  });
  it("disables a crashed worker and keeps the normal path available", async () => {
    const f = setup();
    const pending = f.plugin.fetchData(rootUrl, {});
    const worker = MockWorker.latest;
    worker.onerror!();
    expect(await pending).toBeInstanceOf(Response);
    expect(await f.plugin.fetchData(rootUrl, {})).toBeInstanceOf(Response);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(worker.terminate).toHaveBeenCalledOnce();
    f.plugin.dispose();
  });
  it("settles all jobs on disposal and ignores late messages", async () => {
    const f = setup();
    const pending = f.plugin.fetchData(rootUrl, {})!;
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    f.plugin.dispose();
    await rejected;
    MockWorker.latest.reply({
      id: 1,
      kind: HIERARCHY_RESULT.document,
      document,
    });
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
