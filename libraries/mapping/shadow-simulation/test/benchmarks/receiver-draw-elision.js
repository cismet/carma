import * as THREE from "three";
import { renderShadowReceiverObject } from "../../src/lib/runtime/shadow-receiver-object.ts";
import { ShadowCorridorAccumulator } from "../../src/lib/runtime/shadow-corridor-accumulator.ts";
import { ShadowCorridorPresentation } from "../../src/lib/runtime/shadow-corridor-presentation.ts";

// Frozen pre-change policy for A/B measurement only. Both arms use the same
// production visibility shader, accumulation kernel, geometry and 64 samples.
const maskedDraw = (scene, receiver, renderer, camera) => {
  const restores = [];
  scene.traverseVisible((mesh) => {
    if (!mesh.isMesh || mesh === receiver) return;
    const before = mesh.onBeforeRender;
    const after = mesh.onAfterRender;
    let saved;
    mesh.onBeforeRender = (...args) => {
      before.call(mesh, ...args);
      const material = args[4];
      saved = [material, material.colorWrite, material.depthWrite];
      material.colorWrite = material.depthWrite = false;
    };
    mesh.onAfterRender = (...args) => {
      if (saved) {
        saved[0].colorWrite = saved[1];
        saved[0].depthWrite = saved[2];
      }
      after.call(mesh, ...args);
    };
    restores.push(() => {
      mesh.onBeforeRender = before;
      mesh.onAfterRender = after;
    });
  });
  try {
    renderer.render(scene, camera);
  } finally {
    restores.forEach((restore) => restore());
  }
};

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(512, 512);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 100);
camera.position.set(0, 35, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
const material = new THREE.MeshLambertMaterial();
const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 0.1, 30), material);
ground.castShadow = ground.receiveShadow = true;
scene.add(ground);
const geometry = new THREE.SphereGeometry(1, 64, 32);
for (let i = 0; i < 100; i++) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(((i % 10) - 4.5) * 3, 1.5, (Math.floor(i / 10) - 4.5) * 3);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}
const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 18, 0.7), material);
chimney.position.set(19, 9, 0);
chimney.castShadow = true;
scene.add(chimney);
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(28, 28, 8);
light.castShadow = true;
light.shadow.mapSize.set(1024, 1024);
Object.assign(light.shadow.camera, {
  left: -35,
  right: 35,
  top: 35,
  bottom: -35,
  near: 0.1,
  far: 100,
});
scene.add(light, light.target, new THREE.AmbientLight(0xffffff, 0.5));
scene.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(ground);
const page = {
  id: "receiver",
  revision: "geometry",
  contentKey: "geometry",
  ready: true,
  receiverObjectId: ground.id,
  receiverBounds: bounds,
  screenBounds: new THREE.Vector4(0, 0, 1, 1),
};
const presentation = new ShadowCorridorPresentation(renderer);
const accumulator = new ShadowCorridorAccumulator(renderer, presentation);
const frame = {
  width: 512,
  height: 512,
  viewKey: "fixed",
  styleEpoch: 1,
  samples: 64,
  active: true,
  visibilityOnly: true,
  options: { format: "rgba32f", msaaSamples: 0 },
  maxPagesPerFrame: 64,
  maxFrameCpuMilliseconds: 60_000,
};
let epoch = 0;
const measure = (optimized) => {
  const current = {
    ...page,
    revision: String(++epoch),
    contentKey: String(epoch),
  };
  const draw = (view, sample, count) => {
    const angle = sample * 2.399963229728653;
    const radius = Math.sqrt((sample + 0.5) / count) * 0.18;
    light.position.set(
      28 + Math.cos(angle) * radius,
      28,
      8 + Math.sin(angle) * radius
    );
    light.shadow.needsUpdate = true;
    if (optimized) renderShadowReceiverObject(scene, ground.id, renderer, view);
    else maskedDraw(scene, ground, renderer, view);
    return true;
  };
  const pages = {
    accumulationPages: [current],
    supportsOpaqueAccumulation: true,
    renderSample: draw,
    renderPageSample: (view, _id, sample, count) => draw(view, sample, count),
  };
  renderer.info.reset();
  const start = performance.now();
  let progress;
  let submissions = 0;
  do {
    progress = presentation.capture(scene, () =>
      accumulator.render(camera, pages, frame)
    );
    if (!progress || ++submissions > 100)
      throw new Error(`Integration failed: ${accumulator.fallbackReason}`);
  } while (!progress.settled);
  // Test-only private inspection: include publication and GPU completion.
  const capture = presentation.captures.get(current.id);
  const values = new Float32Array(512 * 512);
  renderer.readRenderTargetPixels(capture.target, 0, 0, 512, 512, values);
  return {
    ms: performance.now() - start,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    values,
  };
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
try {
  measure(false);
  await pause();
  measure(true);
  await pause();
  const runs = { baseline: [], optimized: [] };
  let maxAbsoluteError = 0;
  let fractionalPixels = 0;
  let counts;
  for (let repeat = 0; repeat < 5; repeat++) {
    const pair = {};
    for (const optimized of repeat % 2 ? [true, false] : [false, true]) {
      const key = optimized ? "optimized" : "baseline";
      pair[key] = measure(optimized);
      runs[key].push(pair[key].ms);
      await pause();
    }
    for (let i = 0; i < pair.baseline.values.length; i++)
      maxAbsoluteError = Math.max(
        maxAbsoluteError,
        Math.abs(pair.baseline.values[i] - pair.optimized.values[i])
      );
    fractionalPixels = pair.optimized.values.filter(
      (value) => value > 0.01 && value < 0.99
    ).length;
    counts = Object.fromEntries(
      Object.entries(pair).map(([key, value]) => [
        key,
        { calls: value.calls, triangles: value.triangles },
      ])
    );
  }
  chimney.castShadow = false;
  const absent = measure(true);
  chimney.castShadow = true;
  const present = measure(true);
  const chimneyPixels = present.values.reduce(
    (count, value, i) =>
      count + Number(Math.abs(value - absent.values[i]) > 0.01),
    0
  );
  const gl = renderer.getContext();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  const result = {
    passed:
      maxAbsoluteError < 1e-6 && fractionalPixels > 0 && chimneyPixels > 0,
    browser: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    gpu: extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : "unavailable",
    three: THREE.REVISION,
    samples: 64,
    capture: "512x512 R32F",
    depth: "1024x1024 PCF",
    runs,
    counts,
    maxAbsoluteError,
    fractionalPixels,
    chimneyPixels,
    summary: Object.fromEntries(
      Object.entries(runs).map(([key, values]) => [
        key,
        {
          median: [...values].sort((a, b) => a - b)[2],
          max: Math.max(...values),
        },
      ])
    ),
    note: "Synthetic paired integration+publication+blocking readback; not full app reload or input latency.",
  };
  document.querySelector("#result").textContent = JSON.stringify(
    result,
    null,
    2
  );
} catch (error) {
  document.querySelector("#result").textContent = error.stack;
} finally {
  accumulator.dispose();
  presentation.dispose();
  scene.traverse((object) => {
    if (object.isMesh) object.geometry.dispose();
  });
  material.dispose();
  light.shadow.dispose();
  renderer.dispose();
}
