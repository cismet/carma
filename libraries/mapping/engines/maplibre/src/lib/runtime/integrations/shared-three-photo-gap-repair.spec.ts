import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PHOTO_GAP_REPAIR_GLSL,
  PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL,
} from "../../core/photo-gap-repair-shaders";
import {
  repairPhotoGapsNearest,
  type PhotoGapRepairReply,
  type PhotoGapRepairRequest,
} from "../../core/photo-gap-repair-nearest";
import type {
  MapStylePhotoMosaicEntry,
  MapStyleProjectionUniforms,
  SharedThreeHostRenderState,
} from "../../core/shared-three-scene-types";
import { createSharedThreePhotoDepth } from "./shared-three-photo-depth";
import {
  createSharedThreePhotoGapRepair,
  photoGapRepairSize,
  type PhotoGapRepairConfig,
} from "./shared-three-photo-gap-repair";

class RepairWorker {
  static instances: RepairWorker[] = [];
  static automatic = true;
  onmessage: ((event: MessageEvent<PhotoGapRepairReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: PhotoGapRepairRequest[] = [];
  terminate = vi.fn();
  constructor() {
    RepairWorker.instances.push(this);
  }
  postMessage = vi.fn(
    (request: PhotoGapRepairRequest, _transfer: Transferable[]) => {
      this.requests.push(request);
      if (RepairWorker.automatic)
        queueMicrotask(() => this.reply(this.requests.length - 1));
    }
  );
  reply(index: number) {
    const request = this.requests[index];
    this.onmessage?.({
      data: { id: request.id, result: repairPhotoGapsNearest(request.input) },
    } as MessageEvent<PhotoGapRepairReply>);
  }
}
const drain = async () => {
  for (let step = 0; step < 24; step++) await Promise.resolve();
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
  RepairWorker.instances = [];
  RepairWorker.automatic = true;
});
// A calibrated sensor transform intentionally has rank 3: its z and w rows match.
const sensorProjection = () =>
  new THREE.Matrix4().set(
    1,
    0,
    -0.5,
    0,
    0,
    1,
    -0.5,
    0,
    0,
    0,
    -1,
    0,
    0,
    0,
    -1,
    0
  );
const setup = (holdReadback = false) => {
  vi.stubGlobal("Worker", RepairWorker);
  const slot = () => ({
    texture: { value: new THREE.Texture() },
    viewportToTexture: { value: new THREE.Matrix3() },
    sceneToTexture: { value: sensorProjection() },
    sourceDepthTexture: { value: new THREE.DepthTexture(8, 8) },
    sourceDepthSceneToClip: { value: new THREE.Matrix4() },
    sourceDepthNearFar: { value: new THREE.Vector2(1, 1000) },
    sourceDepthEnabled: { value: 1 },
    sourceDepthBias: { value: 0.1 },
    frameProjection: { value: sensorProjection() },
    frameEnabled: { value: 1 },
    projective: { value: 1 },
    fillGaps: { value: 1 },
    opacity: { value: 0.5 },
  });
  const slots = [slot(), slot()] as const;
  const projection: MapStyleProjectionUniforms = {
    texture: { value: null },
    sceneToClip: { value: new THREE.Matrix4() },
    enabled: { value: 0 },
    depthTexture: { value: null },
    depthEnabled: { value: 0 },
    depthNearFar: { value: new THREE.Vector2(1, 1000) },
    texelSize: { value: new THREE.Vector2() },
    screenOverlays: slots,
  };
  const depth = createSharedThreePhotoDepth(new Map());
  const sync = vi.spyOn(depth, "sync"),
    setSources = vi.spyOn(depth, "setSources");
  const receiverDepth = vi.spyOn(depth, "renderView");
  const sourceDepth = vi
    .spyOn(depth, "renderSource")
    .mockImplementation((_renderer, matrix) => ({
      texture: slots[0].sourceDepthTexture.value,
      sceneToClip: matrix,
      nearFar: new THREE.Vector2(1, 1000),
      biasMeters: 0.1,
      changed: false,
    }));
  const depthDispose = vi.spyOn(depth, "dispose");
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000),
    viewport = new THREE.Vector2(8, 8);
  const oldTarget = new THREE.WebGLRenderTarget(8, 8);
  let target: THREE.WebGLRenderTarget | null = oldTarget,
    pack: unknown = "host-pack";
  const targets = new Set<THREE.WebGLRenderTarget>();
  const passes: {
    target: THREE.WebGLRenderTarget | null;
    material?: THREE.ShaderMaterial;
    projection: THREE.Matrix4;
  }[] = [];
  const reads: (() => void)[] = [];
  const gl = {
    FRAMEBUFFER_BINDING: 1,
    DEPTH_RANGE: 2,
    FRAMEBUFFER: 3,
    PIXEL_PACK_BUFFER_BINDING: 4,
    PIXEL_PACK_BUFFER: 5,
    getParameter: vi.fn((key: number) =>
      key === 1
        ? "host-framebuffer"
        : key === 4
        ? pack
        : new Float32Array([0.2, 0.8])
    ),
    depthRange: vi.fn(),
    bindFramebuffer: vi.fn(),
    bindBuffer: vi.fn((_target: number, value: unknown) => {
      pack = value;
    }),
  };
  const renderer = {
    autoClear: true,
    state: { bindFramebuffer: gl.bindFramebuffer },
    capabilities: { maxTextureSize: 8192 },
    extensions: { has: vi.fn(() => true) },
    getContext: () => gl,
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => {
      target = value;
      if (value && value !== oldTarget) targets.add(value);
    }),
    getViewport: (value: THREE.Vector4) => value.set(2, 3, 400, 300),
    getScissor: (value: THREE.Vector4) => value.set(5, 6, 200, 100),
    getScissorTest: () => true,
    getClearColor: (value: THREE.Color) => value.setRGB(0.1, 0.2, 0.3),
    getClearAlpha: () => 0.4,
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    resetState: vi.fn(() => {
      target = null;
    }),
    render: vi.fn((scene: THREE.Scene, view: THREE.Camera) => {
      const material = (scene.children[0] as THREE.Mesh | undefined)
        ?.material as THREE.ShaderMaterial | undefined;
      passes.push({
        target,
        material,
        projection: view.projectionMatrix.clone(),
      });
    }),
    readRenderTargetPixelsAsync: vi.fn(
      (
        _atlas: THREE.WebGLRenderTarget,
        x: number,
        _y: number,
        width: number,
        height: number,
        buffer: Float32Array | Uint8Array
      ) => {
        pack = "readback-pack";
        for (let row = 0; row < height; row++)
          for (let col = 0; col < width; col++) {
            const index = (row * width + col) * 4;
            if (buffer instanceof Float32Array)
              buffer.set([x * 100 + col, row, 0, 2], index);
            else if (col === 0) buffer.set([128, 64, 32, 255], index);
          }
        return holdReadback
          ? new Promise<typeof buffer>((resolve) =>
              reads.push(() => resolve(buffer))
            )
          : Promise.resolve(buffer);
      }
    ),
  };
  const repaint = vi.fn();
  const repair = createSharedThreePhotoGapRepair(depth, projection, repaint);
  const config: PhotoGapRepairConfig = {
    id: "rotation",
    auxiliary: [extra(), extra(2)],
    auxiliaryExpected: 2,
    sceneToMetric: new THREE.Matrix4().makeTranslation(10, 20, 30),
    views: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(1, 0, 0)],
  };
  const render = (
    options: PhotoGapRepairConfig | undefined = config,
    host?: SharedThreeHostRenderState,
    revision = 1
  ) =>
    repair.render(
      renderer as unknown as THREE.WebGLRenderer,
      camera,
      viewport,
      host,
      revision,
      revision,
      options
    );
  cleanup.push(() => {
    repair.dispose();
    depth.dispose();
    oldTarget.dispose();
    config.auxiliary?.forEach((photo) => photo.texture.dispose());
    slots.forEach((entry) => {
      entry.texture.value.dispose();
      entry.sourceDepthTexture.value.dispose();
    });
  });
  return {
    slots,
    projection,
    depth,
    sync,
    setSources,
    receiverDepth,
    sourceDepth,
    depthDispose,
    camera,
    viewport,
    targets,
    passes,
    gl,
    renderer,
    oldTarget,
    repair,
    render,
    config,
    repaint,
    reads,
    pack: () => pack,
  };
};
const extra = (priority = 1): MapStylePhotoMosaicEntry => ({
  texture: new THREE.Texture(),
  sceneToTexture: sensorProjection(),
  sourceProjection: sensorProjection().multiply(
    new THREE.Matrix4().makeTranslation(priority, 0, 0)
  ),
  opacity: 1,
  priority,
});

describe("fixed metric photo gap repair", () => {
  it("requires all four full-sensor projections, accepting calibrated rank-three matrices", () => {
    const value = setup();
    expect(sensorProjection().determinant()).toBe(0);
    value.render({ ...value.config, auxiliary: [], auxiliaryExpected: 0 });
    value.render({
      ...value.config,
      auxiliary: [extra()],
      auxiliaryExpected: 1,
    });
    expect(value.receiverDepth).not.toHaveBeenCalled();
    expect(RepairWorker.instances).toHaveLength(0);
    expect(value.render({ ...value.config, auxiliary: [] }).footprints).toBe(0);

    value.slots[0].frameProjection.value.multiplyScalar(0);
    value.render();
    expect(value.receiverDepth).not.toHaveBeenCalled();
    value.slots[0].frameProjection.value.copy(sensorProjection());
    value.slots[0].sceneToTexture.value.multiply(
      new THREE.Matrix4().makeScale(2, 2, 1)
    );
    const result = value.render();
    expect(value.receiverDepth).toHaveBeenCalledTimes(2);
    expect(result.footprints).toBe(4);
    const expectedSources = [
      ...value.slots.map((slot) => slot.frameProjection.value),
      ...[...value.config.auxiliary!]
        .sort((a, b) => b.priority - a.priority)
        .map((photo) => photo.sourceProjection!),
    ];
    const inverse = value.config.sceneToMetric.clone().invert();
    expect(result.metricToFootprint).toEqual(
      expectedSources.map((matrix) => matrix.clone().multiply(inverse))
    );
    const geometry = value.passes.find((pass) =>
      pass.material?.fragmentShader.includes(
        "carmaGapInsideFootprints(metric)?2.0:1.0"
      )
    )!.material!;
    expect(geometry.fragmentShader).toContain(
      PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL
    );
    expect(geometry.uniforms.carmaPhotoGapFootprints.value).toBe(4);
    expect(geometry.uniforms.carmaPhotoGapMetricToFootprint0.value).toBe(
      result.metricToFootprint[0]
    );
  });

  it("uses the actual shared shader predicates for intersection, disjoint masks and exact raster boundaries", () => {
    const singleBody = PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL.match(
      /bool carmaGapInsideFootprint\([^]*?\{([^]*?)\}/
    )![1];
    // Execute the shader's scalar predicate unchanged, with Three doing mat4 * vec4.
    const testProjected = new Function(
      "projected",
      singleBody.slice(singleBody.indexOf("return"))
    ) as (point: THREE.Vector4) => boolean;
    const inside = (point: THREE.Vector3, matrix: THREE.Matrix4) =>
      testProjected(
        new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(matrix)
      );
    const combinedBody = PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL.match(
      /bool carmaGapInsideFootprints\([^]*?\{([^]*?)\}/
    )![1];
    const combined = new Function(
      "point",
      "carmaPhotoGapFootprints",
      "carmaGapInsideFootprint",
      "carmaPhotoGapMetricToFootprint0",
      "carmaPhotoGapMetricToFootprint1",
      "carmaPhotoGapMetricToFootprint2",
      "carmaPhotoGapMetricToFootprint3",
      combinedBody
    ) as (
      point: THREE.Vector3,
      count: number,
      predicate: typeof inside,
      ...matrices: THREE.Matrix4[]
    ) => boolean;
    const matrices = Array.from({ length: 4 }, sensorProjection);
    matrices[0].elements[12] = 0.2;
    matrices[1].elements[12] = -0.2;
    matrices[2].elements[13] = 0.2;
    matrices[3].elements[13] = -0.2;
    const center = new THREE.Vector3(0, 0, -1);
    expect(combined(center, 4, inside, ...matrices)).toBe(true);
    const unionOnly = new THREE.Vector3(0.5, 0, -1);
    expect(matrices.some((matrix) => inside(unionOnly, matrix))).toBe(true);
    expect(combined(unionOnly, 4, inside, ...matrices)).toBe(false);
    for (const count of [0, 1, 2, 3, 5])
      expect(combined(center, count, inside, ...matrices)).toBe(false);
    expect(combined(new THREE.Vector3(0, 0, 1), 4, inside, ...matrices)).toBe(
      false
    );
    expect(
      combined(new THREE.Vector3(0.3, 0, -1), 4, inside, ...matrices)
    ).toBe(true);
    expect(
      combined(new THREE.Vector3(0.30000001, 0, -1), 4, inside, ...matrices)
    ).toBe(false);
    const sample = PHOTO_GAP_REPAIR_GLSL.slice(
      PHOTO_GAP_REPAIR_GLSL.indexOf("vec4 carmaPhotoGapSample")
    );
    expect(
      sample.indexOf("if(!carmaGapInsideFootprints(point))return")
    ).toBeLessThan(sample.indexOf("carmaGapPage(point"));
    matrices[3].elements[12] = 2;
    expect(combined(center, 4, inside, ...matrices)).toBe(false);
    expect(combined(new THREE.Vector3(-2, 0, -1), 4, inside, ...matrices)).toBe(
      false
    );
  });

  it("bounds three double-height geometry pages and accounts for every GPU attachment", () => {
    expect(photoGapRepairSize(new THREE.Vector2(4000, 4000), 3, 8192)).toEqual({
      width: 256,
      height: 256,
      pages: 3,
      allocatedBytes: 9961472,
    });
    const small = photoGapRepairSize(new THREE.Vector2(100, 400), 2, 128)!;
    expect(small.width * 2).toBeLessThanOrEqual(128);
    expect(small.height * 2).toBeLessThanOrEqual(128);
    expect(photoGapRepairSize(new THREE.Vector2(0, 4), 1, 8192)).toBeNull();
    expect(photoGapRepairSize(new THREE.Vector2(4, 4), 4, 8192)).toBeNull();
  });
  it.each(["worker", "float", "readback"])(
    "fails closed without %s support",
    (missing) => {
      const value = setup();
      if (missing === "worker") vi.stubGlobal("Worker", undefined);
      if (missing === "float")
        value.renderer.extensions.has.mockReturnValue(false);
      if (missing === "readback")
        Object.defineProperty(value.renderer, "readRenderTargetPixelsAsync", {
          value: undefined,
        });
      expect(value.render().texture).toBeNull();
      expect(value.repair.state.error).toMatch(/worker.*readback/);
      expect(value.receiverDepth).not.toHaveBeenCalled();
      expect(RepairWorker.instances).toHaveLength(0);
    }
  );
  it("samples nearest first-surface world positions for fixed metric geometry and raw photos", () => {
    const value = setup();
    value.render();
    expect(value.receiverDepth).toHaveBeenCalledTimes(
      value.config.views.length
    );
    for (const call of value.receiverDepth.mock.calls)
      expect(call[2]).toEqual({ positions: true });
    const receiver = [...value.targets].find((target) => target.depthTexture)!;
    expect(receiver.texture.type).toBe(THREE.FloatType);
    expect(receiver.texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(receiver.texture.minFilter).toBe(THREE.NearestFilter);
    expect(receiver.texture.magFilter).toBe(THREE.NearestFilter);
    expect(receiver.texture.generateMipmaps).toBe(false);
    expect(receiver.depthTexture?.type).toBe(THREE.UnsignedIntType);
    const sampled = value.passes.filter(
      (pass) => pass.material?.uniforms.gapReceiverPosition
    );
    expect(sampled).toHaveLength(value.config.views.length * 2);
    for (const { material } of sampled) {
      expect(material!.uniforms.gapReceiverPosition.value).toBe(
        receiver.texture
      );
      expect(material!.uniforms.gapSceneToMetric.value).toEqual(
        value.config.sceneToMetric
      );
      expect(material!.uniforms.gapClipToScene).toBeUndefined();
    }
    expect(value.sync).not.toHaveBeenCalled();
    expect(value.setSources).not.toHaveBeenCalled();
  });
  it("waits for pending primary depth without freezing the generation", () => {
    const value = setup();
    value.slots[0].sourceDepthEnabled.value = -1;
    value.render();
    expect(value.receiverDepth).not.toHaveBeenCalled();
    value.slots[0].sourceDepthEnabled.value = 1;
    value.render();
    expect(value.receiverDepth).toHaveBeenCalledTimes(2);
  });
  it("waits for every expected real camera and its first-hit depth", () => {
    const value = setup(),
      a = extra(),
      b = extra(2);
    value.render({ ...value.config, auxiliaryExpected: 2, auxiliary: [a] });
    expect(value.sourceDepth).not.toHaveBeenCalled();
    expect(value.receiverDepth).not.toHaveBeenCalled();
    value.sourceDepth.mockReturnValueOnce(null).mockReturnValueOnce(null);
    value.render({ ...value.config, auxiliaryExpected: 2, auxiliary: [a, b] });
    expect(value.receiverDepth).not.toHaveBeenCalled();
    expect(RepairWorker.instances).toHaveLength(0);
    value.render({ ...value.config, auxiliaryExpected: 2, auxiliary: [a, b] });
    expect(value.receiverDepth).toHaveBeenCalledTimes(2);
    expect(value.sync).not.toHaveBeenCalled();
    expect(value.setSources).not.toHaveBeenCalled();
  });
  it("uses fixed calibrated extra projections and valid crop bounds only behind primary coverage", () => {
    const value = setup(),
      a = extra(),
      b = { ...extra(2), textureBounds: [0.1, 0.2, 0.8, 0.9] as const };
    value.render({ ...value.config, auxiliary: [a, b], auxiliaryExpected: 2 });
    expect(value.sourceDepth.mock.calls.map((call) => call[1])).toEqual([
      b.sourceProjection,
      a.sourceProjection,
    ]);
    const raw = value.passes.find((pass) =>
      pass.material?.fragmentShader.includes("gapAuxSample0(point)")
    )!.material!;
    expect(raw.uniforms.gapAux0_texture.value).toBe(b.texture);
    expect(raw.uniforms.gapAux0_bounds.value.toArray()).toEqual(
      b.textureBounds
    );
    expect(raw.fragmentShader).toContain("if(alpha>0.0){gl_FragColor=");
    expect(raw.fragmentShader).toContain(
      "if(extra.a<=0.0)extra=gapAuxSample1(point)"
    );
    expect(raw.fragmentShader).toContain(
      "carmaPhotoUnionWeights(a.a,b.a,1.0,1.0)"
    );
    expect(raw.fragmentShader).toContain("lessThan(uv,gapAux0_bounds.xy)");
    const sourceDispose = vi.spyOn(a.texture, "dispose");
    value.repair.dispose();
    expect(sourceDispose).not.toHaveBeenCalled();
  });
  it("does not satisfy the expected camera count with an uncalibrated or invalid crop", () => {
    const value = setup();
    value.render({
      ...value.config,
      auxiliaryExpected: 2,
      auxiliary: [extra(), { ...extra(2), sourceProjection: undefined }],
    });
    value.render({
      ...value.config,
      auxiliaryExpected: 1,
      auxiliary: [{ ...extra(), textureBounds: [0.8, 0, 0.2, 1] }],
    });
    expect(value.receiverDepth).not.toHaveBeenCalled();
  });
  it("bakes fixed metric clip cameras once and restores host GL state immediately after each queued read", () => {
    const value = setup(true),
      host = {
        framebuffer: "host-fb",
        depthRange: [0.3, 0.7],
      } as unknown as SharedThreeHostRenderState;
    value.render(value.config, host);
    const depthPasses = value.passes.filter((pass) => !pass.material);
    expect(depthPasses.map((pass) => pass.projection.elements)).toEqual(
      value.config.views.map(
        (view) => view.clone().multiply(value.config.sceneToMetric).elements
      )
    );
    expect(value.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(4);
    expect(value.pack()).toBe("host-pack");
    expect(value.renderer.getRenderTarget()).toBe(value.oldTarget);
    expect(value.gl.depthRange).toHaveBeenLastCalledWith(0, 1); // nested Three target owns this range
    expect(RepairWorker.instances).toHaveLength(0);
    value.reads.forEach((release) => release());
  });
  it("publishes worker page-local donors and metric positions only on a subsequent render", async () => {
    const value = setup();
    value.render();
    const before = value.renderer.render.mock.calls.length;
    await drain();
    expect(value.renderer.render).toHaveBeenCalledTimes(before);
    expect(value.repaint).toHaveBeenCalled();
    const worker = RepairWorker.instances[0];
    expect(worker.requests).toHaveLength(2);
    for (const request of worker.requests) {
      expect(request.input).toMatchObject({
        width: 8,
        height: 8,
        radiusMeters: 20,
        planeToleranceMeters: 0.25,
        intersectionOnly: true,
      });
      expect(request.input.positions).toHaveLength(8 * 8 * 4);
    }
    expect(worker.postMessage.mock.calls[0][1]).toHaveLength(2);
    const result = value.render();
    expect(result.pages).toBe(2);
    expect(result.footprints).toBe(4);
    expect(result.changed).toBe(true);
    expect(result.texture).toBeTruthy();
    const geometry = result.geometry as THREE.DataTexture;
    expect(geometry.image.width).toBe(16);
    expect(geometry.image.height).toBe(16);
    const data = geometry.image.data as Float32Array;
    expect(data[8 * 4]).toBe(800); // second page's own surface coordinates
    expect(data[(8 * 16 + 1) * 4 + 3]).toBe(1); // donor plane, page zero, repaired column one
    expect(data[(8 * 16 + 8 + 1) * 4]).toBe(800); // second page donor never crosses atlas boundary
    expect(value.repair.state.pending).toBe(false);
    expect(value.repair.state.jumpPasses).toBe(0);
  });
  it("freezes donors across live camera, heading, quality and viewport changes", async () => {
    const value = setup();
    value.render();
    await drain();
    const texture = value.render().texture;
    value.camera.position.set(50, 20, 100);
    value.viewport.set(2000, 1200);
    value.slots[0].opacity.value = 0;
    value.slots[1].opacity.value = 1;
    value.slots[0].texture.value.needsUpdate = true;
    const result = value.render(
      {
        ...value.config,
        views: [new THREE.Matrix4().makeTranslation(999, 0, 0)],
      },
      undefined,
      99
    );
    expect(result.texture).toBe(texture);
    expect(result.changed).toBe(false);
    expect(value.receiverDepth).toHaveBeenCalledTimes(2);
    expect(value.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(4);
  });
  it("updates only scene-to-metric after a local-frame refit", async () => {
    const value = setup();
    value.render();
    await drain();
    const texture = value.render().texture;
    const frozenFootprints = value
      .render()
      .metricToFootprint.map((matrix) => matrix.clone());
    const sceneToMetric = new THREE.Matrix4().makeTranslation(100, 200, 300);
    value.slots[0].frameProjection.value.elements[12] = 999;
    const result = value.render({ ...value.config, sceneToMetric });
    expect(result.texture).toBe(texture);
    expect(result.sceneToMetric.equals(sceneToMetric)).toBe(true);
    expect(result.metricToFootprint).toEqual(frozenFootprints);
    expect(result.changed).toBe(true);
    expect(value.receiverDepth).toHaveBeenCalledTimes(2);
  });
  it("cancels stale worker ownership on generation change", async () => {
    RepairWorker.automatic = false;
    const value = setup();
    value.render();
    await drain();
    const oldWorker = RepairWorker.instances[0];
    expect(oldWorker.requests).toHaveLength(1);
    value.render({ ...value.config, id: "next" });
    oldWorker.reply(0);
    await drain();
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(value.repair.state.active).toBe(false);
    expect(value.render({ ...value.config, id: "next" }).texture).toBeNull();
  });
  it("keeps pending GPU readbacks alive but publishes nothing after detach", async () => {
    const value = setup(true);
    value.render();
    const disposals = [...value.targets].map((target) =>
      vi.spyOn(target, "dispose")
    );
    value.repair.detach();
    expect(disposals.every((dispose) => dispose.mock.calls.length === 0)).toBe(
      true
    );
    value.render({ ...value.config, id: "next" });
    expect(value.receiverDepth).toHaveBeenCalledTimes(2);
    value.reads.splice(0).forEach((release) => release());
    await drain();
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
      true
    );
    expect(RepairWorker.instances).toHaveLength(0);
    expect(value.repair.state.active).toBe(false);
    value.render({ ...value.config, id: "next" });
    expect(value.receiverDepth).toHaveBeenCalledTimes(4);
    value.reads.splice(0).forEach((release) => release());
  });
  it("conservatively disables repair on worker errors and disposes only owned resources", async () => {
    RepairWorker.automatic = false;
    const value = setup();
    value.render();
    await drain();
    const worker = RepairWorker.instances[0];
    worker.onerror?.({ message: "worker failed" } as ErrorEvent);
    expect(value.repair.state.error).toBe("worker failed");
    expect(value.repair.state.active).toBe(false);
    expect(value.render().texture).toBeNull();
    value.repair.dispose();
    value.repair.dispose();
    expect(value.depthDispose).not.toHaveBeenCalled();
  });
  it("clears active output when the paired-projective contract ends", async () => {
    const value = setup();
    value.render();
    await drain();
    const result = value.render();
    expect(result.texture).toBeTruthy();
    value.slots[0].fillGaps.value = 0;
    expect(value.render().texture).toBeNull();
    expect(value.repair.state.active).toBe(false);
  });
  it("samples stable scene positions and chooses the nearest valid metric donor across pages", () => {
    expect(PHOTO_GAP_REPAIR_GLSL).toContain(
      "vec4 carmaPhotoGapSample(vec3 scenePosition)"
    );
    expect(PHOTO_GAP_REPAIR_GLSL).toContain("distance(point,donor.xyz)");
    expect(PHOTO_GAP_REPAIR_GLSL).toContain("candidateDistance>20.0");
    expect(PHOTO_GAP_REPAIR_GLSL).toContain(
      "abs(dot(point-center.xyz,normal))>0.25"
    );
    expect(
      PHOTO_GAP_REPAIR_GLSL.match(/candidateDistance<bestDistance/g)
    ).toHaveLength(2);
    expect(PHOTO_GAP_REPAIR_GLSL).not.toContain("gl_FragCoord");
  });
});
