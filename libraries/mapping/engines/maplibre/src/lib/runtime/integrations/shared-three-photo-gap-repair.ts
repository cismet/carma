import * as THREE from "three";
import type { DevicePixels, Meters } from "@carma-units";
import type {
  PhotoGapRepairReply,
  PhotoGapRepairRequest,
} from "../../core/photo-gap-repair-nearest";
import type {
  MapStylePhotoMosaicEntry,
  MapStyleProjectionUniforms,
  SharedThreeHostRenderState,
} from "../../core/shared-three-scene-types";
import { PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL } from "../../core/photo-gap-repair-shaders";
import { MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER } from "../../core/shared-three-map-style-shaders";
import type { SharedThreePhotoDepth } from "./shared-three-photo-depth";

export const PHOTO_GAP_REPAIR_MAX_EDGE = 256 as DevicePixels;
export const PHOTO_GAP_REPAIR_RADIUS = 20 as Meters;
export const PHOTO_GAP_REPAIR_PLANE_TOLERANCE = 0.25 as Meters;
export type PhotoGapRepairConfig = Readonly<{
  /** A new identifier explicitly starts a new fixed bake generation. */
  id: string;
  sceneToMetric: THREE.Matrix4;
  /** Fixed metric ENU to clip, one to three views for the whole transition. */
  views: readonly THREE.Matrix4[];
  /** Fixed coarse real photographs, behind the two primary captures. */
  auxiliary?: readonly MapStylePhotoMosaicEntry[];
  /** Do not freeze a partial rotation group; missing sources may arrive later. */
  auxiliaryExpected?: number;
}>;
export type PhotoGapRepairResult = Readonly<{
  texture: THREE.Texture | null;
  geometry: THREE.Texture | null;
  metricToClip: readonly [THREE.Matrix4, THREE.Matrix4, THREE.Matrix4];
  metricToFootprint: readonly [
    THREE.Matrix4,
    THREE.Matrix4,
    THREE.Matrix4,
    THREE.Matrix4
  ];
  footprints: number;
  sceneToMetric: THREE.Matrix4;
  fieldSize: THREE.Vector2;
  pages: number;
  changed: boolean;
}>;

export const photoGapRepairSize = (
  viewport: THREE.Vector2,
  pages: number,
  maxTextureSize: number
) => {
  if (
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 3 ||
    ![viewport.x, viewport.y, maxTextureSize].every(
      (value) => Number.isFinite(value) && value >= 1
    )
  )
    return null;
  const scale = Math.min(
    1,
    PHOTO_GAP_REPAIR_MAX_EDGE / Math.max(viewport.x, viewport.y),
    maxTextureSize / (viewport.x * pages),
    maxTextureSize / (viewport.y * 2)
  );
  const width = Math.max(1, Math.floor(viewport.x * scale)),
    height = Math.max(1, Math.floor(viewport.y * scale));
  if (width * pages > maxTextureSize) return null;
  // One reusable receiver target (RGBA32F + depth32), atlas RGBA8
  // raw/color/donors and two RGBA32F position fields: at most 9.5 MiB GPU-only.
  return {
    width,
    height,
    pages,
    allocatedBytes: width * height * (20 + 44 * pages),
  };
};

const vertexShader = `varying vec2 gapUv;void main(){gapUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const geometryHeader = /* glsl */ `
uniform sampler2D gapReceiverPosition;
uniform mat4 gapSceneToMetric;
varying vec2 gapUv;
bool gapPosition(out vec3 position){
 vec4 point=texture2D(gapReceiverPosition,gapUv);
 if(point.w<=0.0)return false;
 position=point.xyz;return true;
}
`;

type Targets = {
  depth: THREE.WebGLRenderTarget;
  raw: THREE.WebGLRenderTarget;
  geometry?: THREE.WebGLRenderTarget;
  repairedGeometry?: THREE.DataTexture;
  color: THREE.WebGLRenderTarget;
  donors?: THREE.DataTexture;
  width: number;
  height: number;
  pages: number;
  reading: boolean;
  retired: boolean;
};

/** Own only bounded bake targets and one worker; source textures/depth mirrors stay borrowed. */
export const createSharedThreePhotoGapRepair = (
  sharedDepth: SharedThreePhotoDepth,
  projection: MapStyleProjectionUniforms,
  requestRepaint?: () => void
) => {
  const sceneToMetric = new THREE.Matrix4();
  const metricToClip = [
    new THREE.Matrix4(),
    new THREE.Matrix4(),
    new THREE.Matrix4(),
  ] as const;
  const metricToFootprint = [
    new THREE.Matrix4(),
    new THREE.Matrix4(),
    new THREE.Matrix4(),
    new THREE.Matrix4(),
  ] as const;
  const fieldSize = new THREE.Vector2();
  const result: {
    -readonly [K in keyof PhotoGapRepairResult]: PhotoGapRepairResult[K];
  } = {
    texture: null,
    geometry: null,
    metricToClip,
    metricToFootprint,
    footprints: 0,
    sceneToMetric,
    fieldSize,
    pages: 0,
    changed: false,
  };
  const uniforms = {
    gapReceiverPosition: { value: null as THREE.Texture | null },
    gapSceneToMetric: { value: new THREE.Matrix4() },
    gapRaw: { value: null as THREE.Texture | null },
    gapDonors: { value: null as THREE.Texture | null },
    gapFieldSize: { value: fieldSize },
    gapPages: { value: 0 },
    carmaPhotoGapFootprints: { value: 0 },
    carmaPhotoGapMetricToFootprint0: { value: metricToFootprint[0] },
    carmaPhotoGapMetricToFootprint1: { value: metricToFootprint[1] },
    carmaPhotoGapMetricToFootprint2: { value: metricToFootprint[2] },
    carmaPhotoGapMetricToFootprint3: { value: metricToFootprint[3] },
  };
  const rawUniforms: Record<string, THREE.IUniform> = { ...uniforms };
  for (const index of [0, 1]) {
    const slot = projection.screenOverlays?.[index];
    rawUniforms[`carmaScreenTexture${index}`] = slot?.texture ?? {
      value: null,
    };
    rawUniforms[`carmaScreenSceneToTexture${index}`] = slot?.sceneToTexture ?? {
      value: new THREE.Matrix4(),
    };
    rawUniforms[`carmaScreenSourceDepthTexture${index}`] =
      slot?.sourceDepthTexture ?? { value: null };
    rawUniforms[`carmaScreenSourceDepthSceneToClip${index}`] =
      slot?.sourceDepthSceneToClip ?? { value: new THREE.Matrix4() };
    rawUniforms[`carmaScreenSourceDepthNearFar${index}`] =
      slot?.sourceDepthNearFar ?? { value: new THREE.Vector2(1, 20000) };
    rawUniforms[`carmaScreenSourceDepthEnabled${index}`] =
      slot?.sourceDepthEnabled ?? { value: -1 };
    rawUniforms[`carmaScreenSourceDepthBias${index}`] =
      slot?.sourceDepthBias ?? { value: 0 };
  }
  const auxiliary = [0, 1].map((index) => {
    const slot = {
      texture: { value: null as THREE.Texture | null },
      sceneToTexture: { value: new THREE.Matrix4() },
      sourceDepthTexture: { value: null as THREE.Texture | null },
      sourceDepthSceneToClip: { value: new THREE.Matrix4() },
      sourceDepthNearFar: { value: new THREE.Vector2(1, 20000) },
      sourceDepthEnabled: { value: -1 },
      sourceDepthBias: { value: 0.1 },
      bounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    };
    for (const [name, uniform] of Object.entries(slot))
      rawUniforms[`gapAux${index}_${name}`] = uniform;
    return slot;
  });
  const auxiliaryHeader = [0, 1]
    .map(
      (index) => `
uniform sampler2D gapAux${index}_texture, gapAux${index}_sourceDepthTexture;
uniform mat4 gapAux${index}_sceneToTexture, gapAux${index}_sourceDepthSceneToClip;
uniform vec2 gapAux${index}_sourceDepthNearFar;
uniform float gapAux${index}_sourceDepthEnabled, gapAux${index}_sourceDepthBias;
uniform vec4 gapAux${index}_bounds;
vec4 gapAuxSample${index}(vec3 point){
 if(gapAux${index}_sourceDepthEnabled<0.0)return vec4(0.0);
 vec4 projected=gapAux${index}_sceneToTexture*vec4(point,1.0);
 if(projected.w<=0.0)return vec4(0.0);
 vec2 uv=projected.xy/projected.w;
 if(any(lessThan(uv,gapAux${index}_bounds.xy))||any(greaterThan(uv,gapAux${index}_bounds.zw)))return vec4(0.0);
 return carmaScreenProjectiveSample(gapAux${index}_texture,gapAux${index}_sceneToTexture,1.0,point,gapAux${index}_sourceDepthTexture,gapAux${index}_sourceDepthSceneToClip,gapAux${index}_sourceDepthNearFar,gapAux${index}_sourceDepthEnabled,gapAux${index}_sourceDepthBias);
}`
    )
    .join("\n");
  const geometryMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: `${PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL}\n${geometryHeader}
void main(){
 vec3 point;if(!gapPosition(point))discard;
 vec3 metric=(gapSceneToMetric*vec4(point,1.0)).xyz;
 gl_FragColor=vec4(metric,carmaGapInsideFootprints(metric)?2.0:1.0);
}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NoBlending,
  });
  const rawMaterial = new THREE.ShaderMaterial({
    uniforms: rawUniforms,
    vertexShader,
    fragmentShader: `${MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER}\n${geometryHeader}\n${auxiliaryHeader}
void main(){
 vec3 point;if(!gapPosition(point))discard;
 vec4 a=carmaScreenProjectiveSample(carmaScreenTexture0,carmaScreenSceneToTexture0,1.0,point,carmaScreenSourceDepthTexture0,carmaScreenSourceDepthSceneToClip0,carmaScreenSourceDepthNearFar0,carmaScreenSourceDepthEnabled0,carmaScreenSourceDepthBias0);
 vec4 b=carmaScreenProjectiveSample(carmaScreenTexture1,carmaScreenSceneToTexture1,1.0,point,carmaScreenSourceDepthTexture1,carmaScreenSourceDepthSceneToClip1,carmaScreenSourceDepthNearFar1,carmaScreenSourceDepthEnabled1,carmaScreenSourceDepthBias1);
 vec2 weights=carmaPhotoUnionWeights(a.a,b.a,1.0,1.0);float alpha=weights.x+weights.y;
 if(alpha>0.0){gl_FragColor=vec4((a.rgb*weights.x+b.rgb*weights.y)/alpha,alpha);return;}
 // Fixed capture priority, independent of the live view or heading blend.
 vec4 extra=gapAuxSample0(point);
 if(extra.a<=0.0)extra=gapAuxSample1(point);
 gl_FragColor=extra;
}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NoBlending,
  });
  const resolveMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: /* glsl */ `
uniform sampler2D gapRaw;uniform sampler2D gapDonors;uniform vec2 gapFieldSize;uniform float gapPages;varying vec2 gapUv;
void main(){
 if(texture2D(gapRaw,gapUv).a>0.0){gl_FragColor=vec4(0.0);return;}
 vec4 bytes=floor(texture2D(gapDonors,gapUv)*255.0+0.5);
 vec2 index=vec2(bytes.r+bytes.g*256.0,bytes.b+bytes.a*256.0);
 if(any(lessThan(index,vec2(0.5)))||any(greaterThan(index,gapFieldSize))){gl_FragColor=vec4(0.0);return;}
 vec2 localUv=(index-0.5)/gapFieldSize;
 vec2 seed=vec2((floor(gapUv.x*gapPages)+localUv.x)/gapPages,localUv.y);
 vec4 donor=texture2D(gapRaw,seed);
 gl_FragColor=donor.a>0.0?vec4(donor.rgb,1.0):vec4(0.0);
}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NoBlending,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rawMaterial);
  quad.frustumCulled = false;
  const scene = new THREE.Scene(),
    quadCamera = new THREE.Camera(),
    depthCamera = new THREE.Camera();
  scene.add(quad);
  const previousViewport = new THREE.Vector4(),
    previousScissor = new THREE.Vector4(),
    previousColor = new THREE.Color();
  let resources: Targets | undefined, worker: Worker | undefined;
  let epoch = 0,
    jobId = 0,
    activeId: string | undefined,
    reading = false,
    disposed = false;
  let pendingDonors: Uint8Array | undefined;
  let pendingGeometry: Float32Array | undefined;
  const jobs = new Map<
    number,
    {
      resolve: (reply: PhotoGapRepairReply) => void;
      reject: (error: Error) => void;
    }
  >();
  let stats = {
    active: false,
    width: 0,
    height: 0,
    allocatedBytes: 0,
    passes: 0,
    jumpPasses: 0,
    renders: 0,
    cacheHits: 0,
    pending: false,
    error: undefined as string | undefined,
  };

  const withRendererState = <T>(
    renderer: THREE.WebGLRenderer,
    host: SharedThreeHostRenderState | undefined,
    operation: () => T
  ): T => {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const previousTarget = renderer.getRenderTarget(),
      autoClear = renderer.autoClear;
    const framebuffer = host
      ? host.framebuffer
      : gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const depthRange = host
      ? previousTarget
        ? [0, 1]
        : host.depthRange
      : (gl.getParameter(gl.DEPTH_RANGE) as Float32Array);
    const pixelPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    renderer.getViewport(previousViewport);
    renderer.getScissor(previousScissor);
    renderer.getClearColor(previousColor);
    const scissorTest = renderer.getScissorTest(),
      clearAlpha = renderer.getClearAlpha();
    try {
      return operation();
    } finally {
      renderer.autoClear = autoClear;
      renderer.resetState();
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setRenderTarget(previousTarget);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(previousColor, clearAlpha);
      if (!previousTarget) {
        if (renderer.state)
          renderer.state.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        else gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelPack);
      gl.depthRange(depthRange[0], depthRange[1]);
    }
  };
  const disposeTargets = (value: Targets) => {
    value.depth.dispose();
    value.raw.dispose();
    value.geometry?.dispose();
    value.repairedGeometry?.dispose();
    value.color.dispose();
    value.donors?.dispose();
  };
  const clear = () => {
    epoch++;
    worker?.terminate();
    worker = undefined;
    for (const job of jobs.values())
      job.reject(new Error("Photo repair generation cancelled"));
    jobs.clear();
    pendingDonors = undefined;
    pendingGeometry = undefined;
    activeId = undefined;
    if (resources) {
      resources.retired = true;
      if (!resources.reading) disposeTargets(resources);
    }
    resources = undefined;
    uniforms.gapReceiverPosition.value =
      uniforms.gapRaw.value =
      uniforms.gapDonors.value =
        null;
    for (const slot of auxiliary) {
      slot.texture.value = slot.sourceDepthTexture.value = null;
      slot.sourceDepthEnabled.value = -1;
    }
    result.changed = !!result.texture;
    result.texture = result.geometry = null;
    result.pages = 0;
    result.footprints = uniforms.carmaPhotoGapFootprints.value = 0;
    fieldSize.set(0, 0);
    stats.active = stats.pending = false;
    stats.width = stats.height = stats.allocatedBytes = stats.passes = 0;
  };
  const fail = (error: unknown) => {
    stats.error = error instanceof Error ? error.message : String(error);
    stats.pending = stats.active = false;
    result.changed = !!result.texture;
    result.texture = result.geometry = null;
    result.pages = 0;
    result.footprints = uniforms.carmaPhotoGapFootprints.value = 0;
    worker?.terminate();
    worker = undefined;
    for (const job of jobs.values()) job.reject(new Error(stats.error));
    jobs.clear();
    requestRepaint?.();
  };
  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(
      new URL("./photo-gap-repair.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (event: MessageEvent<PhotoGapRepairReply>) => {
      const job = jobs.get(event.data.id);
      if (!job) return;
      jobs.delete(event.data.id);
      job.resolve(event.data);
    };
    worker.onerror = (event) => fail(event.error ?? new Error(event.message));
    return worker;
  };
  const askWorker = (input: PhotoGapRepairRequest["input"]) =>
    new Promise<PhotoGapRepairReply>((resolve, reject) => {
      const id = ++jobId;
      try {
        const instance = ensureWorker();
        jobs.set(id, { resolve, reject });
        instance.postMessage({ id, input } satisfies PhotoGapRepairRequest, [
          input.positions!.buffer,
          input.photograph!.buffer,
        ]);
      } catch (error) {
        jobs.delete(id);
        reject(error);
      }
    });
  const target = (
    width: number,
    height: number,
    type: THREE.TextureDataType
  ) => {
    const value = new THREE.WebGLRenderTarget(width, height, {
      type,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    value.texture.colorSpace = THREE.NoColorSpace;
    return value;
  };
  const beginReadback = (
    renderer: THREE.WebGLRenderer,
    value: Targets,
    host: SharedThreeHostRenderState | undefined,
    generation: number
  ) => {
    reading = value.reading = true;
    const pages = Array.from({ length: value.pages }, () => ({
      positions: new Float32Array(value.width * value.height * 4),
      photograph: new Uint8Array(value.width * value.height * 4),
    }));
    const reads: Promise<unknown>[] = [];
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      for (const [atlas, buffer] of [
        [value.geometry!, page.positions],
        [value.raw, page.photograph],
      ] as const) {
        try {
          // Three queues its PBO read synchronously before awaiting the fence.
          // Restore host framebuffer and PBO immediately, not after that await.
          reads.push(
            withRendererState(renderer, host, () =>
              renderer.readRenderTargetPixelsAsync(
                atlas,
                index * value.width,
                0,
                value.width,
                value.height,
                buffer
              )
            )
          );
        } catch (error) {
          reads.push(Promise.reject(error));
        }
      }
    }
    void Promise.allSettled(reads)
      .then(async (outcomes) => {
        reading = value.reading = false;
        if (value.retired) {
          disposeTargets(value);
          requestRepaint?.();
          return;
        }
        if (disposed || generation !== epoch) return;
        const rejected = outcomes.find(
          (outcome) => outcome.status === "rejected"
        );
        if (rejected?.status === "rejected") throw rejected.reason;
        value.geometry?.dispose();
        value.geometry = undefined;
        const geometry = new Float32Array(
          value.width * value.pages * value.height * 8
        );
        const donors = new Uint8Array(
          value.width * value.pages * value.height * 4
        );
        // Each page has its own connected-surface graph; atlas neighbours never connect.
        for (let index = 0; index < pages.length; index++) {
          const reply = await askWorker({
            ...pages[index],
            width: value.width,
            height: value.height,
            radiusMeters: PHOTO_GAP_REPAIR_RADIUS,
            planeToleranceMeters: PHOTO_GAP_REPAIR_PLANE_TOLERANCE,
            intersectionOnly: true,
          });
          if (disposed || generation !== epoch) return;
          if ("error" in reply) throw new Error(reply.error.message);
          if (
            reply.result.donorCoordinates.length !==
            value.width * value.height * 4
          )
            throw new Error("Invalid photo repair donor field");
          if (
            reply.result.surfaceAndDonorPositions.length !==
            value.width * value.height * 8
          )
            throw new Error("Invalid photo repair geometry field");
          for (let row = 0; row < value.height; row++)
            donors.set(
              reply.result.donorCoordinates.subarray(
                row * value.width * 4,
                (row + 1) * value.width * 4
              ),
              (row * value.width * value.pages + index * value.width) * 4
            );
          for (let row = 0; row < value.height * 2; row++)
            geometry.set(
              reply.result.surfaceAndDonorPositions.subarray(
                row * value.width * 4,
                (row + 1) * value.width * 4
              ),
              (row * value.width * value.pages + index * value.width) * 4
            );
        }
        pendingDonors = donors;
        pendingGeometry = geometry;
        requestRepaint?.();
      })
      .catch((error: unknown) => {
        if (!disposed && generation === epoch) fail(error);
      });
  };

  return {
    get state() {
      return { ...stats };
    },
    /** Views and donor ownership freeze until config.id changes. Returned buffers stay borrowed. */
    render(
      renderer: THREE.WebGLRenderer,
      _camera: THREE.Camera,
      viewport: THREE.Vector2,
      host?: SharedThreeHostRenderState,
      _contentRevision?: number,
      _depthRevision?: number,
      config?: PhotoGapRepairConfig
    ): PhotoGapRepairResult {
      result.changed = false;
      stats.passes = 0;
      const slots = projection.screenOverlays;
      if (disposed) return result;
      if (
        !config ||
        !slots?.every(
          (slot) =>
            slot.projective.value > 0.5 &&
            (slot.fillGaps?.value ?? 0) > 0.5 &&
            slot.texture.value
        )
      ) {
        if (activeId !== undefined) clear();
        return result;
      }
      const validMatrix = (matrix: THREE.Matrix4) =>
        matrix.elements.every(Number.isFinite) && matrix.determinant() !== 0;
      // Calibrated image projections may have z = w and therefore rank 3.
      // Only x/y/w describe the sensor; no inverse of this matrix is required.
      const validPhotoProjection = (matrix: THREE.Matrix4) => {
        const e = matrix.elements;
        if (!e.every(Number.isFinite)) return false;
        const x0 = e[0],
          x1 = e[4],
          x2 = e[8];
        const y0 = e[1],
          y1 = e[5],
          y2 = e[9];
        const w0 = e[3],
          w1 = e[7],
          w2 = e[11];
        const scale =
          Math.hypot(x0, x1, x2) *
          Math.hypot(y0, y1, y2) *
          Math.hypot(w0, w1, w2);
        const volume =
          x0 * (y1 * w2 - y2 * w1) -
          x1 * (y0 * w2 - y2 * w0) +
          x2 * (y0 * w1 - y1 * w0);
        return (
          Number.isFinite(scale) &&
          Number.isFinite(volume) &&
          scale > 0 &&
          Math.abs(volume) > Number.EPSILON * scale
        );
      };
      if (
        !validMatrix(config.sceneToMetric) ||
        config.views.length < 1 ||
        config.views.length > 3 ||
        !config.views.every(validMatrix)
      ) {
        if (activeId !== undefined) clear();
        return result;
      }
      if (!sceneToMetric.equals(config.sceneToMetric)) {
        sceneToMetric.copy(config.sceneToMetric);
        result.changed = !!result.texture;
      }
      if (activeId !== config.id) {
        clear();
        sceneToMetric.copy(config.sceneToMetric);
        // Retired readbacks must release their buffers before another generation allocates.
        if (
          reading ||
          slots.some((slot) => (slot.sourceDepthEnabled?.value ?? -1) < 0)
        )
          return result;
        stats.error = undefined;
        if (
          typeof Worker === "undefined" ||
          typeof renderer.readRenderTargetPixelsAsync !== "function" ||
          !renderer.extensions?.has("EXT_color_buffer_float")
        ) {
          activeId = config.id;
          fail(
            new Error(
              "Photo repair needs a worker and asynchronous float readback"
            )
          );
          return result;
        }
        const expected = config.auxiliaryExpected ?? 0;
        if (!Number.isInteger(expected) || expected < 0 || expected > 2)
          return result;
        const extras = [...(config.auxiliary ?? [])]
          .filter(
            (photo) =>
              photo.texture &&
              photo.opacity > 0 &&
              !photo.outline &&
              photo.sourceProjection &&
              validPhotoProjection(photo.sourceProjection) &&
              validPhotoProjection(photo.sceneToTexture) &&
              (!photo.textureBounds ||
                (photo.textureBounds.every(Number.isFinite) &&
                  photo.textureBounds[0] >= 0 &&
                  photo.textureBounds[1] >= 0 &&
                  photo.textureBounds[2] <= 1 &&
                  photo.textureBounds[3] <= 1 &&
                  photo.textureBounds[0] < photo.textureBounds[2] &&
                  photo.textureBounds[1] < photo.textureBounds[3]))
          )
          .sort((a, b) => b.priority - a.priority)
          .slice(0, 2);
        // Rest filling is defined only for a complete four-camera intersection.
        // Do not substitute cropped texture projections or a partial group.
        if (extras.length !== 2 || extras.length < expected) return result;
        const fullProjections = [
          slots[0].frameProjection?.value,
          slots[1].frameProjection?.value,
          extras[0].sourceProjection,
          extras[1].sourceProjection,
        ];
        if (
          !fullProjections.every(
            (matrix) => matrix && validPhotoProjection(matrix)
          )
        )
          return result;
        let readyExtras = 0;
        try {
          for (let index = 0; index < extras.length; index++) {
            const photo = extras[index];
            const source = sharedDepth.renderSource(
              renderer,
              photo.sourceProjection!,
              host
            );
            if (!source) continue;
            const slot = auxiliary[index];
            slot.texture.value = photo.texture;
            slot.sceneToTexture.value.copy(photo.sceneToTexture);
            slot.sourceDepthTexture.value = source.texture;
            slot.sourceDepthSceneToClip.value.copy(source.sceneToClip);
            slot.sourceDepthNearFar.value.copy(source.nearFar);
            slot.sourceDepthBias.value = source.biasMeters;
            slot.sourceDepthEnabled.value = 1;
            slot.bounds.value.fromArray(photo.textureBounds ?? [0, 0, 1, 1]);
            readyExtras++;
          }
        } catch (error) {
          activeId = config.id;
          fail(error);
          return result;
        }
        if (readyExtras !== 2) return result;
        const metricToScene = sceneToMetric.clone().invert();
        fullProjections.forEach((matrix, index) =>
          metricToFootprint[index].multiplyMatrices(matrix!, metricToScene)
        );
        result.footprints = uniforms.carmaPhotoGapFootprints.value = 4;
        activeId = config.id;
        const plan = photoGapRepairSize(
          viewport,
          config.views.length,
          renderer.capabilities.maxTextureSize
        );
        if (!plan) {
          fail(new Error("Invalid photo repair atlas extent"));
          return result;
        }
        config.views.forEach((view, index) => metricToClip[index].copy(view));
        fieldSize.set(plan.width, plan.height);
        resources = {
          depth: new THREE.WebGLRenderTarget(plan.width, plan.height, {
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: true,
            stencilBuffer: false,
          }),
          raw: target(
            plan.width * plan.pages,
            plan.height,
            THREE.UnsignedByteType
          ),
          geometry: target(
            plan.width * plan.pages,
            plan.height,
            THREE.FloatType
          ),
          color: target(
            plan.width * plan.pages,
            plan.height,
            THREE.UnsignedByteType
          ),
          width: plan.width,
          height: plan.height,
          pages: plan.pages,
          reading: false,
          retired: false,
        };
        resources.depth.depthTexture = new THREE.DepthTexture(
          plan.width,
          plan.height,
          THREE.UnsignedIntType
        );
        resources.depth.depthTexture.minFilter =
          resources.depth.depthTexture.magFilter = THREE.NearestFilter;
        resources.depth.texture.colorSpace = THREE.NoColorSpace;
        resources.depth.texture.generateMipmaps = false;
        uniforms.gapReceiverPosition.value = resources.depth.texture;
        uniforms.gapRaw.value = resources.raw.texture;
        uniforms.gapSceneToMetric.value.copy(sceneToMetric);
        uniforms.gapPages.value = plan.pages;
        stats.pending = true;
        stats.width = plan.width * plan.pages;
        stats.height = plan.height;
        stats.allocatedBytes = plan.allocatedBytes;
        const value = resources;
        try {
          withRendererState(renderer, host, () => {
            renderer.autoClear = false;
            renderer.setScissorTest(false);
            renderer.setClearColor(0, 0);
            renderer.getContext().depthRange(0, 1);
            for (const atlas of [value.raw, value.geometry!]) {
              renderer.setRenderTarget(atlas);
              renderer.clear(true, false, false);
            }
            for (let page = 0; page < plan.pages; page++) {
              depthCamera.projectionMatrix.multiplyMatrices(
                metricToClip[page],
                sceneToMetric
              );
              depthCamera.projectionMatrixInverse
                .copy(depthCamera.projectionMatrix)
                .invert();
              depthCamera.matrixWorld.identity();
              depthCamera.matrixWorldInverse.identity();
              renderer.setRenderTarget(value.depth);
              renderer.clear(true, true, false);
              sharedDepth.renderView(renderer, depthCamera, {
                positions: true,
              });
              for (const [atlas, material] of [
                [value.geometry!, geometryMaterial],
                [value.raw, rawMaterial],
              ] as const) {
                quad.material = material;
                renderer.setRenderTarget(atlas);
                renderer.setViewport(
                  page * plan.width,
                  0,
                  plan.width,
                  plan.height
                );
                renderer.render(scene, quadCamera);
              }
            }
          });
          stats.passes = plan.pages * 3;
          stats.renders++;
          beginReadback(renderer, value, host, epoch);
        } catch (error) {
          fail(error);
        }
      } else stats.cacheHits++;
      if (pendingDonors && pendingGeometry && resources && !stats.error) {
        const value = resources;
        value.donors = new THREE.DataTexture(
          pendingDonors,
          value.width * value.pages,
          value.height,
          THREE.RGBAFormat,
          THREE.UnsignedByteType
        );
        value.donors.minFilter = value.donors.magFilter = THREE.NearestFilter;
        value.donors.generateMipmaps = false;
        value.donors.needsUpdate = true;
        value.repairedGeometry = new THREE.DataTexture(
          pendingGeometry,
          value.width * value.pages,
          value.height * 2,
          THREE.RGBAFormat,
          THREE.FloatType
        );
        value.repairedGeometry.minFilter = value.repairedGeometry.magFilter =
          THREE.NearestFilter;
        value.repairedGeometry.generateMipmaps = false;
        value.repairedGeometry.needsUpdate = true;
        uniforms.gapDonors.value = value.donors;
        pendingDonors = undefined;
        pendingGeometry = undefined;
        try {
          withRendererState(renderer, host, () => {
            renderer.autoClear = false;
            renderer.setScissorTest(false);
            renderer.setClearColor(0, 0);
            renderer.getContext().depthRange(0, 1);
            quad.material = resolveMaterial;
            renderer.setRenderTarget(value.color);
            renderer.clear(true, false, false);
            renderer.render(scene, quadCamera);
          });
          result.texture = value.color.texture;
          result.geometry = value.repairedGeometry;
          result.pages = value.pages;
          result.changed = true;
          stats.pending = false;
          stats.active = true;
          stats.passes++;
        } catch (error) {
          fail(error);
        }
      }
      return result;
    },
    detach() {
      clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      quad.geometry.dispose();
      rawMaterial.dispose();
      geometryMaterial.dispose();
      resolveMaterial.dispose();
    },
  };
};
