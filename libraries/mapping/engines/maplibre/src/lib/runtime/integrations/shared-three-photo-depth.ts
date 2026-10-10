import * as THREE from "three";
import type {
  SharedThreeSceneRuntime,
  SharedThreeHostRenderState,
} from "../../core/shared-three-scene-types";

// RGBA8 attachment + conservatively budgeted 4-byte depth: at most 96 MiB for all source cameras.
const MAX_SOURCE_PIXELS = 12 * 1024 * 1024;
const MAX_SOURCE_EDGE = 2048;
const SOURCE_NEAR = 1;
const SOURCE_FAR = 20000;
const visible = (object: THREE.Object3D) => {
  for (
    let parent: THREE.Object3D | null = object;
    parent;
    parent = parent.parent
  )
    if (!parent.visible) return false;
  return true;
};
type Proxy = {
  source: THREE.Mesh;
  mesh: THREE.Mesh;
  geometryVersion: string;
  materials: THREE.Material | THREE.Material[];
  materialKey: string;
};
type Receiver = { root: THREE.Object3D; version: number; meshes: Proxy[] };

export type PhotoSourceDepth = Readonly<{
  texture: THREE.DepthTexture;
  sceneToClip: THREE.Matrix4;
  nearFar: THREE.Vector2;
  biasMeters: number;
  changed: boolean;
}>;
export type PhotoDepthSource = Readonly<{
  projection: THREE.Matrix4;
  width?: number;
  height?: number;
}>;
/** Snapshot pixels are already the displayed buffer demand, not native sensor dimensions. */
export const photoDepthSource = (
  projection: THREE.Matrix4,
  texture?: THREE.Texture | null
): PhotoDepthSource => {
  const image = texture?.image as
    | { width?: number; height?: number }
    | undefined;
  return { projection, width: image?.width, height: image?.height };
};
type SourceEntry = {
  width: number;
  height: number;
  clip: THREE.Matrix4;
  target?: THREE.WebGLRenderTarget;
  revision: number;
};

/** Calibrated UV/depth rows become an ordinary OpenGL perspective clip matrix.
 * Input w is positive optical depth in metres; input z is deliberately ignored.
 */
export const photoSourceClipMatrix = (
  projection: THREE.Matrix4,
  near = SOURCE_NEAR,
  far = SOURCE_FAR
): THREE.Matrix4 => {
  const e = projection.elements;
  const row = (index: number) => [
    e[index],
    e[index + 4],
    e[index + 8],
    e[index + 12],
  ];
  const x = row(0),
    y = row(1),
    w = row(3);
  const a = (far + near) / (far - near),
    b = (-2 * far * near) / (far - near);
  return new THREE.Matrix4().set(
    ...(x.map((value, i) => 2 * value - w[i]) as [
      number,
      number,
      number,
      number
    ]),
    ...(y.map((value, i) => 2 * value - w[i]) as [
      number,
      number,
      number,
      number
    ]),
    ...(w.map((value, i) => a * value + (i === 3 ? b : 0)) as [
      number,
      number,
      number,
      number
    ]),
    ...(w as [number, number, number, number])
  );
};

/** Own only depth proxies, materials and targets; source geometry/textures stay borrowed.
 * Call setSources with the complete active source set and sync before renderSource.
 */
export const createSharedThreePhotoDepth = (
  runtimes: ReadonlyMap<string, SharedThreeSceneRuntime>
) => {
  const receivers = new Map<string, Receiver>();
  const depthScene = new THREE.Scene();
  const depthMaterials = new Map<THREE.Material, THREE.MeshDepthMaterial>();
  const hiddenMaterial = new THREE.MeshDepthMaterial();
  hiddenMaterial.visible = false;
  let changed = false,
    revision = 0,
    receiverCount = 0;
  const sources = new Map<string, SourceEntry>();
  const sourceCamera = new THREE.Camera();
  sourceCamera.matrixAutoUpdate = false;
  const nearFar = new THREE.Vector2(SOURCE_NEAR, SOURCE_FAR);
  let sourceDepthRenders = 0,
    sourceCacheHits = 0;
  const keyOf = (matrix: THREE.Matrix4) => matrix.elements.join(",");
  const clearReceivers = () => {
    depthScene.clear();
    receivers.clear();
    depthMaterials.forEach((material) => material.dispose());
    depthMaterials.clear();
  };
  const usesAlpha = (source: THREE.Material) =>
    source.alphaTest > 0 ||
    source.alphaHash ||
    source.alphaToCoverage ||
    source.transparent;
  const materialFor = (source: THREE.Material) => {
    if (!source.visible) return hiddenMaterial;
    let material = depthMaterials.get(source);
    if (!material) {
      material = new THREE.MeshDepthMaterial({
        colorWrite: false,
        blending: THREE.NoBlending,
      });
      depthMaterials.set(source, material);
    }
    const shape = source as THREE.Material & {
      map?: THREE.Texture;
      alphaMap?: THREE.Texture;
      displacementMap?: THREE.Texture;
      displacementScale?: number;
      displacementBias?: number;
    };
    const alpha = usesAlpha(source);
    const map = alpha ? shape.map ?? null : null;
    const alphaMap = alpha ? shape.alphaMap ?? null : null;
    const programChanged =
      material.side !== source.side ||
      material.alphaTest !== source.alphaTest ||
      material.map !== map ||
      material.alphaMap !== alphaMap ||
      material.alphaHash !== source.alphaHash ||
      material.alphaToCoverage !== source.alphaToCoverage ||
      material.displacementMap !== (shape.displacementMap ?? null);
    material.side = source.side;
    material.alphaTest = source.alphaTest;
    material.opacity = source.opacity;
    material.map = map;
    material.alphaMap = alphaMap;
    material.alphaHash = source.alphaHash;
    material.alphaToCoverage = source.alphaToCoverage;
    material.displacementMap = shape.displacementMap ?? null;
    if (
      material.displacementScale !== (shape.displacementScale ?? 1) ||
      material.displacementBias !== (shape.displacementBias ?? 0)
    )
      changed = true;
    material.displacementScale = shape.displacementScale ?? 1;
    material.displacementBias = shape.displacementBias ?? 0;
    material.clippingPlanes = source.clippingPlanes;
    material.clipIntersection = source.clipIntersection;
    if (programChanged) {
      material.needsUpdate = true;
      changed = true;
    }
    return material;
  };
  const syncReceivers = () => {
    const ids = new Set<string>();
    let count = 0;
    for (const runtime of runtimes.values()) {
      if (
        !runtime.mountsOnLocalFrame ||
        !(runtime.providesTerrain || runtime.receivesScreenImages)
      )
        continue;
      ids.add(runtime.id);
      let entry = receivers.get(runtime.id);
      const version = runtime.mapStyleProjectionVersion?.() ?? 0;
      if (!entry || entry.root !== runtime.root || entry.version !== version) {
        // Visibility/publication revisions need a new membership audit, not
        // clones of every retained mesh. Keep identity and depth materials.
        const retained = new Map(
          entry?.meshes.map((proxy) => [proxy.source, proxy])
        );
        const meshes: Proxy[] = [];
        runtime.root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const existing = retained.get(object);
          if (existing) {
            meshes.push(existing);
            retained.delete(object);
            return;
          }
          changed = true;
          const proxy = object.clone(false);
          proxy.children.length = 0;
          proxy.matrixAutoUpdate = false;
          proxy.castShadow = false;
          proxy.receiveShadow = false;
          // Geometry/instance buffers are borrowed; only proxy objects are owned.
          if (
            object instanceof THREE.InstancedMesh &&
            proxy instanceof THREE.InstancedMesh
          ) {
            proxy.instanceMatrix = object.instanceMatrix;
            proxy.instanceColor = object.instanceColor;
          }
          proxy.onBeforeRender = () => {};
          proxy.onAfterRender = () => {};
          meshes.push({
            source: object,
            mesh: proxy,
            geometryVersion: "",
            materials: object.material,
            materialKey: "",
          });
          depthScene.add(proxy);
        });
        for (const removed of retained.values()) {
          depthScene.remove(removed.mesh);
          changed = true;
        }
        entry = { root: runtime.root, version, meshes };
        receivers.set(runtime.id, entry);
      }
      for (const proxy of entry.meshes) {
        const source = proxy.source,
          mesh = proxy.mesh;
        const shown =
          visible(source) && runtime.hasRenderableContent?.() !== false;
        if (
          mesh.visible !== shown ||
          !mesh.matrix.equals(source.matrixWorld) ||
          mesh.geometry !== source.geometry
        )
          changed = true;
        mesh.visible = shown;
        mesh.matrix.copy(source.matrixWorld);
        mesh.geometry = source.geometry;
        if (mesh.layers.mask !== source.layers.mask) changed = true;
        mesh.layers.mask = source.layers.mask;
        if (
          source instanceof THREE.InstancedMesh &&
          mesh instanceof THREE.InstancedMesh
        ) {
          if (
            mesh.count !== source.count ||
            mesh.instanceMatrix !== source.instanceMatrix
          )
            changed = true;
          mesh.count = source.count;
          mesh.instanceMatrix = source.instanceMatrix;
          mesh.morphTexture = source.morphTexture;
        }
        if (source.morphTargetInfluences) {
          if (
            !mesh.morphTargetInfluences ||
            source.morphTargetInfluences.some(
              (weight, index) => mesh.morphTargetInfluences![index] !== weight
            )
          )
            changed = true;
          mesh.morphTargetInfluences = [...source.morphTargetInfluences];
        }
        // Skinned pose matrices are updated by Three during rendering, after
        // this synchronization. Re-render their depth rather than cache old bones.
        if (source instanceof THREE.SkinnedMesh && shown) changed = true;
        const attributes = source.geometry.attributes;
        const position = attributes.position;
        const positionVersion =
          position instanceof THREE.InterleavedBufferAttribute
            ? position.data.version
            : position?.version ?? 0;
        const geometryVersion = `${source.geometry.id}:${positionVersion}:${
          source.geometry.index?.version ?? 0
        }:${source.geometry.drawRange.start}:${
          source.geometry.drawRange.count
        }:${
          source instanceof THREE.InstancedMesh
            ? source.instanceMatrix.version
            : 0
        }`;
        if (
          proxy.geometryVersion !== geometryVersion ||
          proxy.materials !== source.material
        )
          changed = true;
        proxy.geometryVersion = geometryVersion;
        proxy.materials = source.material;
        const originals = Array.isArray(source.material)
          ? source.material
          : [source.material];
        const materialKey = originals
          .map((material) => {
            // Opaque RGB maps cannot change a first-hit surface. Avoid walking
            // their texture matrices (and avoid compiling map sampling in depth).
            let key = `${material.uuid}:${material.version}:${material.visible}:${material.side}:${material.alphaTest}:${material.opacity}:${material.alphaHash}:${material.alphaToCoverage}:${material.transparent}:${material.clipIntersection}`;
            const shape = material as THREE.Material & {
              map?: THREE.Texture;
              alphaMap?: THREE.Texture;
              displacementMap?: THREE.Texture;
              displacementScale?: number;
              displacementBias?: number;
            };
            const appendTexture = (texture: THREE.Texture | undefined) => {
              if (texture)
                key += `:${texture.id}:${
                  texture.version
                }:${texture.matrix.elements.join(",")}`;
              else key += ":-";
            };
            if (usesAlpha(material)) {
              appendTexture(shape.map);
              appendTexture(shape.alphaMap);
            }
            if (shape.displacementMap) {
              appendTexture(shape.displacementMap);
              key += `:${shape.displacementScale}:${shape.displacementBias}`;
            }
            for (const plane of material.clippingPlanes ?? [])
              key += `:${plane.normal.x}:${plane.normal.y}:${plane.normal.z}:${plane.constant}`;
            return key;
          })
          .join("/");
        const changedMaterials = proxy.materialKey !== materialKey;
        if (changedMaterials) {
          mesh.material = Array.isArray(source.material)
            ? source.material.map(materialFor)
            : materialFor(source.material);
          proxy.materialKey = materialKey;
          changed = true;
        } else originals.forEach(materialFor);
        if (shown) count++;
      }
    }
    for (const [id, entry] of receivers)
      if (!ids.has(id)) {
        entry.meshes.forEach((proxy) => depthScene.remove(proxy.mesh));
        receivers.delete(id);
        changed = true;
      }
    const usedMaterials = new Set<THREE.Material>();
    for (const receiver of receivers.values())
      for (const proxy of receiver.meshes) {
        const material = proxy.source.material;
        if (Array.isArray(material))
          material.forEach((item) => usedMaterials.add(item));
        else usedMaterials.add(material);
      }
    for (const [source, material] of depthMaterials)
      if (!usedMaterials.has(source)) {
        material.dispose();
        depthMaterials.delete(source);
      }
    receiverCount = count;
  };

  const releaseSources = () => {
    for (const source of sources.values()) source.target?.dispose();
    sources.clear();
  };
  return {
    get state() {
      const sizes = [...sources.values()].flatMap((source) =>
        source.target
          ? [{ width: source.target.width, height: source.target.height }]
          : []
      );
      return {
        sources: sources.size,
        targets: sizes.length,
        allocatedBytes: sizes.reduce(
          (sum, size) => sum + size.width * size.height * 8,
          0
        ),
        maxPixels: MAX_SOURCE_PIXELS,
        sizes,
        depthRenderCount: sourceDepthRenders,
        cacheHits: sourceCacheHits,
        revision,
        receivers: receiverCount,
      };
    },
    setSources(requests: readonly (THREE.Matrix4 | PhotoDepthSource)[]) {
      const wanted = new Map<
        string,
        { projection: THREE.Matrix4; width: number; height: number }
      >();
      for (const request of requests) {
        const input: PhotoDepthSource =
          "elements" in request ? { projection: request } : request;
        const projection = input.projection;
        if (!projection.elements.every(Number.isFinite)) continue;
        const clip = photoSourceClipMatrix(projection);
        if (!Number.isFinite(clip.determinant()) || clip.determinant() === 0)
          continue;
        const validSize =
          Number.isFinite(input.width) &&
          Number.isFinite(input.height) &&
          input.width! > 0 &&
          input.height! > 0;
        const rawWidth = validSize ? input.width! : MAX_SOURCE_EDGE;
        const rawHeight = validSize ? input.height! : MAX_SOURCE_EDGE;
        const scale = Math.min(
          1,
          MAX_SOURCE_EDGE / Math.max(rawWidth, rawHeight)
        );
        const width = Math.max(1, Math.floor(rawWidth * scale)),
          height = Math.max(1, Math.floor(rawHeight * scale));
        const key = keyOf(projection),
          previous = wanted.get(key);
        // A base and detailed crop of one camera share the largest displayed snapshot.
        if (!previous || width * height > previous.width * previous.height)
          wanted.set(key, { projection, width, height });
      }
      const pixels = [...wanted.values()].reduce(
        (total, item) => total + item.width * item.height,
        0
      );
      const budgetScale = Math.min(
        1,
        Math.sqrt(MAX_SOURCE_PIXELS / Math.max(1, pixels))
      );
      for (const [key, source] of sources)
        if (!wanted.has(key)) {
          source.target?.dispose();
          sources.delete(key);
        }
      for (const [key, item] of wanted) {
        const width = Math.max(1, Math.floor(item.width * budgetScale)),
          height = Math.max(1, Math.floor(item.height * budgetScale));
        let source = sources.get(key);
        if (!source) {
          source = {
            width,
            height,
            clip: photoSourceClipMatrix(item.projection),
            revision: -1,
          };
          sources.set(key, source);
        } else if (source.width !== width || source.height !== height) {
          source.target?.dispose();
          source.target = undefined;
          source.revision = -1;
          source.width = width;
          source.height = height;
        }
      }
    },
    sync() {
      changed = false;
      syncReceivers();
      if (changed) revision++;
      return { revision, receivers: receiverCount };
    },
    renderView(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
      renderer.render(depthScene, camera);
    },
    renderSource(
      renderer: THREE.WebGLRenderer,
      projection: THREE.Matrix4,
      hostRenderState?: SharedThreeHostRenderState
    ): PhotoSourceDepth | null {
      const source = sources.get(keyOf(projection));
      if (!source || !receiverCount) return null;
      const scale = Math.min(
        1,
        renderer.capabilities.maxTextureSize /
          Math.max(source.width, source.height)
      );
      const width = Math.max(1, Math.floor(source.width * scale)),
        height = Math.max(1, Math.floor(source.height * scale));
      if (
        !source.target ||
        source.target.width !== width ||
        source.target.height !== height
      ) {
        source.target?.dispose();
        source.target = new THREE.WebGLRenderTarget(width, height, {
          depthBuffer: true,
          stencilBuffer: false,
        });
        source.target.depthTexture = new THREE.DepthTexture(
          width,
          height,
          THREE.UnsignedIntType
        );
        source.target.depthTexture.minFilter =
          source.target.depthTexture.magFilter = THREE.NearestFilter;
        source.revision = -1;
      }
      const needsRender = source.revision !== revision;
      if (needsRender) {
        sourceCamera.projectionMatrix.copy(source.clip);
        sourceCamera.projectionMatrixInverse.copy(source.clip).invert();
        sourceCamera.matrixWorld.identity();
        sourceCamera.matrixWorldInverse.identity();
        const gl = renderer.getContext();
        const target = renderer.getRenderTarget(),
          autoClear = renderer.autoClear;
        const framebuffer = hostRenderState
          ? hostRenderState.framebuffer
          : gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const depthRange = hostRenderState
          ? target
            ? [0, 1]
            : hostRenderState.depthRange
          : (gl.getParameter(gl.DEPTH_RANGE) as Float32Array);
        const viewport = renderer.getViewport(new THREE.Vector4()),
          scissor = renderer.getScissor(new THREE.Vector4());
        const scissorTest = renderer.getScissorTest();
        const color = renderer.getClearColor(new THREE.Color()),
          alpha = renderer.getClearAlpha();
        try {
          renderer.autoClear = false;
          renderer.setScissorTest(false);
          renderer.setClearColor(0, 0);
          gl.depthRange(0, 1);
          renderer.setRenderTarget(source.target);
          renderer.clear(true, true, false);
          renderer.render(depthScene, sourceCamera);
          source.revision = revision;
          sourceDepthRenders++;
        } finally {
          renderer.autoClear = autoClear;
          // A source pass can run inside the mosaic color pass. resetState
          // clears Three's current-target bookkeeping, so restore it afterwards.
          renderer.resetState();
          renderer.setViewport(viewport);
          renderer.setScissor(scissor);
          // getViewport/getScissor describe the canvas defaults. Restore those
          // before the target, whose own physical viewport must win when nested.
          renderer.setRenderTarget(target);
          renderer.setScissorTest(scissorTest);
          renderer.setClearColor(color, alpha);
          if (!target) {
            if (renderer.state)
              renderer.state.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            else gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          }
          gl.depthRange(depthRange[0], depthRange[1]);
        }
      } else sourceCacheHits++;
      return {
        texture: source.target.depthTexture!,
        sceneToClip: source.clip,
        nearFar,
        biasMeters: 0.1,
        changed: needsRender,
      };
    },
    detach() {
      releaseSources();
      clearReceivers();
      receiverCount = 0;
      revision++;
    },
    dispose() {
      releaseSources();
      clearReceivers();
      hiddenMaterial.dispose();
      receiverCount = 0;
      revision++;
    },
  };
};
export type SharedThreePhotoDepth = ReturnType<
  typeof createSharedThreePhotoDepth
>;
