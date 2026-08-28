import { afterEach, describe, expect, it, vi } from "vitest";

import { Gltf1UpgradePlugin, upgradeB3dmGltf1 } from "./gltf1-upgrade-plugin";

const encoder = new TextEncoder();

const buildB3dmWithGltf1 = () => {
  const gltf = {
    asset: { version: "1.0" },
    buffers: { binary_glTF: { byteLength: 4 } },
    bufferViews: {
      vertices: { buffer: "binary_glTF", byteOffset: 0, byteLength: 4 },
    },
    accessors: {
      position: {
        bufferView: "vertices",
        componentType: 5126,
        count: 1,
        type: "SCALAR",
        min: [0],
        max: [1],
      },
    },
    images: {
      image: {
        extensions: {
          KHR_binary_glTF: {
            bufferView: "vertices",
            mimeType: "image/png",
          },
        },
      },
    },
    samplers: { sampler: { wrapS: 10497, wrapT: 10497 } },
    textures: { texture: { sampler: "sampler", source: "image" } },
    materials: { material: { values: { diffuse: "texture" } } },
    meshes: {
      mesh: {
        primitives: [
          {
            attributes: { POSITION: "position" },
            material: "material",
          },
        ],
      },
    },
    nodes: { node: { meshes: ["mesh"] } },
    scenes: { scene: { nodes: ["node"] } },
    scene: "scene",
    extensions: { CESIUM_RTC: { center: [1, 2, 3] } },
  };
  const rawJson = encoder.encode(JSON.stringify(gltf));
  const jsonLength = rawJson.length + ((4 - (rawJson.length % 4)) % 4);
  const glb = new Uint8Array(20 + jsonLength + 4);
  const glbView = new DataView(glb.buffer);
  glbView.setUint32(0, 0x46546c67, true);
  glbView.setUint32(4, 1, true);
  glbView.setUint32(8, glb.length, true);
  glbView.setUint32(12, jsonLength, true);
  glbView.setUint32(16, 0, true);
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(rawJson, 20);
  glb.set([1, 2, 3, 4], 20 + jsonLength);

  const b3dm = new Uint8Array(28 + glb.length);
  const b3dmView = new DataView(b3dm.buffer);
  b3dmView.setUint32(0, 0x6d643362, true);
  b3dmView.setUint32(4, 1, true);
  b3dmView.setUint32(8, b3dm.length, true);
  b3dm.set(glb, 28);
  return b3dm.buffer;
};

const readGltf2Json = (b3dm: ArrayBuffer) => {
  const bytes = new Uint8Array(b3dm);
  const view = new DataView(b3dm);
  const jsonLength = view.getUint32(28 + 12, true);
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(28 + 20, 28 + 20 + jsonLength))
  ) as Record<string, unknown>;
};

describe("glTF 1 b3dm upgrade", () => {
  afterEach(() => vi.restoreAllMocks());

  it("converts dictionaries, binary images and scene references to glTF 2", () => {
    const upgraded = upgradeB3dmGltf1(buildB3dmWithGltf1());

    expect(upgraded).not.toBeNull();
    const json = readGltf2Json(upgraded!);
    expect(json.asset).toMatchObject({ version: "2.0" });
    expect(json.buffers).toEqual([{ byteLength: 4 }]);
    expect(json.images).toEqual([{ bufferView: 0, mimeType: "image/png" }]);
    expect(json.extensionsUsed).toEqual([
      "KHR_materials_unlit",
      "CESIUM_RTC",
    ]);
    expect(json.scene).toBe(0);
  });

  it("ignores non-b3dm data", () => {
    expect(upgradeB3dmGltf1(new ArrayBuffer(32))).toBeNull();
  });

  it("upgrades successful b3dm fetches and passes other responses through", async () => {
    const source = buildB3dmWithGltf1();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(source, { status: 200 }))
      .mockResolvedValueOnce(new Response("plain", { status: 200 }));
    const plugin = new Gltf1UpgradePlugin();

    const upgraded = await plugin.fetchData("tile.b3dm", {});
    const plain = await plugin.fetchData("tile.json", {});

    expect(new DataView(await upgraded.arrayBuffer()).getUint32(28 + 4, true)).toBe(
      2
    );
    expect(await plain.text()).toBe("plain");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
