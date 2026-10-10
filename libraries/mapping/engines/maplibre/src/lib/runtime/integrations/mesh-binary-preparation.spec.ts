import { describe, expect, it, vi } from "vitest";
import { TilesRenderer } from "3d-tiles-renderer";
import { GLTFExtensionsPlugin } from "3d-tiles-renderer/plugins";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import type { Tile } from "3d-tiles-renderer/core";
import { Matrix4, Mesh, Vector3, Material } from "three";
import { prepareMeshBinary } from "../../core/mesh-binary-preparation";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";
import { createMeshBasePayload } from "./mesh-base-cache-payload";
import {
  meshPreparationTaskTransfers,
  meshPreparationResultTransfers,
} from "./mesh-preparation-task";

type TestRenderer = TilesRenderer & { disposeTile: (tile: Tile) => void };

const jsonBytes = (object: object) => {
  const source = new TextEncoder().encode(JSON.stringify(object));
  const padded = new Uint8Array(Math.ceil(source.length / 4) * 4).fill(32);
  padded.set(source);
  return padded;
};
const glb = (rtc = true) => {
  const positions = new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]);
  const json = jsonBytes({
    asset: { version: "2.0" },
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [2, 3, 0],
      },
    ],
    materials: [
      {
        name: "wall",
        pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] },
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0, translation: [7, 8, 9] }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    ...(rtc
      ? {
          extensionsUsed: ["CESIUM_RTC"],
          extensions: { CESIUM_RTC: { center: [11, 22, 33] } },
        }
      : {}),
  });
  const out = new Uint8Array(28 + json.length + positions.byteLength),
    view = new DataView(out.buffer);
  [0x46546c67, 2, out.length, json.length, 0x4e4f534a].forEach((value, i) =>
    view.setUint32(i * 4, value, true)
  );
  out.set(json, 20);
  view.setUint32(20 + json.length, positions.byteLength, true);
  view.setUint32(24 + json.length, 0x004e4942, true);
  out.set(new Uint8Array(positions.buffer), 28 + json.length);
  return out.buffer;
};
const b3dm = () => {
  const binary = glb(),
    feature = jsonBytes({ BATCH_LENGTH: 1, RTC_CENTER: [100, 200, 300] }),
    batch = jsonBytes({ name: ["house"] });
  const out = new Uint8Array(
      28 + feature.length + batch.length + binary.byteLength
    ),
    view = new DataView(out.buffer);
  [0x6d643362, 1, out.length, feature.length, 0, batch.length, 0].forEach(
    (value, i) => view.setUint32(i * 4, value, true)
  );
  out.set(feature, 28);
  out.set(batch, 28 + feature.length);
  out.set(new Uint8Array(binary), 28 + feature.length + batch.length);
  return out.buffer;
};

describe("worker mesh binary preparation", () => {
  it("preserves embedded bytes and JSON without rebuilding the container", () => {
    const result = prepareMeshBinary(glb());
    expect(result.kind).toBe("glb");
    expect(result.json.asset).toEqual({ version: "2.0" });
    expect([...new Float32Array(result.binary!)]).toEqual([
      0, 0, 0, 2, 0, 0, 0, 3, 0,
    ]);
    const transfers = meshPreparationResultTransfers({
      kind: "binary",
      data: result,
    });
    expect(transfers).toEqual([result.binary]);
  });

  it("retains feature and batch tables as independently transferable bytes", () => {
    const result = prepareMeshBinary(b3dm());
    expect(result.kind).toBe("b3dm");
    expect(new TextDecoder().decode(result.featureTable!.buffer)).toContain(
      '"RTC_CENTER":[100,200,300]'
    );
    expect(new TextDecoder().decode(result.batchTable!.buffer)).toContain(
      '"house"'
    );
    expect(
      meshPreparationResultTransfers({ kind: "binary", data: result })
    ).toHaveLength(3);
  });

  it("deduplicates transfer lists and rejects shared buffers", () => {
    const buffer = new ArrayBuffer(128);
    const part = {
      positions: new Float64Array(buffer, 0, 6),
      featureIds: new Float64Array(buffer, 48, 2),
      indices: new Uint32Array(buffer, 64, 3),
    };
    expect(
      meshPreparationTaskTransfers({ kind: "surfaces", parts: [part] })
    ).toEqual([buffer]);
    if (typeof SharedArrayBuffer !== "undefined")
      expect(() =>
        meshPreparationTaskTransfers({
          kind: "binary",
          buffer: new SharedArrayBuffer(32) as ArrayBuffer,
        })
      ).toThrow("privately owned");
  });

  it.each(["length", "chunk", "truncated", "nonbinary"])(
    "rejects malformed %s instead of publishing partial data",
    (kind) => {
      const bytes = glb(),
        view = new DataView(bytes);
      if (kind === "length") view.setUint32(8, bytes.byteLength + 4, true);
      if (kind === "chunk") view.setUint32(12, bytes.byteLength, true);
      if (kind === "nonbinary") view.setUint32(0, 0, true);
      expect(() =>
        prepareMeshBinary(kind === "truncated" ? bytes.slice(0, 8) : bytes)
      ).toThrow("Invalid mesh binary");
    }
  );

  it.each(["b3dm", "glb"] as const)(
    "matches native %s geometry, RTC, up-axis, materials, tables and tile transform",
    async (kind) => {
      const native = new TilesRenderer() as TestRenderer,
        prepared = new TilesRenderer() as TestRenderer;
      const plugin = new Gltf1UpgradePlugin();
      prepared.registerPlugin(plugin);
      const loaderPlugins = [
        new GLTFExtensionsPlugin({ autoDispose: false }),
        new GLTFExtensionsPlugin({
          autoDispose: false,
          plugins: [plugin.createGltfPlugin],
        }),
      ];
      native.registerPlugin(loaderPlugins[0]);
      prepared.registerPlugin(loaderPlugins[1]);
      for (const renderer of [native, prepared])
        (
          renderer as unknown as { _upRotationMatrix: Matrix4 }
        )._upRotationMatrix.makeRotationX(Math.PI / 2);
      const makeTile = () =>
        ({
          traversal: { visible: false, active: false },
          engineData: {
            transform: new Matrix4()
              .makeRotationZ(0.2)
              .setPosition(1000, 2000, 3000),
          },
        } as unknown as RuntimeTile);
      const a = makeTile(),
        b = makeTile();
      const source = kind === "b3dm" ? b3dm() : glb();
      const signal = new AbortController().signal;
      const parse = native as unknown as {
        parseTile: (
          buffer: ArrayBuffer,
          tile: Tile,
          ext: string,
          url: string,
          signal: AbortSignal
        ) => Promise<void>;
      };
      await parse.parseTile(
        source.slice(0),
        a,
        kind,
        `https://example.test/mesh.${kind}`,
        signal
      );
      await plugin.parseTile(
        source,
        b,
        kind,
        `https://example.test/mesh.${kind}`,
        signal
      );
      const left = a.engineData.scene!,
        right = b.engineData.scene!;
      left.updateMatrixWorld(true);
      right.updateMatrixWorld(true);
      expect(right.matrix.elements).toEqual(left.matrix.elements);
      const leftMesh = left.children[0] as Mesh,
        rightMesh = right.children[0] as Mesh;
      expect(rightMesh.matrixWorld.elements).toEqual(
        leftMesh.matrixWorld.elements
      );
      expect([...rightMesh.geometry.getAttribute("position").array]).toEqual([
        ...leftMesh.geometry.getAttribute("position").array,
      ]);
      expect(
        new Vector3()
          .setFromMatrixPosition(rightMesh.matrixWorld)
          .distanceTo(new Vector3().setFromMatrixPosition(leftMesh.matrixWorld))
      ).toBeLessThan(1e-9);
      expect((rightMesh.material as Material).name).toBe(
        (leftMesh.material as Material).name
      );
      if (kind === "b3dm") {
        const metadata = right as typeof right & {
          featureTable: { getData: (name: string) => unknown };
          batchTable: { getDataFromId: (id: number) => unknown };
        };
        expect(metadata.featureTable.getData("BATCH_LENGTH")).toBe(1);
        expect(metadata.batchTable.getDataFromId(0)).toEqual({ name: "house" });
      }
      expect(rightMesh.userData.tile).toBe(b);
      native.disposeTile(a);
      prepared.disposeTile(b);
      plugin.dispose();
    }
  );

  it("preserves the deferred caster-material hook after asynchronous preparation", async () => {
    const tiles = new TilesRenderer() as TestRenderer;
    const plugin = new Gltf1UpgradePlugin();
    const deferred = new TilesetDeferredMaterialsPlugin({
      inView: () => false,
      onPromoted: vi.fn(),
      onError: vi.fn(),
    });
    tiles.registerPlugin(plugin);
    tiles.registerPlugin(deferred);
    tiles.registerPlugin(
      new GLTFExtensionsPlugin({
        autoDispose: false,
        plugins: [plugin.createGltfPlugin, deferred.createGltfPlugin],
      })
    );
    const tile = {
      traversal: { visible: false, active: false },
      engineData: { transform: new Matrix4() },
    } as unknown as RuntimeTile;
    await plugin.parseTile(
      glb(false),
      tile,
      "glb",
      "https://example.test/mesh.glb",
      new AbortController().signal
    );
    const mesh = tile.engineData.scene!.children[0] as Mesh;
    expect((mesh.material as Material).colorWrite).toBe(false);
    expect(mesh.geometry.getAttribute("position").count).toBe(3);
    tiles.disposeTile(tile);
    deferred.dispose();
    plugin.dispose();
  });

  it("awaits model preparation before native scene publication", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prepareModel = vi.fn(() => gate);
    const tiles = new TilesRenderer() as TestRenderer,
      plugin = new Gltf1UpgradePlugin({ prepareModel });
    tiles.registerPlugin(plugin);
    tiles.registerPlugin(
      new GLTFExtensionsPlugin({
        autoDispose: false,
        plugins: [plugin.createGltfPlugin],
      })
    );
    const tile = {
      traversal: { visible: false, active: false },
      engineData: { transform: new Matrix4().makeTranslation(5, 6, 7) },
    } as unknown as RuntimeTile;
    const loading = plugin.parseTile(
      glb(),
      tile,
      "glb",
      "https://example.test/mesh.glb",
      new AbortController().signal
    );
    await vi.waitFor(() => expect(prepareModel).toHaveBeenCalledOnce());
    expect(prepareModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tile })
    );
    expect(tile.engineData.scene).toBeUndefined();
    release();
    await loading;
    expect(tile.engineData.scene).toBeDefined();
    tiles.disposeTile(tile);
    plugin.dispose();
  });

  it("passes cache tokens to their owner rather than preparing them as binary models", () => {
    const plugin = new Gltf1UpgradePlugin();
    expect(
      plugin.parseTile(
        createMeshBasePayload(1),
        {} as Tile,
        "b3dm",
        "mesh.b3dm",
        new AbortController().signal
      )
    ).toBeNull();
    plugin.dispose();
  });
});
