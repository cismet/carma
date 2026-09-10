import {
  createDerivedBufferCache,
  resolveDerivedCacheAssetEpoch,
} from "@carma-commons/utils";
import {
  TILESET_HIERARCHY,
  createTilesetHierarchyPageReader,
  packTilesetHierarchyPage,
  type TilesetDescriptor,
  type TilesetHierarchyPage,
} from "../../core/tileset-hierarchy-page";
import {
  HIERARCHY_OPERATION,
  HIERARCHY_RESULT,
  type HierarchyRequest,
  type HierarchyResponse,
} from "../../core/tileset-hierarchy-protocol";
import { fetchTileResponse } from "./fetch-tile-response";

const scope = self as unknown as {
  location: Location;
  postMessage: (response: HierarchyResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<HierarchyRequest>) => void) | null;
};
const jobs = new Map<number, AbortController>();
let manager: ReturnType<typeof createDerivedBufferCache> | null = null;
let rootRevision: string | null = null;
let initialized: Promise<void> | null = null;
let rootDocument: TilesetDescriptor | null = null;
let sourceUrl: string | null = null;
let readsAvailable = true;
let pendingWriteBytes = 0;

const hash = async (data: BufferSource): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");

const initialize = async (
  request: Extract<HierarchyRequest, { operation: "load" }>,
  signal: AbortSignal
) => {
  sourceUrl = request.rootUrl;
  // Validate only the root each new runtime. Root-only invalidation is an
  // explicit dataset contract: child-only server edits must also change root.
  const response = await fetchTileResponse(request.rootUrl, {
    ...request.options,
    cache: "no-cache",
    signal,
  });
  if (!response.ok) throw new Error(`Tileset root HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  rootRevision = await hash(bytes);
  rootDocument = JSON.parse(
    new TextDecoder().decode(bytes)
  ) as TilesetDescriptor;
  const productionEpoch = resolveDerivedCacheAssetEpoch({
    assetUrl: scope.location.href,
    production: import.meta.env.PROD,
  });
  // In dev, these self-contained codec functions plus constants cover the stored
  // representation. Production uses the complete hashed worker dependency graph.
  const epoch =
    productionEpoch ??
    (import.meta.env.DEV
      ? await hash(
          new TextEncoder().encode(
            [
              JSON.stringify(TILESET_HIERARCHY),
              packTilesetHierarchyPage.toString(),
              createTilesetHierarchyPageReader.toString(),
            ].join("\n")
          )
        )
      : null);
  if (epoch)
    manager = createDerivedBufferCache({
      capacityBytes: 256 * 1024 ** 2,
      producerEpoch: epoch,
    });
};

const optionalRead = async (url: string) => {
  if (!manager || !rootRevision || !readsAvailable) return null;
  const records = manager.register(
    TILESET_HIERARCHY.namespace,
    TILESET_HIERARCHY.version
  );
  const key = JSON.stringify([sourceUrl, rootRevision, url]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Persistence is optional; blocked IndexedDB must never block discovery.
    const record = await Promise.race([
      records.get<TilesetHierarchyPage>(key, { touch: false }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          readsAvailable = false;
          resolve(null);
        }, 32);
      }),
    ]);
    if (!record) return null;
    // Cheap envelope checks only. Full value/link validation is fused with the
    // incremental consumer pass, never a second reconstruction of every node.
    createTilesetHierarchyPageReader(record.value);
    return record.value;
  } catch {
    void records.remove(key).catch(() => {});
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const execute = async (
  request: Extract<HierarchyRequest, { operation: "load" }>,
  signal: AbortSignal
): Promise<HierarchyResponse> => {
  if (sourceUrl && sourceUrl !== request.rootUrl)
    throw new Error("Hierarchy worker cannot mix source roots");
  initialized ??= initialize(request, signal).catch((error) => {
    initialized = null;
    throw error;
  });
  await initialized;
  signal.throwIfAborted();
  // Root JSON has already been fetched for hash validation. Do not request it twice.
  let document = request.url === request.rootUrl ? rootDocument : null;
  if (document) rootDocument = null;
  const cached = document ? null : await optionalRead(request.url);
  signal.throwIfAborted();
  if (cached)
    return {
      id: request.id,
      kind: HIERARCHY_RESULT.page,
      page: cached,
      cached: true,
    };
  const started = performance.now();
  if (!document) {
    const response = await fetchTileResponse(request.url, {
      ...request.options,
      signal,
    });
    if (!response.ok)
      throw new Error(`Tileset metadata HTTP ${response.status}`);
    document = (await response.json()) as TilesetDescriptor;
  }
  signal.throwIfAborted();
  let page: TilesetHierarchyPage;
  try {
    page = packTilesetHierarchyPage(document);
  } catch {
    return { id: request.id, kind: HIERARCHY_RESULT.document, document };
  }
  const recomputeMs = performance.now() - started;
  if (
    manager &&
    rootRevision &&
    pendingWriteBytes + page.bytes <= 64 * 1024 ** 2
  ) {
    // Independent page writes are atomic and incremental: never rewrite all
    // known subtrees, and never wait for cache persistence before publishing.
    const records = manager.register(
      TILESET_HIERARCHY.namespace,
      TILESET_HIERARCHY.version
    );
    pendingWriteBytes += page.bytes;
    void records
      .put(JSON.stringify([sourceUrl, rootRevision, request.url]), page, {
        bytes: page.bytes,
        recomputeMs,
      })
      .catch(() => {})
      .finally(() => {
        pendingWriteBytes -= page.bytes;
      });
  }
  return { id: request.id, kind: HIERARCHY_RESULT.page, page, cached: false };
};

scope.onmessage = ({ data: request }) => {
  if (request.operation === HIERARCHY_OPERATION.cancel) {
    jobs.get(request.id)?.abort();
    return;
  }
  if (request.operation === HIERARCHY_OPERATION.invalidate) {
    if (manager && rootRevision)
      void manager
        .register(TILESET_HIERARCHY.namespace, TILESET_HIERARCHY.version)
        .remove(JSON.stringify([sourceUrl, rootRevision, request.url]))
        .catch(() => {});
    return;
  }
  const controller = new AbortController();
  jobs.set(request.id, controller);
  void execute(request, controller.signal)
    .then((result) => {
      if (!controller.signal.aborted) {
        // Writes above use structured clone asynchronously; transferring their
        // buffers here could detach them before IDB captures the page. Main-thread
        // structured clone copies only compact typed data, not thousands of nodes.
        scope.postMessage(result);
      }
    })
    .catch((error) => {
      if (!controller.signal.aborted)
        scope.postMessage({
          id: request.id,
          kind: HIERARCHY_RESULT.error,
          message: error instanceof Error ? error.message : String(error),
        });
    })
    .finally(() => jobs.delete(request.id));
};
