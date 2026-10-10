import type { SharedThreeHostRenderState } from "../../core/shared-three-scene-types";
import * as THREE from "three";
import {
  createSharedThreePhotoDepth,
  photoDepthSource,
  type SharedThreePhotoDepth,
} from "./shared-three-photo-depth";
import { PHOTO_SOURCE_DEPTH_GLSL } from "../../core/shared-three-map-style-shaders";
import { fitRenderTargetSizeToPixelBudget } from "@carma-mapping/engines/three/primitives/rendering";
import type {
  MapStylePhotoMosaicEntry,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";

// RGBA color + depth + composed RGBA use at most 192 MiB, independent of photo count.
const MAX_PIXELS = 16 * 1024 * 1024;
type Photo = MapStylePhotoMosaicEntry & { version: number };

/** Borrow geometry once per receiver revision; compose arbitrary photos with two samplers. */
export const createSharedThreePhotoMosaic = (
  runtimes: ReadonlyMap<string, SharedThreeSceneRuntime>,
  sharedDepth?: SharedThreePhotoDepth
) => {
  const groups = new Map<string, readonly Photo[]>();
  const depth = sharedDepth ?? createSharedThreePhotoDepth(runtimes);
  let previousDepthRevision = -1;
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.Camera();
  const uniforms = {
    depth: { value: null as THREE.Texture | null },
    photograph: { value: null as THREE.Texture | null },
    clipToScene: { value: new THREE.Matrix4() },
    sceneToPhoto: { value: new THREE.Matrix4() },
    opacity: { value: 1 },
    sourceDepth: { value: null as THREE.Texture | null },
    sourceClip: { value: new THREE.Matrix4() },
    sourceNearFar: { value: new THREE.Vector2(1, 20000) },
    sourceBias: { value: 0.1 },
    sourceDepthEnabled: { value: 0 },
    outlineWidth: { value: 0 },
    outlineColor: { value: new THREE.Color() },
    outputPixelsPerCss: { value: new THREE.Vector2(1, 1) },
  };
  const quadMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec2 screenUv; void main(){screenUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: `varying vec2 screenUv; uniform sampler2D depth; uniform sampler2D photograph;
uniform mat4 clipToScene; uniform mat4 sceneToPhoto; uniform float opacity;
uniform sampler2D sourceDepth; uniform mat4 sourceClip; uniform vec2 sourceNearFar;
uniform float sourceBias; uniform float sourceDepthEnabled;
${PHOTO_SOURCE_DEPTH_GLSL}
uniform float outlineWidth; uniform vec3 outlineColor; uniform vec2 outputPixelsPerCss;
void main(){
  float z=texture2D(depth,screenUv).x;
  if(z>=1.0)discard;
  vec4 point=clipToScene*vec4(screenUv*2.0-1.0,z*2.0-1.0,1.0);
  if(abs(point.w)<0.0000001)discard;
  vec3 position=point.xyz/point.w;
  if(sourceDepthEnabled<0.0)discard;
  if(sourceDepthEnabled>0.0&&!carmaPhotoSourceVisible(sourceDepth,sourceClip,sourceNearFar,sourceBias,position))discard;
  vec4 photo=sceneToPhoto*vec4(position,1.0);
  if(photo.w<=0.0)discard;
  vec2 uv=photo.xy/photo.w;
  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))discard;
  if(outlineWidth>0.0){
    vec2 dx=dFdx(uv)*outputPixelsPerCss.x;
    vec2 dy=dFdy(uv)*outputPixelsPerCss.y;
    vec2 gradient=max(sqrt(dx*dx+dy*dy),vec2(0.0000001));
    vec2 edge=min(uv,vec2(1.0)-uv)/gradient;
    float distance=min(edge.x,edge.y);
    vec2 aa=fwidth(uv)/gradient;
    float feather=max(0.0001,0.5*max(aa.x,aa.y));
    float alpha=(1.0-smoothstep(outlineWidth-feather,outlineWidth+feather,distance))*opacity;
    if(alpha<=0.0)discard;
    gl_FragColor=vec4(outlineColor*alpha,alpha);
    return;
  }
  vec4 color=texture2D(photograph,uv);color.a*=opacity;
  gl_FragColor=vec4(color.rgb*color.a,color.a);
}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    // Premultiplied accumulation, sampled as such by the receiver shader.
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);
  let depthTarget: THREE.WebGLRenderTarget | undefined;
  let colorTarget: THREE.WebGLRenderTarget | undefined;
  let photos: readonly Photo[] = [];
  let dirty = true;
  let depthDirty = true;
  const previousClip = new THREE.Matrix4();
  let stats = {
    requestedWidth: 0,
    requestedHeight: 0,
    width: 0,
    height: 0,
    reduced: false,
    photos: 0,
    receivers: 0,
    passes: 0,
  };
  const releaseTargets = () => {
    depthTarget?.dispose();
    colorTarget?.dispose();
    depthTarget = colorTarget = undefined;
    uniforms.depth.value = null;
    depthDirty = dirty = true;
  };
  return {
    get sourceProjections() {
      return photos.flatMap((photo) =>
        photo.sourceProjection ? [photo.sourceProjection] : []
      );
    },
    get sourceDepthRequests() {
      return photos.flatMap((photo) =>
        photo.sourceProjection
          ? [photoDepthSource(photo.sourceProjection, photo.texture)]
          : []
      );
    },
    get active() {
      return photos.length > 0;
    },
    get state() {
      return { ...stats };
    },
    set(id: string, entries: readonly MapStylePhotoMosaicEntry[] | null) {
      const valid =
        entries?.filter(
          (entry) =>
            entry.opacity > 0 &&
            Number.isFinite(entry.opacity) &&
            Number.isFinite(entry.priority) &&
            entry.sceneToTexture.elements.every(Number.isFinite) &&
            (!entry.outline ||
              (entry.outline.width > 0 &&
                Number.isFinite(entry.outline.width) &&
                entry.outline.color.toArray().every(Number.isFinite)))
        ) ?? [];
      const previous = groups.get(id);
      if (
        valid.length === (previous?.length ?? 0) &&
        valid.every((entry, index) => {
          const old = previous![index];
          return (
            old.texture === entry.texture &&
            old.version === entry.texture.version &&
            old.opacity === entry.opacity &&
            old.priority === entry.priority &&
            old.outline?.width === entry.outline?.width &&
            (!entry.outline ||
              !!old.outline?.color.equals(entry.outline.color)) &&
            old.sceneToTexture.equals(entry.sceneToTexture) &&
            (old.sourceProjection === undefined
              ? entry.sourceProjection === undefined
              : !!entry.sourceProjection &&
                old.sourceProjection.equals(entry.sourceProjection))
          );
        })
      )
        return false;
      if (valid.length)
        groups.set(
          id,
          valid.map((entry) => ({
            ...entry,
            sceneToTexture: entry.sceneToTexture.clone(),
            sourceProjection: entry.sourceProjection?.clone(),
            outline: entry.outline
              ? { ...entry.outline, color: entry.outline.color.clone() }
              : undefined,
            version: entry.texture.version,
          }))
        );
      else groups.delete(id);
      photos = [...groups.values()]
        .flat()
        .sort((a, b) => a.priority - b.priority);
      stats.photos = photos.length;
      dirty = true;
      if (!photos.length) {
        releaseTargets();
        if (!sharedDepth) depth.detach();
        stats = { ...stats, width: 0, height: 0, receivers: 0, passes: 0 };
      }
      return true;
    },
    render(
      renderer: THREE.WebGLRenderer,
      camera: THREE.Camera,
      viewport: THREE.Vector2,
      preparedDepth?: ReturnType<SharedThreePhotoDepth["sync"]>,
      hostRenderState?: SharedThreeHostRenderState
    ) {
      if (!photos.length) return { texture: null, changed: false };
      if (!sharedDepth) depth.setSources(this.sourceDepthRequests);
      // The projection owner may already have synchronized this shared provider
      // immediately before rendering. Explicit call-local state cannot go stale
      // across independent renders, unlike a global frame/time cache.
      const receiverState = preparedDepth ?? depth.sync();
      stats.receivers = receiverState.receivers;
      if (previousDepthRevision !== receiverState.revision) {
        previousDepthRevision = receiverState.revision;
        depthDirty = dirty = true;
      }
      for (const photo of photos)
        if (photo.version !== photo.texture.version) {
          photo.version = photo.texture.version;
          dirty = true;
        }
      const clip = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      if (!previousClip.equals(clip)) depthDirty = dirty = true;
      const requestedWidth = Math.max(1, Math.floor(viewport.x)),
        requestedHeight = Math.max(1, Math.floor(viewport.y));
      const maxSize = renderer.capabilities.maxTextureSize;
      const scale = Math.min(
        1,
        maxSize / requestedWidth,
        maxSize / requestedHeight
      );
      const size = fitRenderTargetSizeToPixelBudget(
        requestedWidth * scale,
        requestedHeight * scale,
        MAX_PIXELS
      );
      stats = {
        ...stats,
        requestedWidth,
        requestedHeight,
        ...size,
        reduced:
          size.width !== requestedWidth || size.height !== requestedHeight,
      };
      if (
        !depthTarget ||
        depthTarget.width !== size.width ||
        depthTarget.height !== size.height
      ) {
        releaseTargets();
        depthTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
          depthBuffer: true,
          stencilBuffer: false,
        });
        depthTarget.depthTexture = new THREE.DepthTexture(
          size.width,
          size.height,
          THREE.UnsignedIntType
        );
        colorTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
          depthBuffer: false,
          stencilBuffer: false,
        });
        colorTarget.texture.colorSpace = THREE.NoColorSpace;
        uniforms.depth.value = depthTarget.depthTexture;
      }
      // MapLibre owns canvas sizing and does not set Three's pixel ratio. Use
      // the actual composer target/CSS ratio, including any target budget reduction.
      const canvas = renderer.domElement;
      const cssWidth = canvas?.clientWidth || requestedWidth;
      const cssHeight = canvas?.clientHeight || requestedHeight;
      const ratioX = size.width / cssWidth,
        ratioY = size.height / cssHeight;
      if (
        uniforms.outputPixelsPerCss.value.x !== ratioX ||
        uniforms.outputPixelsPerCss.value.y !== ratioY
      ) {
        uniforms.outputPixelsPerCss.value.set(ratioX, ratioY);
        if (photos.some((photo) => photo.outline)) dirty = true;
      }
      if (!dirty) return { texture: colorTarget!.texture, changed: false };
      const gl = renderer.getContext();
      const previousTarget = renderer.getRenderTarget(),
        autoClear = renderer.autoClear;
      const framebuffer = hostRenderState
        ? hostRenderState.framebuffer
        : gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const depthRange = hostRenderState
        ? previousTarget
          ? [0, 1]
          : hostRenderState.depthRange
        : (gl.getParameter(gl.DEPTH_RANGE) as Float32Array);
      const previousViewport = renderer.getViewport(new THREE.Vector4()),
        scissor = renderer.getScissor(new THREE.Vector4());
      const scissorTest = renderer.getScissorTest(),
        clearColor = renderer.getClearColor(new THREE.Color()),
        clearAlpha = renderer.getClearAlpha();
      try {
        renderer.autoClear = false;
        renderer.setScissorTest(false);
        gl.depthRange(0, 1);
        renderer.setClearColor(0, 0);
        const renderedDepth = depthDirty;
        if (renderedDepth) {
          renderer.setRenderTarget(depthTarget);
          renderer.clear(true, true, false);
          depth.renderView(renderer, camera);
          depthDirty = false;
        }
        renderer.setRenderTarget(colorTarget!);
        renderer.clear(true, false, false);
        uniforms.clipToScene.value.copy(clip).invert();
        for (const photo of photos) {
          const source = photo.sourceProjection
            ? depth.renderSource(
                renderer,
                photo.sourceProjection,
                hostRenderState
              )
            : null;
          uniforms.sourceDepthEnabled.value = photo.sourceProjection
            ? source
              ? 1
              : -1
            : 0;
          if (source) {
            uniforms.sourceDepth.value = source.texture;
            uniforms.sourceClip.value.copy(source.sceneToClip);
            uniforms.sourceNearFar.value.copy(source.nearFar);
            uniforms.sourceBias.value = source.biasMeters;
          }
          uniforms.photograph.value = photo.texture;
          uniforms.sceneToPhoto.value.copy(photo.sceneToTexture);
          uniforms.opacity.value = Math.min(1, photo.opacity);
          uniforms.outlineWidth.value = photo.outline?.width ?? 0;
          if (photo.outline)
            uniforms.outlineColor.value.copy(photo.outline.color);
          else uniforms.outlineColor.value.setRGB(1, 1, 1);
          renderer.render(quadScene, quadCamera);
        }
        stats.passes = photos.length + (renderedDepth ? 1 : 0);
        previousClip.copy(clip);
        dirty = false;
        return { texture: colorTarget!.texture, changed: true };
      } finally {
        renderer.autoClear = autoClear;
        renderer.resetState();
        renderer.setViewport(previousViewport);
        renderer.setScissor(scissor);
        renderer.setRenderTarget(previousTarget);
        renderer.setScissorTest(scissorTest);
        renderer.setClearColor(clearColor, clearAlpha);
        if (!previousTarget) {
          if (renderer.state)
            renderer.state.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          else gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        }
        gl.depthRange(depthRange[0], depthRange[1]);
      }
    },
    detach() {
      releaseTargets();
      if (!sharedDepth) depth.detach();
      stats = { ...stats, width: 0, height: 0, receivers: 0, passes: 0 };
    },
    dispose() {
      releaseTargets();
      if (!sharedDepth) depth.detach();
      groups.clear();
      photos = [];
      quad.geometry.dispose();
      quadMaterial.dispose();
      if (!sharedDepth) depth.dispose();
    },
  };
};
