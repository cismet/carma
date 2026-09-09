import type { Tile } from "3d-tiles-renderer/core";
import { Material, Mesh, Texture, type Object3D } from "three";
import type {
  GLTFLoaderPlugin,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { createDeferredGltfMaterials } from "./gltf-deferred-materials";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

type Deferred = ReturnType<typeof createDeferredGltfMaterials>;
type Entry = {
  materials: Deferred | null;
  scene: Object3D | null;
  pending: boolean;
  attempts: number;
  retryAt: number;
};
// Pinned 3d-tiles-renderer adapter: parseTile constructs GLTFParser synchronously
// before its first await. Never keep a global role alive across asynchronous work.
type NativeRenderer = RuntimeTilesRenderer & {
  parseTile: (
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ) => Promise<void>;
  _bytesUsed: WeakMap<Tile, number>;
};

/** Retains native geometry/RTC/metadata; only opaque material creation is deferred.
 * Decision: TILE-OFFSCREEN-TEXTURES-20260909 in engines/maplibre/README.md.
 */
export class TilesetDeferredMaterialsPlugin {
  readonly name = "CARMA_DEFERRED_TILE_MATERIALS";
  private tiles!: NativeRenderer;
  private parsing: Entry | null = null;
  private readonly entries = new Map<Tile, Entry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = 0;
  private disposed = false;

  constructor(
    private readonly options: {
      inView: (tile: Tile) => boolean;
      onPromoted: (tile: Tile, scene: Object3D) => void;
      onError: (tile: Tile, error: unknown) => void;
    }
  ) {}

  init(tiles: RuntimeTilesRenderer) {
    this.tiles = tiles as NativeRenderer;
  }

  createGltfPlugin = (parser: GLTFParser): GLTFLoaderPlugin => {
    const entry = this.parsing;
    if (!entry) return { name: "CARMA_DEFER_OPAQUE_MATERIALS" };
    entry.materials = createDeferredGltfMaterials(parser);
    return entry.materials.plugin;
  };

  parseTile(
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ) {
    if (
      this.disposed ||
      this.options.inView(tile) ||
      !/^(b3dm|glb|gltf)$/i.test(extension)
    )
      return null;
    const entry: Entry = {
      materials: null,
      scene: null,
      pending: false,
      attempts: 0,
      retryAt: 0,
    };
    this.release(tile);
    this.entries.set(tile, entry);
    const previous = this.parsing;
    this.parsing = entry;
    try {
      return this.tiles.parseTile(buffer, tile, extension, url, signal).then(
        () => {
          if (signal.aborted || this.disposed) this.release(tile);
        },
        (error) => {
          this.release(tile);
          throw error;
        }
      );
    } finally {
      this.parsing = previous;
    }
  }

  processTileModel(scene: Object3D, tile: Tile) {
    const entry = this.entries.get(tile);
    if (!entry?.materials) return;
    entry.scene = scene;
    // If the observer moved while geometry decoded, finish normal appearance in
    // the native parse transaction. It cannot be published with placeholders.
    if (this.options.inView(tile)) return entry.materials.promote();
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = false;
      }
    });
  }

  isReady = (tile: Tile) =>
    !this.entries.has(tile) ||
    this.entries.get(tile)?.materials?.isReady() === true;

  update() {
    if (this.disposed || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.promoteVisible();
    }, 0);
  }

  private promoteVisible() {
    let retryAt = Infinity;
    for (const [tile, entry] of this.entries) {
      if (this.running >= 2) break;
      if (
        entry.pending ||
        !entry.scene ||
        entry.materials?.isReady() ||
        !this.options.inView(tile) ||
        (tile as RuntimeTile).engineData?.scene !== entry.scene
      )
        continue;
      if (entry.retryAt > performance.now()) {
        retryAt = Math.min(retryAt, entry.retryAt);
        continue;
      }
      entry.pending = true;
      this.running++;
      void entry
        .materials!.promote()
        .then(() => {
          if (this.disposed || this.entries.get(tile) !== entry) return;
          const engine = (tile as RuntimeTile).engineData!;
          const materials = new Set<Material>(),
            textures = new Set<Texture>();
          entry.scene!.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            for (const material of [object.material].flat()) {
              materials.add(material);
              for (const value of Object.values(material))
                if (value instanceof Texture) textures.add(value);
            }
          });
          // Native disposal must own the newly created resources, not only the
          // original placeholders. Invalidate its memoized byte estimate as well.
          engine.materials = [...materials];
          engine.textures = [...textures];
          this.options.onPromoted(tile, entry.scene!);
          this.tiles._bytesUsed.delete(tile);
          this.tiles.lruCache.setMemoryUsage(
            tile,
            this.tiles.calculateBytesUsed(tile, entry.scene!) ?? 0
          );
          this.entries.delete(tile);
        })
        .catch((error) => {
          if (this.disposed || this.entries.get(tile) !== entry) return;
          entry.attempts++;
          entry.retryAt =
            performance.now() +
            Math.min(30_000, 1000 * 2 ** Math.min(entry.attempts, 5));
          this.options.onError(tile, error);
        })
        .finally(() => {
          entry.pending = false;
          this.running--;
          this.update();
        });
    }
    if (Number.isFinite(retryAt) && this.timer === null)
      this.timer = setTimeout(() => {
        this.timer = null;
        this.promoteVisible();
      }, Math.max(1, retryAt - performance.now()));
  }

  release(tile: Tile) {
    this.entries.get(tile)?.materials?.dispose();
    this.entries.delete(tile);
  }
  disposeTile(tile: Tile) {
    this.release(tile);
  }
  dispose() {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    for (const tile of this.entries.keys()) this.release(tile);
  }
}
