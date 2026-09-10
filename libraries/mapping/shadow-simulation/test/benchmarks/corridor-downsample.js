import * as THREE from "three";
import { ShadowCorridorPresentation } from "../../src/lib/runtime/shadow-corridor-presentation.ts";

// Native WebGL2 regression: the Vitest renderer mocks cannot validate GLSL,
// float framebuffer writes, or the exact visibility average.
const renderer = new THREE.WebGLRenderer();
const presentation = new ShadowCorridorPresentation(renderer);
const source = new THREE.WebGLRenderTarget(64, 64, {
  type: THREE.FloatType,
  format: THREE.RedFormat,
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  depthTexture: new THREE.DepthTexture(64, 64, THREE.UnsignedIntType),
});
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader: "void main() { gl_Position = vec4(position.xy, 0., 1.); }",
  fragmentShader: `void main() {
    gl_FragColor = vec4(floor(gl_FragCoord.x) / 64., 0., 0., 1.);
    gl_FragDepth = .25;
  }`,
  depthFunc: THREE.AlwaysDepth,
  blending: THREE.NoBlending,
  toneMapped: false,
});
try {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  renderer.setRenderTarget(source);
  renderer.render(scene, camera);
  const page = {
    id: "test",
    revision: "geometry",
    contentKey: "geometry",
    presentationKey: "receiver-sun",
    receiverBounds: new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    ),
    screenBounds: new THREE.Vector4(0, 0, 1, 1),
    captureSize: { width: 64, height: 64 },
  };
  if (!presentation.publish(source, source, camera, page, 64))
    throw new Error("Publication failed");
  renderer.setRenderTarget(null);
  const start = performance.now();
  if (!presentation.downsample(page, 32, 32))
    throw new Error("Downsample failed");
  // Test-only access to inspect the GPU output, not a production API.
  const capture = presentation.captures.get(page.id);
  const pixels = new Float32Array(32 * 32);
  await renderer.readRenderTargetPixelsAsync(
    capture.target,
    0,
    0,
    32,
    32,
    pixels
  );
  const maxAbsoluteError = pixels.reduce(
    (max, value, i) =>
      Math.max(max, Math.abs(value - (2 * (i % 32) + 0.5) / 64)),
    0
  );
  const retainedAfterPan = presentation.has(
    {
      ...page,
      contentKey: "different-camera",
      captureSize: { width: 32, height: 32 },
    },
    64
  );
  const passed =
    maxAbsoluteError < 1e-6 &&
    retainedAfterPan &&
    renderer.getRenderTarget() === null;
  document.querySelector("#result").textContent = JSON.stringify(
    {
      passed,
      maxAbsoluteError,
      retainedAfterPan,
      samples: capture.samples,
      width: capture.width,
      height: capture.height,
      geometryDrawsForResize: 0,
      scalarDownsampleDraws: 1,
      elapsedIncludingReadbackMs: performance.now() - start,
      note: "GPU correctness regression; timing includes synchronization, not a throughput benchmark",
    },
    null,
    2
  );
} catch (error) {
  document.querySelector("#result").textContent = String(error?.stack ?? error);
} finally {
  presentation.dispose();
  source.depthTexture.dispose();
  source.dispose();
  material.dispose();
  geometry.dispose();
  renderer.dispose();
}
