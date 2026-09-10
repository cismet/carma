import { LoadingManager } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { B3DMLoader, TilesRenderer } from "3d-tiles-renderer";
import { GLTFExtensionsPlugin } from "3d-tiles-renderer/plugins";
import { TilesetDeferredMaterialsPlugin } from "../../src/lib/runtime/integrations/tileset-deferred-materials-plugin.ts";
import { createDeferredGltfMaterials } from "../../src/lib/runtime/integrations/gltf-deferred-materials.ts";
const output = document.getElementById("result");
const urls = [
  ["11542", "460622"],
  ["16964", "734936"],
  ["16961", "734823"],
].map(
  ([folder, id]) =>
    `https://wupp-3d-datax.cismet.de/mesh2024/2/3/${folder}/mesh_${id}.b3dm`
);
const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
const now = () => performance.now();
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[4], p95: sorted[8], raw: values };
};
const parse = async (buffer, url, deferred) => {
  const manager = new LoadingManager();
  const gltf = new GLTFLoader(manager).setDRACOLoader(draco);
  let controller;
  if (deferred)
    gltf.register((parser) => {
      controller = createDeferredGltfMaterials(parser);
      return controller.plugin;
    });
  manager.addHandler(/\.(gltf|glb)$/, gltf);
  const loader = new B3DMLoader(manager);
  loader.workingPath = url.slice(0, url.lastIndexOf("/") + 1);
  const started = now();
  const model = await loader.parse(buffer.slice(0));
  return { model, controller, ms: now() - started };
};
const describe = async (result) => {
  const hashes = [];
  const textures = new Set();
  let vertices = 0,
    triangles = 0,
    textureBytes = 0;
  result.model.scene.updateMatrixWorld(true);
  const meshes = [];
  result.model.scene.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    vertices += geometry.attributes.position.count;
    triangles +=
      (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    for (const attribute of [
      geometry.index,
      ...Object.keys(geometry.attributes)
        .sort()
        .map((key) => geometry.attributes[key]),
    ].filter(Boolean)) {
      const array = attribute.array ?? attribute.data?.array;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
      );
      hashes.push(
        Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("")
      );
    }
    hashes.push(mesh.matrixWorld.elements.join(","));
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
  }
  for (const texture of textures) {
    const image = texture.image;
    textureBytes += (image?.width ?? 0) * (image?.height ?? 0) * 4;
  }
  return {
    geometrySignature: hashes.join(":"),
    vertices,
    triangles,
    textures: textures.size,
    estimatedDecodedRgbaBytes: textureBytes,
  };
};
const dispose = (result) => {
  result.controller?.dispose();
  const textures = new Set();
  const materials = new Set();
  const geometries = new Set();
  result.model.scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material)
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.image?.close?.();
    texture.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
};
const checkNativePromotion = async (buffer, url) => {
  const tiles = new TilesRenderer(url);
  let visible = false,
    resolvePromotion,
    rejectPromotion;
  const completion = new Promise((resolve, reject) => {
    resolvePromotion = resolve;
    rejectPromotion = reject;
  });
  const plugin = new TilesetDeferredMaterialsPlugin({
    inView: () => visible,
    onPromoted: () => resolvePromotion(),
    onError: (_, error) => rejectPromotion(error),
  });
  tiles.registerPlugin(plugin);
  tiles.registerPlugin(
    new GLTFExtensionsPlugin({
      dracoLoader: draco,
      autoDispose: false,
      plugins: [plugin.createGltfPlugin],
    })
  );
  const tile = {
    boundingVolume: { sphere: [0, 0, 0, 100] },
    geometricError: 1,
    content: { uri: url },
    children: [],
  };
  tiles.preprocessNode(tile, url.slice(0, url.lastIndexOf("/")));
  let timer;
  try {
    await plugin.parseTile(
      buffer.slice(0),
      tile,
      "b3dm",
      url,
      new AbortController().signal
    );
    const scene = tile.engineData.scene,
      before = await describe({ model: { scene } });
    if (before.textures !== 0 || plugin.isReady(tile))
      throw Error("Native caster did not defer textures");
    visible = true;
    plugin.update();
    await Promise.race([
      completion,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Native promotion timeout")),
          10000
        );
      }),
    ]);
    const after = await describe({ model: { scene } });
    if (
      before.geometrySignature !== after.geometrySignature ||
      after.textures !== 1 ||
      tile.engineData.textures.length !== 1 ||
      !plugin.isReady(tile)
    )
      throw Error("Native promotion parity failed");
    return { geometryParity: true, textureOwnership: true, ready: true };
  } finally {
    clearTimeout(timer);
    plugin.dispose();
    tiles.disposeTile(tile);
    tiles.dispose();
  }
};
try {
  const payloads = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error(response.status);
      return response.arrayBuffer();
    })
  );
  const results = [];
  for (let tile = 0; tile < payloads.length; tile++) {
    const nativePromotion = await checkNativePromotion(
      payloads[tile],
      urls[tile]
    );
    const fullFirst = await parse(payloads[tile], urls[tile], false);
    const fullDescription = await describe(fullFirst);
    dispose(fullFirst);
    const partialFirst = await parse(payloads[tile], urls[tile], true);
    const partialDescription = await describe(partialFirst);
    if (
      fullDescription.geometrySignature !== partialDescription.geometrySignature
    )
      throw Error("Geometry parity mismatch");
    const geometryIdentity = [];
    partialFirst.model.scene.traverse((object) => {
      if (object.isMesh) geometryIdentity.push(object.geometry);
    });
    const promotionStart = now();
    await partialFirst.controller.promote();
    const promotionMs = now() - promotionStart;
    const promotedDescription = await describe(partialFirst);
    let g = 0;
    partialFirst.model.scene.traverse((object) => {
      if (object.isMesh && object.geometry !== geometryIdentity[g++])
        throw Error("Promotion replaced geometry");
    });
    if (
      promotedDescription.geometrySignature !==
        fullDescription.geometrySignature ||
      promotedDescription.textures !== fullDescription.textures
    )
      throw Error(
        "Promotion parity mismatch " +
          JSON.stringify({
            geometryEqual:
              promotedDescription.geometrySignature ===
              fullDescription.geometrySignature,
            fullTextures: fullDescription.textures,
            promotedTextures: promotedDescription.textures,
            skipped: partialFirst.controller.skippedMaterialCount(),
            ready: partialFirst.controller.isReady(),
          })
      );
    dispose(partialFirst);
    const full = [],
      geometryOnly = [];
    for (let run = 0; run < 9; run++) {
      output.textContent = JSON.stringify({
        phase: "benchmark",
        tile: tile + 1,
        run: run + 1,
      });
      for (const deferred of run % 2 ? [true, false] : [false, true]) {
        const result = await parse(payloads[tile], urls[tile], deferred);
        (deferred ? geometryOnly : full).push(result.ms);
        dispose(result);
      }
    }
    const { geometrySignature, ...fullStats } = fullDescription;
    const { geometrySignature: ignored, ...partialStats } = partialDescription;
    results.push({
      url: urls[tile],
      wireBytes: payloads[tile].byteLength,
      full: summary(full),
      geometryOnly: summary(geometryOnly),
      promotionMs,
      fullStats,
      geometryOnlyStats: partialStats,
      geometryParity: true,
      promotionRetainsGeometry: true,
      promotionTextureCountParity: true,
      nativePromotion,
    });
  }
  output.textContent = JSON.stringify(
    {
      phase: "complete",
      browser: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      results,
      scope:
        "Three representative real Mesh2024 payloads, downloaded once. Nine alternating warm parse pairs per tile after warm-up; identical embedded GLB buffers copied each run to avoid Draco task-cache identity reuse. Includes Draco worker dispatch/decode, geometry/material construction and image decoding; excludes download, renderer/GPU upload, runtime promotion scheduling and shadow screenshots. Decoded RGBA size is an estimate, not GPU/peak heap. Promotion verified exact geometry-array hashes and world transforms, unchanged geometry object identities and matching texture count.",
    },
    null,
    2
  );
} catch (error) {
  output.textContent = String(error) + "\n" + error.stack;
} finally {
  draco.dispose();
}
