/** Browser-only diagnostic harness. Run from a Mesh Alignment iframe with
 * reprojectionMode=off and projectionBenchmarkProbe=true. Resolves the actual
 * Vite-loaded engine modules, not a copy of the converter. No production API.
 * Decision: MESH_REFERENCE_DECISIONS.md / MESH-PROJECTION-TARGETS-20260915.
 */
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const status = () =>
  JSON.parse(
    document.querySelector('[data-test-id="mesh-mount-status"]').dataset.status
  );
const setArgs = (updatedArgs) =>
  window.__STORYBOOK_ADDONS_CHANNEL__.emit("updateStoryArgs", {
    storyId: new URL(location.href).searchParams.get("id"),
    updatedArgs,
  });
const waitFor = async (predicate) => {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > 30000)
      throw new Error("Waiting for the native mesh runtime timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    samples: values,
  };
};
const loadedModule = async (suffix) => {
  let url = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .find((name) => new URL(name).pathname.endsWith(suffix));
  if (!url && suffix === "/tileset-mercator-projection-plugin.ts") {
    const mathUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => new URL(name).pathname.endsWith("/mesh-mercator-lut.ts"));
    if (mathUrl)
      url = new URL(
        "../../../../mapping/engines/maplibre/src/lib/runtime/integrations/tileset-mercator-projection-plugin.ts",
        mathUrl
      ).href;
  }
  if (!url)
    throw new Error(
      `Open the live Vite mesh story first: module ${suffix} not loaded`
    );
  return import(url);
};
const timed = async (operation) => {
  let active = 0,
    maximumSlice = 0,
    start = performance.now(),
    slice = start;
  const yieldControl = async () => {
    const elapsed = performance.now() - slice;
    active += elapsed;
    maximumSlice = Math.max(maximumSlice, elapsed);
    await pause();
    slice = performance.now();
  };
  const result = await operation(yieldControl);
  const elapsed = performance.now() - slice;
  active += elapsed;
  maximumSlice = Math.max(maximumSlice, elapsed);
  return { result, active, wall: performance.now() - start, maximumSlice };
};

export async function runMeshProjectionBenchmark({
  repetitions = 7,
  warmup = 2,
  onProgress = () => {},
} = {}) {
  if (repetitions < 3 || repetitions > 15 || warmup < 1 || warmup > 5)
    throw new Error("Use 3–15 repetitions and 1–5 warmups");
  const original = status();
  setArgs({ projectionBenchmarkProbe: true });
  await waitFor(() =>
    [...(window.__carmaTiles3d ?? [])].some(
      (entry) => entry.layerId === "mesh-mount-diagnostic"
    )
  );
  const nativeConstructor = [...window.__carmaTiles3d]
    .find((entry) => entry.layerId === "mesh-mount-diagnostic")
    ?.tiles?.getPluginByName("CARMA_LOCAL_MERCATOR_PROJECTION")?.constructor;
  setArgs({
    reprojectionMode: "off",
    projectionAccuracy: "custom",
    projectionBenchmarkProbe: true,
  });
  await waitFor(
    () =>
      status().reprojectionMode === "off" &&
      status().mesh.includes("requests idle") &&
      [...(window.__carmaTiles3d ?? [])].some(
        (entry) =>
          entry.layerId === "mesh-mount-diagnostic" &&
          !entry.options.mercatorProjection
      )
  );
  const runtime = [...window.__carmaTiles3d].find(
    (entry) => entry.layerId === "mesh-mount-diagnostic"
  );
  const math = await loadedModule("/mesh-mercator-lut.ts");
  const Plugin =
    nativeConstructor ??
    (await loadedModule("/tileset-mercator-projection-plugin.ts"))
      .TilesetMercatorProjectionPlugin;
  const source = [];
  runtime.tiles.forEachLoadedModel((scene, tile) => {
    let vertices = 0,
      valid = true;
    scene.traverse((node) => {
      if (node.isMesh) {
        vertices += node.geometry.getAttribute("position")?.count ?? 0;
        if (
          node.isSkinnedMesh ||
          node.isInstancedMesh ||
          Object.keys(node.geometry.morphAttributes).length
        )
          valid = false;
      }
    });
    if (valid && vertices >= 2000 && vertices <= 50000)
      source.push({ scene, tile, vertices });
  });
  source.sort((a, b) => b.vertices - a.vertices);
  const selected = [];
  let vertexCount = 0;
  for (const item of source)
    if (vertexCount + item.vertices <= 60000 && selected.length < 3) {
      selected.push(item);
      vertexCount += item.vertices;
    }
  if (!selected.length)
    throw new Error("No bounded static source tiles loaded yet");
  const cloneScene = (node) => {
    // Object3D.clone copies userData.tile, which is a circular native tile tree.
    // Explicitly copy the model tree, transforms and independent geometry only.
    const copy = node.isMesh
      ? new node.constructor(node.geometry.clone(), node.material)
      : new node.constructor();
    copy.matrix.copy(node.matrix);
    copy.matrixAutoUpdate = false;
    for (const child of node.children) copy.add(cloneScene(child));
    return copy;
  };
  const dispose = (scene) =>
    scene.traverse((node) => {
      if (node.isMesh) node.geometry.dispose();
    });
  const bank = selected.map(({ scene, tile, vertices }) => ({
    scene: cloneScene(scene),
    vertices,
    tile: {
      boundingVolume: structuredClone(tile.boundingVolume),
      transform: tile.engineData.transform.toArray(),
      geometricError: tile.geometricError,
    },
    uri: tile.content?.uri ?? tile.content?.url ?? null,
  }));
  const beforeArgs = {
    projectionBenchmarkProbe: true,
    reprojectionMode: original.reprojectionMode,
    projectionAccuracy: original.projectionAccuracy,
  };
  setArgs({ projectionBenchmarkProbe: false });
  await pause();
  await pause();
  const options = {
    longitudeDegrees: runtime.originLngLat[0],
    latitudeDegrees: runtime.originLngLat[1],
  };
  const configs = [
    { id: "off" },
    { id: "direct", sampling: math.MESH_PROJECTION_SAMPLING.EXACT },
    ...Object.entries(math.MESH_PROJECTION_ACCURACY).map(([id, profile]) => ({
      id,
      ...profile,
      sampling: math.MESH_PROJECTION_SAMPLING.LUT,
    })),
  ];
  const records = Object.fromEntries(
    configs.map((config) => [
      config.id,
      {
        lookupActive: [],
        lookupWall: [],
        convertActive: [],
        convertWall: [],
        maximumSlice: [],
        maximumErrorMeters: 0,
        lookupBytes: 0,
      },
    ])
  );
  const reference = [];
  const extract = (scene) => {
    const meshes = [];
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    return meshes;
  };
  try {
    // Reference is outside all timings, evaluated through the same payload path.
    const exact = await math.createMeshMercatorLut({
      ...options,
      sampling: math.MESH_PROJECTION_SAMPLING.EXACT,
    });
    for (const item of bank) {
      const scene = cloneScene(item.scene);
      const plugin = new Plugin(exact, pause);
      const originalGeometry = extract(scene)[0]?.geometry;
      await plugin.processTileModel(scene, structuredClone(item.tile));
      if (extract(scene)[0]?.geometry === originalGeometry)
        throw new Error(
          "Converter did not process native meshes; check Three module identity"
        );
      reference.push(
        extract(scene).map((mesh) => ({
          position: mesh.geometry.getAttribute("position").array.slice(),
          matrix: mesh.matrixWorld.clone(),
        }))
      );
      dispose(scene);
      plugin.dispose();
    }
    for (let round = -warmup; round < repetitions; round++) {
      // Rotate order to avoid always giving the last profile a hotter JIT/cache.
      const shift = (round + warmup) % configs.length;
      for (const config of [
        ...configs.slice(shift),
        ...configs.slice(0, shift),
      ]) {
        const record = records[config.id];
        const setup = await timed((yieldControl) =>
          config.id === "off"
            ? null
            : math.createMeshMercatorLut(
                {
                  ...options,
                  gridStepMeters: config.gridStepMeters ?? 250,
                  sampling: config.sampling,
                },
                yieldControl
              )
        );
        const fixtures = bank.map((item) => ({
          scene: cloneScene(item.scene),
          tile: structuredClone(item.tile),
        }));
        let plugin;
        try {
          const conversion = await timed(async (yieldControl) => {
            if (!setup.result) return;
            plugin = new Plugin(setup.result, yieldControl);
            for (const item of fixtures) {
              plugin.preprocessNode(item.tile, "");
              await plugin.processTileModel(item.scene, item.tile);
            }
          });
          if (round >= 0) {
            record.lookupActive.push(setup.active);
            record.lookupWall.push(setup.wall);
            record.convertActive.push(conversion.active);
            record.convertWall.push(conversion.wall);
            record.maximumSlice.push(conversion.maximumSlice);
            record.lookupBytes = setup.result
              ? setup.result.baseDelta.byteLength +
                setup.result.heightDerivativeDelta.byteLength
              : 0;
            // Error measurement deliberately excluded from timed work.
            if (config.id !== "off")
              fixtures.forEach((item, tileIndex) =>
                extract(item.scene).forEach((mesh, meshIndex) => {
                  const position = mesh.geometry.getAttribute("position");
                  const ref = reference[tileIndex][meshIndex],
                    m = ref.matrix.elements;
                  for (let i = 0; i < position.count; i++) {
                    const x = position.getX(i) - ref.position[i * 3],
                      y = position.getY(i) - ref.position[i * 3 + 1],
                      z = position.getZ(i) - ref.position[i * 3 + 2];
                    record.maximumErrorMeters = Math.max(
                      record.maximumErrorMeters,
                      Math.hypot(
                        m[0] * x + m[4] * y + m[8] * z,
                        m[1] * x + m[5] * y + m[9] * z,
                        m[2] * x + m[6] * y + m[10] * z
                      )
                    );
                  }
                })
              );
          }
        } finally {
          fixtures.forEach((item) => dispose(item.scene));
          plugin?.dispose();
        }
        onProgress({ round, config: config.id });
        await pause();
      }
    }
    const gl = runtime.map.getCanvas().getContext("webgl2");
    const gpu = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      date: new Date().toISOString(),
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      gpu: gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : "unavailable",
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      source: "decoded resident 2024 mesh; fixed source geometry for every run",
      vertexCount,
      tiles: bank.map(({ vertices, uri }) => ({ vertices, uri })),
      warmup,
      repetitions,
      boundary:
        "Lookup construction and actual native plugin (metadata, clone/decode, vertices, normal/tangent Jacobians, bounds, atomic replacement). Active JS excludes cooperative waits. Fixture copies, error checking, downloads, image decoding and GPU uploads excluded. Off is no conversion, not a fictitious decoder baseline.",
      results: configs.map((config) => {
        const r = records[config.id];
        return {
          ...config,
          lookupBytes: r.lookupBytes,
          maximumErrorMeters: r.maximumErrorMeters,
          lookupActive: summary(r.lookupActive),
          lookupWall: summary(r.lookupWall),
          convertActive: summary(r.convertActive),
          convertWall: summary(r.convertWall),
          maximumSlice: summary(r.maximumSlice),
        };
      }),
    };
  } finally {
    bank.forEach((item) => dispose(item.scene));
    setArgs(beforeArgs);
  }
}

/** Real map CPU-submission timings, not GPU completion timings or an FPS cap.
 * A temporary _render wrapper and completion intervals are measured after load.
 */
export async function runMeshProjectionFrameBenchmark({
  repetitions = 3,
  frames = 90,
  warmup = 30,
  onProgress = () => {},
} = {}) {
  if (
    repetitions < 1 ||
    repetitions > 5 ||
    frames < 30 ||
    frames > 180 ||
    warmup < 10 ||
    warmup > 60
  )
    throw new Error("Frame benchmark limits exceeded");
  const original = status();
  setArgs({ projectionBenchmarkProbe: true });
  await waitFor(() =>
    [...(window.__carmaTiles3d ?? [])].some(
      (entry) => entry.layerId === "mesh-mount-diagnostic"
    )
  );
  const runtime = [...(window.__carmaTiles3d ?? [])].find(
    (entry) => entry.layerId === "mesh-mount-diagnostic"
  );
  const map = runtime?.map;
  if (!map)
    throw new Error("Enable projectionBenchmarkProbe once to acquire the map");
  const configs = [
    { id: "off", reprojectionMode: "off", projectionAccuracy: "custom" },
    {
      id: "direct",
      reprojectionMode: "ellipsoid-exact",
      projectionAccuracy: "custom",
    },
    ...["1cm", "10cm", "1m"].map((id) => ({
      id,
      reprojectionMode: "ellipsoid-lut",
      projectionAccuracy: id,
    })),
  ];
  const results = [];
  try {
    for (let round = 0; round < repetitions; round++)
      for (const config of [
        ...configs.slice(round),
        ...configs.slice(0, round),
      ]) {
        setArgs({
          reprojectionMode: config.reprojectionMode,
          projectionAccuracy: config.projectionAccuracy,
          projectionBenchmarkProbe: false,
        });
        const started = performance.now();
        await new Promise((resolve, reject) => {
          const tick = () => {
            const s = status();
            if (
              s.reprojectionMode === config.reprojectionMode &&
              s.projectionAccuracy === config.projectionAccuracy &&
              s.mesh.includes("requests idle") &&
              performance.now() - started > 1000
            )
              return resolve();
            if (performance.now() - started > 30000)
              return reject(new Error(`Scene not idle: ${config.id}`));
            setTimeout(tick, 100);
          };
          tick();
        });
        const timing = await new Promise((resolve, reject) => {
          // This MapLibre version has no renderstart event. Instrument its
          // complete CPU submission call only in this opt-in diagnostic, and
          // restore it on completion/error. Never ship this as runtime logic.
          const originalRender = map._render;
          if (typeof originalRender !== "function")
            return reject(new Error("MapLibre CPU render probe unavailable"));
          let count = 0,
            last = null;
          const cpu = [],
            intervals = [];
          const finish = (elapsed) => {
            const now = performance.now();
            if (count++ >= warmup) {
              cpu.push(elapsed);
              if (last !== null) intervals.push(now - last);
            }
            last = now;
            if (cpu.length >= frames) {
              cleanup();
              resolve({ cpu: summary(cpu), interval: summary(intervals) });
            } else map.triggerRepaint();
          };
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Frame benchmark timed out"));
          }, 30000);
          const cleanup = () => {
            clearTimeout(timeout);
            if (map._render === measuredRender) map._render = originalRender;
          };
          function measuredRender(...args) {
            const start = performance.now();
            try {
              const result = originalRender.apply(this, args);
              finish(performance.now() - start);
              return result;
            } catch (error) {
              cleanup();
              reject(error);
            }
          }
          map._render = measuredRender;
          map.triggerRepaint();
        });
        const sample = {
          round,
          id: config.id,
          ...timing,
          viewport: [map.getCanvas().width, map.getCanvas().height],
          camera: status().camera,
        };
        results.push(sample);
        onProgress({ round, config: config.id });
      }
    return {
      date: new Date().toISOString(),
      repetitions,
      frames,
      warmup,
      results,
      boundary:
        "Stationary loaded map: temporary diagnostic wrapper of MapLibre _render CPU submission and completion intervals, restored after each run. No GPU timer; excludes startup/streaming. No nonlinear projection is evaluated per frame.",
    };
  } finally {
    setArgs({
      reprojectionMode: original.reprojectionMode,
      projectionAccuracy: original.projectionAccuracy,
      projectionBenchmarkProbe: true,
    });
  }
}
