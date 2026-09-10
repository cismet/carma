import type { Tile } from "3d-tiles-renderer/core";
import { BufferGeometry, Group, Mesh, MeshBasicMaterial, Texture } from "three";
import type {
  GLTF,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";

const fixture = () => {
  const inView = new Set<Tile>();
  const onPromoted = vi.fn(),
    onError = vi.fn();
  const plugin = new TilesetDeferredMaterialsPlugin({
    inView: (tile) => inView.has(tile),
    onPromoted,
    onError,
  });
  const parsers: { parser: GLTFParser; load: ReturnType<typeof vi.fn> }[] = [];
  const tiles = {
    _bytesUsed: new WeakMap(),
    lruCache: { setMemoryUsage: vi.fn() },
    calculateBytesUsed: () => 1024,
    parseTile: async (_buffer: ArrayBuffer, tile: RuntimeTile) => {
      const load = vi.fn(
        async () => new MeshBasicMaterial({ map: new Texture() })
      );
      const parser = {
        json: { materials: [{}] },
        associations: new Map(),
        loadMaterial: load,
        assignFinalMaterial: vi.fn(),
      } as unknown as GLTFParser;
      parsers.push({ parser, load });
      const gltf = plugin.createGltfPlugin(parser);
      const material =
        (await gltf.loadMaterial?.(0)) ?? new MeshBasicMaterial();
      const scene = new Group();
      scene.add(new Mesh(new BufferGeometry(), material));
      await gltf.afterRoot?.({ scene } as GLTF);
      await plugin.processTileModel(scene, tile);
      tile.engineData = { scene, materials: [material], textures: [] };
    },
  };
  plugin.init(tiles as unknown as RuntimeTilesRenderer);
  const tile = () => ({ engineData: {} } as RuntimeTile);
  const parse = (tile: Tile) =>
    plugin.parseTile(
      new ArrayBuffer(0),
      tile,
      "b3dm",
      "https://tile.test/a.b3dm",
      new AbortController().signal
    );
  return { plugin, inView, onPromoted, onError, parsers, tiles, tile, parse };
};
afterEach(() => vi.useRealTimers());
describe("geometry-only tile material lifecycle", () => {
  it("never changes the ordinary visible payload path", () => {
    const f = fixture(),
      tile = f.tile();
    f.inView.add(tile);
    expect(f.parse(tile)).toBeNull();
    expect(f.plugin.isReady(tile)).toBe(true);
    f.plugin.dispose();
  });
  it("isolates parser roles across parallel jobs and does not colour-render an offscreen caster", async () => {
    const f = fixture(),
      a = f.tile(),
      b = f.tile();
    await Promise.all([f.parse(a), f.parse(b)]);
    expect(f.parsers).toHaveLength(2);
    expect(f.parsers.every((item) => item.load.mock.calls.length === 0)).toBe(
      true
    );
    expect(f.plugin.isReady(a)).toBe(false);
    expect(f.plugin.isReady(b)).toBe(false);
    const mesh = a.engineData!.scene!.children[0] as Mesh;
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
    expect((mesh.material as MeshBasicMaterial).colorWrite).toBe(false);
    f.plugin.dispose();
  });
  it("promotes once outside the render task and registers new resources with native disposal and LRU", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      tile = f.tile();
    await f.parse(tile);
    const geometry = (tile.engineData!.scene!.children[0] as Mesh).geometry;
    f.inView.add(tile);
    f.plugin.update();
    f.plugin.update();
    expect(f.onPromoted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onPromoted).toHaveBeenCalledOnce();
    expect(f.plugin.isReady(tile)).toBe(true);
    expect(tile.engineData!.textures).toHaveLength(1);
    expect(f.tiles.lruCache.setMemoryUsage).toHaveBeenCalledWith(tile, 1024);
    expect((tile.engineData!.scene!.children[0] as Mesh).geometry).toBe(
      geometry
    );
    f.plugin.dispose();
  });
  it("does not promote queued tiles after they leave the frustum or get evicted", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      tile = f.tile();
    await f.parse(tile);
    f.inView.add(tile);
    f.plugin.update();
    f.inView.clear();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onPromoted).not.toHaveBeenCalled();
    f.plugin.disposeTile(tile);
    f.inView.add(tile);
    f.plugin.update();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.parsers[0].load).not.toHaveBeenCalled();
    f.plugin.dispose();
  });
});
