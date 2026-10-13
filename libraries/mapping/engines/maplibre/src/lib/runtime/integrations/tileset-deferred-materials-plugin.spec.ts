import type { Tile } from "3d-tiles-renderer/core";
import { BufferGeometry, Group, Mesh, MeshBasicMaterial, Texture } from "three";
import type {
  GLTF,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
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
  const parsers: {
    parser: GLTFParser;
    load: Mock<[], Promise<MeshBasicMaterial>>;
  }[] = [];
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
afterEach(() => {
  vi.useRealTimers();
});
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
  it("accounts for retained original textures before promotion applies clay styling", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      tile = f.tile();
    await f.parse(tile);
    const mesh = tile.engineData!.scene!.children[0] as Mesh;
    const texture = new Texture();
    const original = new MeshBasicMaterial({ map: texture });
    const clay = new MeshBasicMaterial();
    f.parsers[0].load.mockResolvedValueOnce(original);
    f.tiles.calculateBytesUsed = () =>
      (mesh.material as MeshBasicMaterial).map ? 8192 : 1024;
    f.onPromoted.mockImplementation(() => {
      mesh.material = clay;
    });
    f.inView.add(tile);
    f.plugin.update();
    await vi.advanceTimersByTimeAsync(10);
    expect(mesh.material).toBe(clay);
    expect(tile.engineData!.materials).toEqual([original]);
    expect(tile.engineData!.textures).toEqual([texture]);
    expect(f.tiles.lruCache.setMemoryUsage).toHaveBeenCalledWith(tile, 8192);
    f.plugin.dispose();
  });
  it("keeps promotion slots occupied until asynchronous cache and styling callbacks finish", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      tiles = [f.tile(), f.tile(), f.tile()];
    await Promise.all(tiles.map(f.parse));
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.onPromoted.mockImplementation(() => gate);
    tiles.forEach((tile) => f.inView.add(tile));
    f.plugin.update();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onPromoted).toHaveBeenCalledTimes(2);
    expect(f.plugin.isReady(tiles[0])).toBe(false);
    expect(f.plugin.isReady(tiles[1])).toBe(false);
    expect(f.parsers[2].load).not.toHaveBeenCalled();
    f.plugin.update();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onPromoted).toHaveBeenCalledTimes(2);
    finish();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onPromoted).toHaveBeenCalledTimes(3);
    expect(tiles.every((tile) => f.plugin.isReady(tile))).toBe(true);
    f.plugin.dispose();
  });

  it("ignores a late callback rejection after disposal without publishing or retrying", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      tile = f.tile();
    await f.parse(tile);
    let fail!: (error: Error) => void;
    const gate = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    f.onPromoted.mockImplementation(() => gate);
    f.inView.add(tile);
    f.plugin.update();
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onPromoted).toHaveBeenCalledOnce();
    f.plugin.dispose();
    fail(new Error("late cache failure"));
    await vi.advanceTimersByTimeAsync(10);
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.onPromoted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
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
