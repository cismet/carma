import { BatchTable, FeatureTable, type Tile } from "3d-tiles-renderer/core";
import { Group, type Matrix4, type Object3D } from "three";
import type {
  GLTF,
  GLTFLoader,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { fetchTileResponse } from "./fetch-tile-response";
import { runMeshPreparationTask } from "./mesh-preparation-client";
import type { PreparedBinaryTile } from "./mesh-preparation-task";
import type { MeshBaseNativeRenderer } from "./mesh-base-cache-payload";

// Private token: the native renderer still owns transforms, model hooks,
// publication, coverage and disposal. Only container preparation is replaced.
const marker = 0x3170776d;
type NativeRenderer = MeshBaseNativeRenderer & { _upRotationMatrix: Matrix4 };

export interface Gltf1UpgradePluginOptions {
  beforeRequest?: (signal?: AbortSignal | null) => Promise<void>;
  requestTimeoutMs?: number;
  onResponse?: (url: string, response: Response) => void;
  onBody?: (url: string, decodedBytes: number) => void;
  getPriority?: (tile: Tile) => number;
  prepareModel?: (
    scene: Object3D,
    options: { signal: AbortSignal; getPriority: () => number; tile: Tile }
  ) => Promise<void>;
}

/** Worker container preparation for modern tiles and the legacy glTF1 mesh.
 * Uses the configured native GLTFLoader, including its extensions/materials.
 */
export class Gltf1UpgradePlugin {
  name = "GLTF1_UPGRADE_PLUGIN";
  private tiles?: NativeRenderer;
  private readonly lifetime = new AbortController();
  private readonly signals = new WeakMap<Tile, AbortSignal>();
  private readonly prepared = new Map<number, PreparedBinaryTile>();
  private readonly binaries = new WeakMap<object, ArrayBuffer>();
  private nextId = 0;

  constructor(private readonly options: Gltf1UpgradePluginOptions = {}) {}

  init(tiles: NativeRenderer) {
    this.tiles = tiles;
  }

  async fetchData(
    url: string | URL,
    options: RequestInit
  ): Promise<Response | ArrayBuffer> {
    const signal = options.signal
      ? AbortSignal.any([options.signal, this.lifetime.signal])
      : this.lifetime.signal;
    if (this.options.beforeRequest) await this.options.beforeRequest(signal);
    signal.throwIfAborted();
    const response = await fetchTileResponse(
      url,
      { ...options, signal },
      this.options.requestTimeoutMs ?? 30_000
    );
    this.options.onResponse?.(String(url), response);
    if (!/\.b3dm(\?|$)/.test(String(url)) || !response.ok) return response;
    const buffer = await response.arrayBuffer();
    signal.throwIfAborted();
    this.options.onBody?.(String(url), buffer.byteLength);
    // Do not hold a download slot while preparing the payload. Native parsing
    // receives the original body; parseTile transfers its ownership to a worker.
    return buffer;
  }

  parseTile(
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ): Promise<void> | null {
    const lifetime = AbortSignal.any([signal, this.lifetime.signal]);
    this.signals.set(tile, lifetime);
    if (buffer.byteLength < 4) return null;
    const magic = new DataView(buffer).getUint32(0, true);
    if (magic !== 0x6d643362 && magic !== 0x46546c67) return null;
    return (async () => {
      lifetime.throwIfAborted();
      const result = await runMeshPreparationTask(
        { kind: "binary", buffer },
        {
          signal: lifetime,
          getPriority: () => this.options.getPriority?.(tile) ?? 0,
        }
      );
      lifetime.throwIfAborted();
      if (result.kind !== "binary")
        throw new Error("Unexpected prepared mesh result");
      const id = ++this.nextId;
      const token = new ArrayBuffer(8);
      const view = new DataView(token);
      view.setUint32(0, marker, true);
      view.setUint32(4, id, true);
      this.prepared.set(id, result.data);
      try {
        if (!this.tiles)
          throw new Error("Mesh preparation renderer unavailable");
        // Re-enter plugin dispatch with the opaque token: the deferred-material
        // plugin establishes its synchronous parser context here. Our token is
        // not a binary container, so it cannot enqueue preparation recursively.
        await this.tiles.invokeOnePlugin((plugin: MeshBaseNativeRenderer) =>
          plugin.parseTile?.(token, tile, extension, url, lifetime)
        );
      } finally {
        this.prepared.delete(id);
      }
    })();
  }

  // GLTFLoader's supported plugin factory runs before dependencies are read.
  // Supply its embedded buffer directly instead of re-parsing a complete GLB,
  // preserving native buffer-view, Draco, image and material loaders.
  readonly createGltfPlugin = (parser: GLTFParser) => {
    const binary = this.binaries.get(parser.json);
    if (binary) {
      this.binaries.delete(parser.json);
      const loadBuffer = parser.loadBuffer.bind(parser);
      parser.loadBuffer = (index) =>
        index === 0 && !parser.json.buffers?.[index]?.uri
          ? Promise.resolve(binary)
          : loadBuffer(index);
    }
    return { name: "CARMA_PREPARED_BINARY" };
  };

  parseToMesh(
    buffer: ArrayBuffer,
    _tile: Tile,
    _extension: string,
    url: string,
    signal: AbortSignal
  ): Promise<GLTF> | null {
    if (
      buffer.byteLength !== 8 ||
      new DataView(buffer).getUint32(0, true) !== marker
    )
      return null;
    const id = new DataView(buffer).getUint32(4, true);
    const data = this.prepared.get(id);
    if (!data || !this.tiles) throw new Error("Prepared mesh payload expired");
    this.prepared.delete(id);
    signal.throwIfAborted();
    const tiles = this.tiles;
    const loader = tiles.manager.getHandler("path.gltf") as GLTFLoader | null;
    if (!loader) throw new Error("Configured glTF loader unavailable");
    const fetchOptions = tiles.fetchOptions;
    if (fetchOptions.credentials === "include" && fetchOptions.mode === "cors")
      loader.setCrossOrigin("use-credentials");
    loader.setWithCredentials(fetchOptions.credentials === "include");
    const requestHeaders: Record<string, string> = {};
    new Headers(fetchOptions.headers).forEach((value, key) => {
      requestHeaders[key] = value;
    });
    loader.setRequestHeader(requestHeaders);
    const workingPath = url.replace(/[\\/][^\\/]+$/, "") + "/";
    const resourcePath =
      data.kind === "b3dm"
        ? workingPath
        : loader.resourcePath || loader.path || workingPath;
    const path =
      resourcePath && !/[\\/]$/.test(resourcePath)
        ? resourcePath + "/"
        : resourcePath;
    if (data.binary) this.binaries.set(data.json, data.binary);
    // Object input is supported by the installed native loader; its public
    // declaration lists only string/ArrayBuffer. Pin behavior in parity tests.
    const parse = loader.parseAsync as unknown as (
      json: object,
      path: string
    ) => Promise<GLTF>;
    return parse
      .call(loader, data.json, path)
      .then((model) => {
        model.scene ??= new Group();
        const { scene } = model;
        if (data.kind === "b3dm") {
          const ft = data.featureTable!,
            bt = data.batchTable!;
          const featureTable = new FeatureTable(
            ft.buffer,
            0,
            ft.jsonByteLength,
            ft.binaryByteLength
          );
          const batchLength = featureTable.getData("BATCH_LENGTH", 1);
          if (batchLength != null && typeof batchLength !== "number") {
            throw new Error("Invalid B3DM batch length");
          }
          const batchTable = new BatchTable(
            bt.buffer,
            typeof batchLength === "number" ? batchLength : 0,
            0,
            bt.jsonByteLength,
            bt.binaryByteLength
          );
          const rtc = featureTable.getData("RTC_CENTER", 1, "FLOAT", "VEC3");
          if (rtc != null) {
            if (!Array.isArray(rtc) && !(rtc instanceof Float32Array)) {
              throw new Error("Invalid B3DM RTC center");
            }
            scene.position.x += rtc[0];
            scene.position.y += rtc[1];
            scene.position.z += rtc[2];
          }
          Object.assign(model, { featureTable, batchTable });
          Object.assign(scene, { featureTable, batchTable });
        }
        scene.updateMatrix();
        scene.matrix
          .multiply(tiles._upRotationMatrix)
          .decompose(scene.position, scene.quaternion, scene.scale);
        // Native parseTile applies tileTransform and handles late cancellation.
        return model;
      })
      .finally(() => this.binaries.delete(data.json));
  }

  async processTileModel(
    scene: Object3D,
    tile: Tile,
    currentSignal?: AbortSignal
  ) {
    // A restored cache tile bypasses parseTile. Refresh its lifetime before any
    // await, so all native model hooks share this request rather than an old abort.
    if (currentSignal) {
      this.signals.set(
        tile,
        AbortSignal.any([currentSignal, this.lifetime.signal])
      );
    }
    const signal = this.signals.get(tile) ?? this.lifetime.signal;
    try {
      await this.options.prepareModel?.(scene, {
        signal,
        tile,
        getPriority: () => this.options.getPriority?.(tile) ?? 0,
      });
    } catch (error) {
      // Let native parseTile dispose late model results on ordinary abort.
      if (!signal.aborted) throw error;
    }
  }

  dispose() {
    this.lifetime.abort(
      new DOMException("Mesh preparation disposed", "AbortError")
    );
    this.prepared.clear();
    this.tiles = undefined;
  }
}
