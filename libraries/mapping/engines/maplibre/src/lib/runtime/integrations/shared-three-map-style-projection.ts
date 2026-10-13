import * as THREE from "three";
import { MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER } from "../../core/shared-three-map-style-shaders";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  SharedThreeSceneRuntime,
  SharedThreeHostRenderState,
  MapStyleProjectionUniforms,
  MapStyleProjectiveOverlay,
  MapStyleScreenOverlay,
  MapStylePhotoMosaicEntry,
  MapStyleAxisBoundaryOverlay,
  SharedThreeSceneLocalFrame,
} from "../../core/shared-three-scene-types";
import {
  createSharedThreePhotoDepth,
  photoDepthSource,
} from "./shared-three-photo-depth";
import { createSharedThreePhotoMosaic } from "./shared-three-photo-mosaic";
import { createSharedThreePhotoGapRepair } from "./shared-three-photo-gap-repair";
import { createMapStyleFramebufferCache } from "./map-style-framebuffer-cache";
import {
  configureMapStyleProjectedMaterial,
  setMapStyleAxisBoundaryUniforms,
} from "./shared-three-map-style-material";
import { type AxisBoundarySite } from "./shared-three-axis-boundaries";
import { createSharedThreeAxisBoundaryDisplay } from "./shared-three-axis-boundary-display";

/**
 * The internal pieces of MapLibre's terrain that hold the DEM depth pass:
 * `Terrain.getFramebuffer("depth")` renders the DEM with `terrainDepth`, which
 * packs `gl_Position.z / gl_Position.w` into RGBA8 (see terrain_depth.fragment).
 */
type MapLibreTerrainDepthHost = {
  terrain?: {
    _fboDepthTexture?: { texture?: WebGLTexture | null } | null;
  } | null;
  transform?: { nearZ?: number; farZ?: number };
};

export const createSharedThreeMapStyleProjection = (
  layerId: string,
  runtimes: ReadonlyMap<string, SharedThreeSceneRuntime>,
  viewport: THREE.Vector2
) => {
  const axisOverlays = new Map<string, MapStyleAxisBoundaryOverlay>();
  const axisReceivers = new Set<THREE.Material>();
  let axisVisibleBounds: THREE.Box3 | null = new THREE.Box3();
  let axisBoundsRevision = "";
  const axisReferenceToMetric = new THREE.Matrix4();
  const axisSceneToMetric = new THREE.Matrix4();
  let axisSourceCount = 0;
  let axisBoundaryError: string | undefined;
  const photoDepth = createSharedThreePhotoDepth(runtimes);
  let axisPreparedDepth: ReturnType<typeof photoDepth.sync> | undefined;
  const photoMosaic = createSharedThreePhotoMosaic(runtimes, photoDepth);
  const axisBoundaries = createSharedThreeAxisBoundaryDisplay(
    runtimes,
    photoDepth,
    {
      requestRepaint: () => map?.triggerRepaint(),
    }
  );
  let screenSourceProjections: (THREE.Matrix4 | undefined)[] = [];
  let photoMosaicError: string | undefined;
  let photoGapError: string | undefined;
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let mapStyleProjectionVisible = true;
  let presentationEnabled = true;
  let mapStyleProjectionEpoch = 0;
  let capturedMapStyleRevision = -1;
  const mapStyleProjectionUniforms: MapStyleProjectionUniforms = {
    texture: { value: null },
    sceneToClip: { value: new THREE.Matrix4() },
    enabled: { value: 0 },
    depthTexture: { value: null },
    depthEnabled: { value: 0 },
    depthNearFar: { value: new THREE.Vector2(1, 1000) },
    texelSize: { value: new THREE.Vector2(1, 1) },
    photoMosaic: {
      texture: { value: null },
      opacity: { value: 0 },
      navigationGroup: { value: 0 },
    },
    photoGapRepair: {
      texture: { value: null },
      geometry: { value: null },
      enabled: { value: 0 },
      sceneToMetric: { value: new THREE.Matrix4() },
      metricToClip: [0, 1, 2].map(() => ({
        value: new THREE.Matrix4(),
      })) as unknown as readonly [
        { value: THREE.Matrix4 },
        { value: THREE.Matrix4 },
        { value: THREE.Matrix4 }
      ],
      metricToFootprint: [
        { value: new THREE.Matrix4() },
        { value: new THREE.Matrix4() },
        { value: new THREE.Matrix4() },
        { value: new THREE.Matrix4() },
      ],
      footprints: { value: 0 },
      fieldSize: { value: new THREE.Vector2(1, 1) },
      pages: { value: 0 },
    },
    screenOverlays: [
      {
        texture: { value: null },
        viewportToTexture: { value: new THREE.Matrix3() },
        sceneToTexture: { value: new THREE.Matrix4() },
        sourceDepthTexture: { value: null },
        sourceDepthSceneToClip: { value: new THREE.Matrix4() },
        sourceDepthNearFar: { value: new THREE.Vector2(1, 20000) },
        sourceDepthEnabled: { value: 0 },
        sourceDepthBias: { value: 0 },
        frameProjection: { value: new THREE.Matrix4() },
        frameStyle: { value: new THREE.Vector4(0, 0, 0, 0) },
        frameEnabled: { value: 0 },
        frameCoverage: { value: 1 },
        projective: { value: 0 },
        underlay: { value: 0 },
        fillGaps: { value: 0 },
        opacity: { value: 0 },
      },
      {
        texture: { value: null },
        viewportToTexture: { value: new THREE.Matrix3() },
        sceneToTexture: { value: new THREE.Matrix4() },
        sourceDepthTexture: { value: null },
        sourceDepthSceneToClip: { value: new THREE.Matrix4() },
        sourceDepthNearFar: { value: new THREE.Vector2(1, 20000) },
        sourceDepthEnabled: { value: 0 },
        sourceDepthBias: { value: 0 },
        frameProjection: { value: new THREE.Matrix4() },
        frameStyle: { value: new THREE.Vector4(0, 0, 0, 0) },
        frameEnabled: { value: 0 },
        frameCoverage: { value: 1 },
        projective: { value: 0 },
        underlay: { value: 0 },
        fillGaps: { value: 0 },
        opacity: { value: 0 },
      },
    ],
    screenBasemapLabels: { value: 1 },
    screenBackdropOverride: { value: new THREE.Vector4(0, 0, 0, 0) },
    screenFootprintColor: { value: new THREE.Color(1, 1, 1) },
    screenBackdrop: {
      look: { value: new THREE.Vector3(1, 1, 1) },
      tint: { value: new THREE.Vector4(0, 0, 0, 0) },
      opacity: { value: 0 },
    },
    screenBorder: {
      viewportToImage: { value: new THREE.Matrix3() },
      imageSize: { value: new THREE.Vector2(1, 1) },
      style: { value: new THREE.Vector4() },
    },
    projectiveOverlay: {
      data: { value: null },
      labelAtlas: { value: null },
      count: { value: 0 },
      time: { value: 0 },
      trailColor: { value: new THREE.Color() },
      trailDuration: { value: 8 },
      opacity: { value: 0 },
      pixelRatio: { value: 1 },
    },
    surfaceOverlay: {
      texture: { value: null },
      sceneToTexture: { value: new THREE.Matrix4() },
      opacity: { value: 0 },
      previousTexture: { value: null },
      previousSceneToTexture: { value: new THREE.Matrix4() },
      previousEnabled: { value: 0 },
      previousOpacity: { value: -1 },
      transition: { value: 1 },
    },
  };
  const photoGapRepair = createSharedThreePhotoGapRepair(
    photoDepth,
    mapStyleProjectionUniforms,
    () => map?.triggerRepaint()
  );
  // Eleven RGBA texels per marking: two receiver-frame matrices, color, style, label cell.
  // A small float texture avoids per-camera varyings and low mobile uniform limits.
  const projectiveCapacity = 34;
  const projectiveData = new Float32Array(projectiveCapacity * 11 * 4);
  const projectiveScratch = new Float32Array(projectiveData.length);
  const projectiveTexture = new THREE.DataTexture(
    projectiveData,
    11,
    projectiveCapacity,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  projectiveTexture.minFilter = THREE.NearestFilter;
  projectiveTexture.magFilter = THREE.NearestFilter;
  projectiveTexture.generateMipmaps = false;
  projectiveTexture.needsUpdate = true;
  const projectiveOverlays = new Map<string, MapStyleProjectiveOverlay>();
  let projectiveTrailUntil = -1;
  let projectiveFadeBucket = -1;
  const surfaceOverlays = new Map<
    string,
    {
      texture: THREE.Texture;
      sceneToTexture: THREE.Matrix4;
      opacity: number;
      previous?: {
        texture: THREE.Texture;
        sceneToTexture: THREE.Matrix4;
        opacity?: number;
      };
      transition?: number;
    }
  >();
  const screenBackdrops = new Map<string, readonly [number, number, number]>();
  const mapColorOwners = new Map<string, THREE.Color>();
  const defaultFootprintColor = new THREE.Color(1, 1, 1);
  const screenOverlays = new Map<
    string,
    MapStyleScreenOverlay & { version: number }
  >();
  let framesActive = false;
  let heldBackdrop: {
    look: THREE.Vector3;
    tint: THREE.Vector4;
    opacity: number;
  } | null = null;
  let handoffLookKey: string | undefined;
  const backgroundAvailable = { value: 0 };
  const screenUniforms: Record<string, THREE.IUniform> = {
    carmaScreenBackgroundTexture: mapStyleProjectionUniforms.texture,
    carmaScreenBackgroundAvailable: backgroundAvailable,
    carmaScreenFramePixelRatio:
      mapStyleProjectionUniforms.projectiveOverlay!.pixelRatio,
    carmaScreenBasemapLabels: mapStyleProjectionUniforms.screenBasemapLabels!,
    carmaScreenBackdropOverride:
      mapStyleProjectionUniforms.screenBackdropOverride!,
    carmaScreenBackdropLook: mapStyleProjectionUniforms.screenBackdrop!.look,
    carmaScreenBackdropTint: mapStyleProjectionUniforms.screenBackdrop!.tint,
    carmaScreenBackdropOpacity:
      mapStyleProjectionUniforms.screenBackdrop!.opacity,
    carmaScreenToBorderImage:
      mapStyleProjectionUniforms.screenBorder!.viewportToImage,
    carmaScreenBorderImageSize:
      mapStyleProjectionUniforms.screenBorder!.imageSize,
    carmaScreenBorderStyle: mapStyleProjectionUniforms.screenBorder!.style,
    carmaScreenFootprintColor: mapStyleProjectionUniforms.screenFootprintColor!,
  };
  mapStyleProjectionUniforms.screenOverlays!.forEach((screen, index) => {
    screenUniforms[`carmaScreenFrameProjection${index}`] =
      screen.frameProjection!;
    screenUniforms[`carmaScreenFrameStyle${index}`] = screen.frameStyle!;
    screenUniforms[`carmaScreenFrameEnabled${index}`] = screen.frameEnabled!;
    screenUniforms[`carmaScreenFrameCoverage${index}`] = screen.frameCoverage!;
    screenUniforms[`carmaScreenTexture${index}`] = screen.texture;
    screenUniforms[`carmaScreenToTexture${index}`] = screen.viewportToTexture;
    screenUniforms[`carmaScreenSceneToTexture${index}`] = screen.sceneToTexture;
    screenUniforms[`carmaScreenSourceDepthTexture${index}`] =
      screen.sourceDepthTexture!;
    screenUniforms[`carmaScreenSourceDepthSceneToClip${index}`] =
      screen.sourceDepthSceneToClip!;
    screenUniforms[`carmaScreenSourceDepthNearFar${index}`] =
      screen.sourceDepthNearFar!;
    screenUniforms[`carmaScreenSourceDepthEnabled${index}`] =
      screen.sourceDepthEnabled!;
    screenUniforms[`carmaScreenSourceDepthBias${index}`] =
      screen.sourceDepthBias!;
    screenUniforms[`carmaScreenProjective${index}`] = screen.projective;
    screenUniforms[`carmaScreenUnderlay${index}`] = screen.underlay!;
    screenUniforms[`carmaScreenFillGaps${index}`] = screen.fillGaps!;
    screenUniforms[`carmaScreenOpacity${index}`] = screen.opacity;
  });
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: screenUniforms,
    vertexShader: `varying vec2 vScreenUv; void main(){vScreenUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: `varying vec2 vScreenUv; ${MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER}
uniform sampler2D carmaScreenBackgroundTexture;
uniform float carmaScreenBackgroundAvailable;
void main(){float photographAlpha;float decorationAlpha;vec4 image=carmaScreenImages(vScreenUv,photographAlpha,decorationAlpha);if(carmaScreenBackgroundAvailable>0.0){
 vec3 base=carmaMapStyleSRGBToLinear(texture2D(carmaScreenBackgroundTexture,vScreenUv).rgb);
 base=mix(base,carmaScreenBackdrop(base),carmaScreenBackdropOpacity*(1.0-carmaFrameCoverage));
 image=vec4(image.rgb*image.a+base*(1.0-image.a),1.0);
}if(carmaScreenBackdropOverride.a>0.0)image=vec4(image.rgb*image.a+carmaScreenBackdropOverride.rgb*(1.0-image.a),1.0);if(image.a<=0.0)discard;gl_FragColor=image;
#include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    // Custom blending keeps this quad in the opaque list, before receiver meshes.
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const screenOverlayMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    screenMaterial
  );
  screenOverlayMesh.name = "map-style-screen-image";
  screenOverlayMesh.renderOrder = -100000;
  screenOverlayMesh.frustumCulled = false;
  screenOverlayMesh.visible = false;
  let mapStyleFramebufferTexture: THREE.FramebufferTexture | null = null;
  const capturedMapStyleMatrix = new THREE.Matrix4();
  let mapStyleFramebufferCache: ReturnType<
    typeof createMapStyleFramebufferCache
  > | null = null;
  // A Three texture handle that borrows MapLibre's terrain depth WebGLTexture
  // for the frame instead of copying it.
  let mapStyleDepthTexture: THREE.Texture | null = null;
  let mapStyleDepthGlTexture: WebGLTexture | null = null;
  const mapStyleProjectionVersions = new Map<string, number>();
  const mapStyleProjectionReceivers = new Map<string, boolean>();
  const mapStylePhotoReceiverStates = new Map<string, boolean>();
  let projectivePhotosActive = false;
  let screenPhotosActive = false;

  const bindAxisReceiver = (material: THREE.Material) => {
    if (!axisSourceCount || axisReceivers.has(material)) return;
    axisReceivers.add(material);
    setMapStyleAxisBoundaryUniforms(material, axisBoundaries.uniforms);
    material.addEventListener("dispose", () => axisReceivers.delete(material));
  };

  // These bounds select stable metric cells, never sampled owners. A missing
  // or deforming bound asks the cache for all cameras conservatively.
  const updateAxisReceiverBounds = (
    _sceneToClip: THREE.Matrix4,
    localFrame?: SharedThreeSceneLocalFrame
  ) => {
    if (!axisSourceCount) return;
    axisSceneToMetric.copy(axisReferenceToMetric);
    if (localFrame) axisSceneToMetric.multiply(localFrame.currentToReference);
    axisBoundaries.setSceneToMetric(axisSceneToMetric);
    axisBoundaries.setStyle({
      pixelRatio:
        viewport.x / Math.max(1, map?.getCanvas().clientWidth ?? viewport.x),
    });
    const depth = photoDepth.sync();
    axisPreparedDepth = depth;
    const revision = `${depth.revision}:${
      axisReceivers.size
    }:${axisSceneToMetric.elements.join(",")}`;
    if (revision === axisBoundsRevision) return;
    axisBoundsRevision = revision;
    const union = new THREE.Box3();
    let unknown = false;
    const transform = new THREE.Matrix4();
    const box = new THREE.Box3();
    for (const runtime of runtimes.values()) {
      if (!runtime.root.visible || runtime.hasRenderableContent?.() === false)
        continue;
      runtime.root.traverseVisible((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        if (!materials.some((material) => axisReceivers.has(material))) return;
        const sphere =
          object instanceof THREE.InstancedMesh
            ? object.boundingSphere
            : object.geometry.boundingSphere;
        const geometryBox =
          object instanceof THREE.InstancedMesh
            ? null
            : object.geometry.boundingBox;
        if (object instanceof THREE.SkinnedMesh || !(geometryBox || sphere)) {
          unknown = true;
          return;
        }
        if (geometryBox) box.copy(geometryBox);
        else
          box.setFromCenterAndSize(
            sphere!.center,
            new THREE.Vector3().setScalar(sphere!.radius * 2)
          );
        transform.multiplyMatrices(axisSceneToMetric, object.matrixWorld);
        box.applyMatrix4(transform).expandByScalar(0.001);
        union.union(box);
      });
    }
    axisVisibleBounds = unknown ? null : union;
  };

  const configureMapStyleProjection = (): boolean => {
    let receiversChanged = false;
    for (const runtime of runtimes.values()) {
      const receiver = runtime.receivesMapStyleTexture;
      const photoReceiver =
        (screenPhotosActive && runtime.receivesScreenImages === true) ||
        ((projectivePhotosActive ||
          photoMosaic.active ||
          axisSourceCount > 0 ||
          screenBackdrops.size > 0) &&
          runtime.mountsOnLocalFrame === true &&
          (runtime.providesTerrain === true ||
            runtime.receivesScreenImages === true));
      const previousPhotoReceiver = mapStylePhotoReceiverStates.get(runtime.id);
      if (!receiver && !photoReceiver && !previousPhotoReceiver) continue;
      const version = runtime.mapStyleProjectionVersion?.() ?? 0;
      if (
        mapStyleProjectionVersions.get(runtime.id) === version &&
        previousPhotoReceiver === photoReceiver
      )
        continue;
      let configuredMapReceiver = false;
      runtime.root.traverse((object) => {
        if (
          !(object instanceof THREE.Mesh) &&
          !(object instanceof THREE.Line) &&
          !(object instanceof THREE.Points)
        )
          return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          const mapReceiver =
            object instanceof THREE.Mesh &&
            (typeof receiver === "function"
              ? receiver(material)
              : receiver === true);
          if (!mapReceiver && !photoReceiver && !previousPhotoReceiver)
            continue;
          configureMapStyleProjectedMaterial(
            material,
            mapStyleProjectionUniforms,
            mapReceiver
              ? runtime.mapStyleProjectionBlend ?? "replace"
              : "photo-only",
            runtime.mountsOnLocalFrame === true
          );
          if (object instanceof THREE.Mesh && (mapReceiver || photoReceiver))
            bindAxisReceiver(material);
          configuredMapReceiver ||= mapReceiver;
        }
      });
      mapStyleProjectionVersions.set(runtime.id, version);
      mapStylePhotoReceiverStates.set(runtime.id, photoReceiver);
      // Photo-only receivers do not request a captured basemap/DEM depth pass.
      mapStyleProjectionReceivers.set(runtime.id, configuredMapReceiver);
      receiversChanged = true;
    }
    // A new LOD needs the current markings even while lighting reuses a settled
    // frame. Share the receiver revision with that cache in this render cycle.
    if (receiversChanged) mapStyleProjectionEpoch++;
    return [...mapStyleProjectionReceivers.values()].some(Boolean);
  };

  const captureMapStyleFramebuffer = () => {
    if (!renderer || viewport.x < 1 || viewport.y < 1) return;
    const width = Math.floor(viewport.x);
    const height = Math.floor(viewport.y);
    const needsResize =
      !mapStyleFramebufferTexture ||
      mapStyleFramebufferTexture.image.width !== width ||
      mapStyleFramebufferTexture.image.height !== height;
    const texture = needsResize
      ? new THREE.FramebufferTexture(width, height)
      : mapStyleFramebufferTexture!;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    try {
      renderer.copyFramebufferToTexture(texture);
    } catch (error) {
      if (needsResize) texture.dispose();
      throw error;
    }
    // Publish a resized capture only after copying succeeds. A transient failure
    // must not dispose the last usable map and expose the plain terrain albedo.
    if (needsResize) mapStyleFramebufferTexture?.dispose();
    mapStyleFramebufferTexture = texture;
    mapStyleProjectionUniforms.texture.value = texture;
    mapStyleProjectionUniforms.texelSize.value.set(1 / width, 1 / height);
    capturedMapStyleMatrix.copy(mapStyleProjectionUniforms.sceneToClip.value);
    mapStyleProjectionUniforms.enabled.value = 1;
  };

  /**
   * Borrow MapLibre's terrain depth pass of this frame. It is re-rendered
   * whenever the camera moves or terrain tiles arrive, so it describes the
   * same DEM ground that the captured labels were drawn on.
   */
  const bindMapStyleDepth = () => {
    const host = map as unknown as MapLibreTerrainDepthHost | null;
    const glTexture = host?.terrain?._fboDepthTexture?.texture ?? null;
    const near = host?.transform?.nearZ;
    const far = host?.transform?.farZ;
    if (
      !renderer ||
      !glTexture ||
      typeof near !== "number" ||
      typeof far !== "number" ||
      !(far > near && near > 0)
    ) {
      mapStyleProjectionUniforms.depthEnabled.value = 0;
      return;
    }
    if (!mapStyleDepthTexture) {
      mapStyleDepthTexture = new THREE.Texture();
      mapStyleDepthTexture.minFilter = THREE.NearestFilter;
      mapStyleDepthTexture.magFilter = THREE.NearestFilter;
      mapStyleDepthTexture.generateMipmaps = false;
      mapStyleDepthTexture.flipY = false;
      mapStyleProjectionUniforms.depthTexture.value = mapStyleDepthTexture;
    }
    if (mapStyleDepthGlTexture !== glTexture) {
      mapStyleFramebufferCache?.invalidate();
      mapStyleDepthGlTexture = glTexture;
      const properties = renderer.properties.get(mapStyleDepthTexture) as {
        __webglTexture?: WebGLTexture;
        __webglInit?: boolean;
        __version?: number;
      };
      properties.__webglTexture = glTexture;
      properties.__webglInit = true;
      properties.__version = mapStyleDepthTexture.version;
    }
    mapStyleProjectionUniforms.depthNearFar.value.set(near, far);
    mapStyleProjectionUniforms.depthEnabled.value = 1;
  };

  const releaseMapStyleDepth = () => {
    if (mapStyleDepthTexture && renderer) {
      // The WebGLTexture belongs to MapLibre; drop the handle without
      // letting Three delete it.
      const properties = renderer.properties.get(mapStyleDepthTexture) as {
        __webglTexture?: WebGLTexture;
      };
      delete properties.__webglTexture;
      renderer.properties.remove(mapStyleDepthTexture);
    }
    mapStyleDepthTexture = null;
    mapStyleDepthGlTexture = null;
    mapStyleProjectionUniforms.depthTexture.value = null;
    mapStyleProjectionUniforms.depthEnabled.value = 0;
  };

  const detach = () => {
    axisBoundaries.detach();
    axisBoundsRevision = "";
    axisPreparedDepth = undefined;
    photoGapRepair.detach();
    mapStyleProjectionUniforms.photoGapRepair!.texture.value = null;
    mapStyleProjectionUniforms.photoGapRepair!.enabled.value = 0;
    photoMosaic.detach();
    photoDepth.detach();
    mapStyleProjectionUniforms.screenOverlays!.forEach((screen, index) => {
      screen.sourceDepthTexture!.value = null;
      screen.sourceDepthEnabled!.value = screenSourceProjections[index]
        ? -1
        : 0;
    });
    mapStyleProjectionUniforms.photoMosaic!.texture.value = null;
    mapStyleProjectionUniforms.photoMosaic!.opacity.value = 0;
    mapStyleFramebufferCache?.dispose();
    mapStyleFramebufferCache = null;
    releaseMapStyleDepth();
    mapStyleFramebufferTexture?.dispose();
    mapStyleFramebufferTexture = null;
    backgroundAvailable.value = 0;
    mapStyleProjectionUniforms.texture.value = null;
    mapStyleProjectionUniforms.enabled.value = 0;
    map = null;
    renderer = null;
  };

  return {
    get epoch() {
      return mapStyleProjectionEpoch;
    },
    get visible() {
      return presentationEnabled && mapStyleProjectionVisible;
    },
    getState(renderedFrames: number) {
      const gapState = photoGapRepair.state;
      return {
        visible: mapStyleProjectionVisible,
        enabled: mapStyleProjectionUniforms.enabled.value === 1,
        depthEnabled: mapStyleProjectionUniforms.depthEnabled.value === 1,
        depthNearFar: [
          mapStyleProjectionUniforms.depthNearFar.value.x,
          mapStyleProjectionUniforms.depthNearFar.value.y,
        ] as const,
        receivers: Object.fromEntries(mapStyleProjectionReceivers),
        frames: renderedFrames,
        captures: mapStyleFramebufferCache?.stats.captures ?? 0,
        captureReuses: mapStyleFramebufferCache?.stats.reuses ?? 0,
        photoMosaic: { ...photoMosaic.state, error: photoMosaicError },
        photoGapRepair: { ...gapState, error: photoGapError ?? gapState.error },
        photoSourceDepth: photoDepth.state,
        axisBoundaries: {
          ...axisBoundaries.state,
          error: axisBoundaryError ?? axisBoundaries.state.error,
          sources: axisSourceCount,
          receivers: axisReceivers.size,
          visibleBounds: axisVisibleBounds
            ? {
                min: axisVisibleBounds.min.toArray(),
                max: axisVisibleBounds.max.toArray(),
              }
            : null,
        },
      };
    },

    detach,
    screenOverlayMesh,
    setAxisBoundaries(
      id: string,
      overlay: MapStyleAxisBoundaryOverlay | null,
      requestRepaint = true
    ) {
      if (overlay?.sources.length) axisOverlays.set(id, overlay);
      else axisOverlays.delete(id);
      const first =
        [...axisOverlays.values()].find((value) => value.candidateCache) ??
        (axisOverlays.values().next().value as
          | MapStyleAxisBoundaryOverlay
          | undefined);
      const sources: AxisBoundarySite[] = [];
      let eligibleIds: ReadonlySet<string> | undefined;
      if (first?.candidateCache) {
        axisReferenceToMetric.copy(first.referenceToMetric);
        sources.push(...first.candidateCache.readField().sites);
        const siblings = [...axisOverlays.values()].filter(
          (value) =>
            value.candidateCache === first.candidateCache &&
            value.referenceToMetric.equals(first.referenceToMetric)
        );
        if (siblings.every((value) => value.eligibleIds !== undefined))
          eligibleIds = new Set(
            siblings.flatMap((value) => [...value.eligibleIds!])
          );
      } else if (first) {
        axisReferenceToMetric.copy(first.referenceToMetric);
        for (const value of axisOverlays.values()) {
          if (value.referenceToMetric.equals(axisReferenceToMetric)) {
            // The source controller takes one immutable snapshot. Avoid a second
            // complete catalog clone for the normal shared reference frame.
            for (const source of value.sources) sources.push(source);
            continue;
          }
          const metricToFirst = axisReferenceToMetric
            .clone()
            .multiply(value.referenceToMetric.clone().invert());
          const firstToMetric = metricToFirst.clone().invert();
          for (const source of value.sources)
            sources.push({
              id: source.id,
              sceneToImage: source.sceneToImage.clone().multiply(firstToMetric),
              eye: source.eye.clone().applyMatrix4(metricToFirst),
              direction: source.direction
                .clone()
                .transformDirection(metricToFirst),
            });
        }
      }
      // Hiding the debug display releases its GPU targets, but retains the
      // terrain-independent admissions for a warm return to the same field.
      axisBoundaryError = undefined;
      axisPreparedDepth = undefined;
      if (sources.length)
        axisBoundaries.setSites(sources, {
          candidateCache: first?.candidateCache,
          eligibleIds,
        });
      axisSourceCount = sources.length;
      axisBoundsRevision = "";
      axisBoundaries.setStyle({
        enabled: axisSourceCount > 0,
        color: first?.color ?? 0xffc928,
        opacity: first?.opacity ?? 0.9,
        widthCss: first?.width ?? 1.5,
      });
      mapStyleProjectionVersions.clear();
      mapStyleProjectionEpoch++;
      if (requestRepaint) map?.triggerRepaint();
    },
    setPhotoMosaic(
      id: string,
      entries: readonly MapStylePhotoMosaicEntry[] | null,
      requestRepaint = true
    ) {
      if (!photoMosaic.set(id, entries)) return;
      if (!photoMosaic.active) {
        mapStyleProjectionUniforms.photoMosaic!.texture.value = null;
        mapStyleProjectionUniforms.photoMosaic!.opacity.value = 0;
      }
      mapStyleProjectionEpoch++;
      if (requestRepaint) map?.triggerRepaint();
    },
    renderAxisBoundaries(
      camera: THREE.Camera,
      hostRenderState?: SharedThreeHostRenderState
    ) {
      if (!renderer) return;
      const preparedDepth = axisPreparedDepth;
      axisPreparedDepth = undefined;
      try {
        const first =
          [...axisOverlays.values()].find((value) => value.candidateCache) ??
          (axisOverlays.values().next().value as
            | MapStyleAxisBoundaryOverlay
            | undefined);
        const point = first?.readFocus?.();
        const focus = point
          ? { center: point, radiusMeters: first?.maxDisplayRadius }
          : undefined;
        const previousEnabled =
          axisBoundaries.uniforms.carmaAxisBoundaryDisplayEnabled.value;
        const previousTexture =
          axisBoundaries.uniforms.carmaAxisBoundaryDisplayTexture.value;
        const result = axisBoundaries.render(
          renderer,
          camera,
          viewport,
          hostRenderState,
          axisVisibleBounds,
          preparedDepth,
          focus
        );
        if (
          result.changed ||
          previousEnabled !==
            axisBoundaries.uniforms.carmaAxisBoundaryDisplayEnabled.value ||
          previousTexture !==
            axisBoundaries.uniforms.carmaAxisBoundaryDisplayTexture.value
        )
          mapStyleProjectionEpoch++;
      } catch (error) {
        // A failed optional debug pass must not interrupt the host map render.
        axisBoundaryError =
          error instanceof Error ? error.message : String(error);
        axisBoundaries.setStyle({ enabled: false });
        axisBoundaries.detach();
        mapStyleProjectionEpoch++;
        console.warn("[shared-three-scene] axis display disabled", error);
      }
    },
    renderPhotoMosaic(
      camera: THREE.Camera,
      hostRenderState?: SharedThreeHostRenderState
    ) {
      if (!renderer) return;
      photoDepth.setSources([
        ...screenSourceProjections.flatMap((projection, index) =>
          projection
            ? [
                photoDepthSource(
                  projection,
                  mapStyleProjectionUniforms.screenOverlays![index].texture
                    .value
                ),
              ]
            : []
        ),
        ...photoMosaic.sourceDepthRequests,
        ...[...screenOverlays.values()].flatMap((entry) =>
          (entry.projective?.gapRepair?.auxiliary ?? []).flatMap((extra) =>
            extra.sourceProjection
              ? [photoDepthSource(extra.sourceProjection, extra.texture)]
              : []
          )
        ),
      ]);
      const preparedDepth =
        screenSourceProjections.some(Boolean) || photoMosaic.active
          ? axisPreparedDepth ?? photoDepth.sync()
          : undefined;
      // A coarse base and its detailed crop share the actual capture camera.
      const sourceResults = new Map<
        string,
        ReturnType<typeof photoDepth.renderSource>
      >();
      mapStyleProjectionUniforms.screenOverlays!.forEach((screen, index) => {
        const projection = screenSourceProjections[index];
        const previousEnabled = screen.sourceDepthEnabled!.value;
        screen.sourceDepthTexture!.value = null;
        screen.sourceDepthEnabled!.value = projection ? -1 : 0;
        if (projection) {
          const key = projection.elements.join(",");
          if (!sourceResults.has(key)) {
            try {
              sourceResults.set(
                key,
                photoDepth.renderSource(renderer!, projection, hostRenderState)
              );
            } catch {
              // Never project through geometry when the requested first-hit pass fails.
              sourceResults.set(key, null);
            }
          }
          const result = sourceResults.get(key);
          if (result) {
            screen.sourceDepthTexture!.value = result.texture;
            screen.sourceDepthSceneToClip!.value.copy(result.sceneToClip);
            screen.sourceDepthNearFar!.value.copy(result.nearFar);
            screen.sourceDepthBias!.value = result.biasMeters;
            screen.sourceDepthEnabled!.value = 1;
            if (result.changed) mapStyleProjectionEpoch++;
          }
        }
        if (previousEnabled !== screen.sourceDepthEnabled!.value)
          mapStyleProjectionEpoch++;
      });
      const uniform = mapStyleProjectionUniforms.photoMosaic!;
      try {
        const result = photoMosaic.render(
          renderer,
          camera,
          viewport,
          preparedDepth,
          hostRenderState
        );
        uniform.texture.value = result.texture;
        uniform.opacity.value = result.texture ? 1 : 0;
        uniform.navigationGroup!.value =
          result.texture && photoMosaic.navigationGroup ? 1 : 0;
        photoMosaicError = undefined;
        if (result.changed) mapStyleProjectionEpoch++;
      } catch (error) {
        // A failed optional compositor must not interrupt the normal map/preview.
        if (uniform.opacity.value) mapStyleProjectionEpoch++;
        uniform.texture.value = null;
        uniform.opacity.value = 0;
        uniform.navigationGroup!.value = 0;
        photoMosaicError =
          error instanceof Error ? error.message : String(error);
      }
      const gapUniforms = mapStyleProjectionUniforms.photoGapRepair!;
      const gapConfig = [...screenOverlays.values()].find(
        (entry) => entry.projective?.gapRepair
      )?.projective?.gapRepair;
      try {
        const result = photoGapRepair.render(
          renderer,
          camera,
          viewport,
          hostRenderState,
          undefined,
          preparedDepth?.revision,
          gapConfig
        );
        gapUniforms.texture.value = result.texture;
        gapUniforms.geometry.value = result.geometry;
        gapUniforms.enabled.value = result.texture ? 1 : 0;
        gapUniforms.sceneToMetric.value.copy(result.sceneToMetric);
        gapUniforms.metricToClip.forEach((entry, index) =>
          entry.value.copy(result.metricToClip[index])
        );
        gapUniforms.metricToFootprint.forEach((entry, index) =>
          entry.value.copy(result.metricToFootprint[index])
        );
        gapUniforms.footprints.value = result.footprints;
        gapUniforms.fieldSize.value.copy(result.fieldSize);
        gapUniforms.pages.value = result.pages;
        photoGapError = undefined;
        if (result.changed) mapStyleProjectionEpoch++;
      } catch (error) {
        gapUniforms.texture.value = gapUniforms.geometry.value = null;
        gapUniforms.enabled.value = 0;
        photoGapError = error instanceof Error ? error.message : String(error);
      }
    },
    setFootprintColor(
      id: string,
      color: THREE.ColorRepresentation | null,
      requestRepaint = true
    ) {
      const next = color === null ? null : new THREE.Color(color);
      if (next && !next.toArray().every(Number.isFinite)) return;
      const previous = mapColorOwners.get(id);
      if (next ? previous?.equals(next) : !previous) return;
      if (next) mapColorOwners.set(id, next);
      else mapColorOwners.delete(id);
      const active = [...mapColorOwners.values()].at(-1) ?? null;
      const uniform = mapStyleProjectionUniforms.screenFootprintColor!.value;
      const effective = active ?? defaultFootprintColor;
      const frameChanged = !uniform.equals(effective);
      const mosaicChanged = photoMosaic.setOutlineColorOverride(active);
      if (!frameChanged && !(mosaicChanged && photoMosaic.active)) return;
      uniform.copy(effective);
      mapStyleProjectionEpoch++;
      if (requestRepaint) map?.triggerRepaint();
    },
    setScreenBackdrop(
      id: string,
      color: readonly [number, number, number] | null,
      requestRepaint = true
    ) {
      if (color) screenBackdrops.set(id, [...color]);
      else screenBackdrops.delete(id);
      const active = [...screenBackdrops.values()].at(-1);
      const linear = active
        ? new THREE.Color().setRGB(...active, THREE.SRGBColorSpace)
        : new THREE.Color(0, 0, 0);
      mapStyleProjectionUniforms.screenBackdropOverride!.value.set(
        linear.r,
        linear.g,
        linear.b,
        active ? 1 : 0
      );
      screenOverlayMesh.visible =
        screenPhotosActive || framesActive || !!active;
      mapStyleProjectionEpoch++;
      if (requestRepaint) map?.triggerRepaint();
    },
    setScreenOverlay(
      id: string,
      overlay: MapStyleScreenOverlay | null,
      requestRepaint = true
    ) {
      const previous = screenOverlays.get(id);
      if (
        overlay &&
        previous &&
        previous.texture === overlay.texture &&
        previous.version === overlay.texture.version &&
        (previous.textureRevision ?? 0) === (overlay.textureRevision ?? 0) &&
        previous.opacity === overlay.opacity &&
        previous.backdropOpacity === overlay.backdropOpacity &&
        Boolean(previous.projective?.frame) ===
          Boolean(overlay.projective?.frame) &&
        previous.projective?.frame?.opacity ===
          overlay.projective?.frame?.opacity &&
        previous.projective?.frame?.coverageOpacity ===
          overlay.projective?.frame?.coverageOpacity &&
        previous.projective?.frame?.width ===
          overlay.projective?.frame?.width &&
        previous.projective?.frame?.feather ===
          overlay.projective?.frame?.feather &&
        previous.projective?.frame?.featherOpacity ===
          overlay.projective?.frame?.featherOpacity &&
        previous.priority === overlay.priority &&
        previous.showBasemapLabels === overlay.showBasemapLabels &&
        Boolean(previous.projective) === Boolean(overlay.projective) &&
        !!previous.projective?.underlay === !!overlay.projective?.underlay &&
        !!previous.projective?.fillGaps === !!overlay.projective?.fillGaps &&
        !!previous.projective?.sourceProjection ===
          !!overlay.projective?.sourceProjection &&
        (!previous.projective?.sourceProjection ||
          !overlay.projective?.sourceProjection ||
          previous.projective.sourceProjection.equals(
            overlay.projective.sourceProjection
          )) &&
        (!previous.projective ||
          !overlay.projective ||
          previous.projective.sceneToTexture.equals(
            overlay.projective.sceneToTexture
          )) &&
        previous.backdropLook?.contrast === overlay.backdropLook?.contrast &&
        previous.backdropLook?.brightness ===
          overlay.backdropLook?.brightness &&
        previous.backdropLook?.saturation ===
          overlay.backdropLook?.saturation &&
        [0, 1, 2, 3].every(
          (index) =>
            previous.backdropTint?.[index] === overlay.backdropTint?.[index]
        ) &&
        previous.border?.width === overlay.border?.width &&
        previous.border?.opacity === overlay.border?.opacity &&
        previous.border?.feather === overlay.border?.feather &&
        previous.border?.featherOpacity === overlay.border?.featherOpacity &&
        previous.border?.imageSize.width === overlay.border?.imageSize.width &&
        previous.border?.imageSize.height ===
          overlay.border?.imageSize.height &&
        (!previous.border ||
          !overlay.border ||
          previous.border.viewportToImage.equals(
            overlay.border.viewportToImage
          )) &&
        previous.viewportToTexture.equals(overlay.viewportToTexture) &&
        previous.projective?.gapRepair?.id ===
          overlay.projective?.gapRepair?.id &&
        previous.projective?.gapRepair?.auxiliaryExpected ===
          overlay.projective?.gapRepair?.auxiliaryExpected &&
        (previous.projective?.gapRepair?.auxiliary?.length ?? 0) ===
          (overlay.projective?.gapRepair?.auxiliary?.length ?? 0) &&
        (previous.projective?.gapRepair?.auxiliary ?? []).every(
          (extra, index) => {
            const next = overlay.projective?.gapRepair?.auxiliary?.[index];
            return (
              !!next &&
              extra.texture === next.texture &&
              extra.textureRevision === next.textureRevision &&
              extra.sceneToTexture.equals(next.sceneToTexture) &&
              (extra.sourceProjection
                ? !!next.sourceProjection &&
                  extra.sourceProjection.equals(next.sourceProjection)
                : !next.sourceProjection) &&
              [0, 1, 2, 3].every(
                (axis) =>
                  extra.textureBounds?.[axis] === next.textureBounds?.[axis]
              )
            );
          }
        ) &&
        (!previous.projective?.gapRepair ||
          !overlay.projective?.gapRepair ||
          previous.projective.gapRepair.sceneToMetric.equals(
            overlay.projective.gapRepair.sceneToMetric
          ))
      )
        return;
      if (!overlay && !previous) return;
      // Capture the visible settled preview before the two projective slots
      // replace it. Keep the same look through target-flat handoff until that
      // preview explicitly changes its look (normally its idle settle).
      if (overlay?.projective?.frame && !framesActive && !heldBackdrop) {
        const flat = [...screenOverlays.values()].find(
          (entry) =>
            !entry.projective &&
            entry.opacity > 0 &&
            (entry.backdropLook || entry.backdropTint)
        );
        if (flat)
          heldBackdrop = {
            look: mapStyleProjectionUniforms.screenBackdrop!.look.value.clone(),
            tint: mapStyleProjectionUniforms.screenBackdrop!.tint.value.clone(),
            opacity: flat.backdropOpacity ?? flat.opacity,
          };
      }
      if (overlay)
        screenOverlays.set(id, {
          ...overlay,
          backdropLook: overlay.backdropLook
            ? { ...overlay.backdropLook }
            : undefined,
          backdropTint: overlay.backdropTint
            ? [...overlay.backdropTint]
            : undefined,
          border: overlay.border
            ? {
                ...overlay.border,
                imageSize: { ...overlay.border.imageSize },
                viewportToImage: overlay.border.viewportToImage.clone(),
              }
            : undefined,
          projective: overlay.projective
            ? {
                sceneToTexture: overlay.projective.sceneToTexture.clone(),
                sourceProjection: overlay.projective.sourceProjection?.clone(),
                underlay: overlay.projective.underlay,
                fillGaps: overlay.projective.fillGaps,
                gapRepair: overlay.projective.gapRepair
                  ? {
                      ...overlay.projective.gapRepair,
                      sceneToMetric:
                        overlay.projective.gapRepair.sceneToMetric.clone(),
                      views: overlay.projective.gapRepair.views.map((view) =>
                        view.clone()
                      ),
                      auxiliary: overlay.projective.gapRepair.auxiliary?.map(
                        (extra) => ({
                          ...extra,
                          sceneToTexture: extra.sceneToTexture.clone(),
                          sourceProjection: extra.sourceProjection?.clone(),
                          textureBounds: extra.textureBounds
                            ? [...extra.textureBounds]
                            : undefined,
                          capturePosition: extra.capturePosition?.clone(),
                          sceneToMetric: extra.sceneToMetric?.clone(),
                        })
                      ),
                    }
                  : undefined,
                frame: overlay.projective.frame
                  ? { ...overlay.projective.frame }
                  : undefined,
              }
            : undefined,
          viewportToTexture: overlay.viewportToTexture.clone(),
          version: overlay.texture.version,
        });
      else screenOverlays.delete(id);
      const ordered = [...screenOverlays.values()]
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .slice(-2);
      framesActive = ordered.some(
        (entry) =>
          !!entry.projective?.frame && !!entry.projective?.sourceProjection
      );
      // A zero-weight target still fills gaps outside the source. Keep both
      // first-hit depths available to distinguish overlap from target-only pixels.
      const fillGaps =
        ordered.length === 2 &&
        ordered.every((entry) => entry.projective?.fillGaps);
      screenSourceProjections = ordered.map((entry) =>
        entry.opacity > 0 || fillGaps
          ? entry.projective?.sourceProjection
          : undefined
      );
      projectivePhotosActive = ordered.some(
        (entry) =>
          entry.projective && (entry.opacity > 0 || !!entry.projective.frame)
      );
      mapStyleProjectionUniforms.screenOverlays!.forEach((screen, index) => {
        const entry = ordered[index];
        const frame = entry?.projective?.frame;
        screen.frameEnabled!.value =
          frame && entry?.projective?.sourceProjection ? 1 : 0;
        screen.frameCoverage!.value = Math.max(
          0,
          Math.min(1, frame?.coverageOpacity ?? 1)
        );
        screen.frameProjection!.value.copy(
          entry?.projective?.sourceProjection ?? new THREE.Matrix4()
        );
        screen.frameStyle!.value.set(
          Math.max(0, frame?.width ?? 0),
          frame?.opacity ?? 0,
          Math.max(0, frame?.feather ?? 0),
          (frame?.featherOpacity ?? 0) * (frame?.opacity ?? 0)
        );
        screen.texture.value = entry?.texture ?? null;
        screen.opacity.value = entry?.opacity ?? 0;
        screen.sourceDepthTexture!.value = null;
        // Photo pixels need first-hit depth; geometric frame-only coverage does not.
        screen.sourceDepthEnabled!.value = screenSourceProjections[index]
          ? -1
          : 0;
        screen.projective.value = entry?.projective ? 1 : 0;
        screen.underlay!.value = entry?.projective?.underlay ? 1 : 0;
        screen.fillGaps!.value = entry?.projective?.fillGaps ? 1 : 0;
        if (entry?.projective)
          screen.sceneToTexture.value.copy(entry.projective.sceneToTexture);
        if (entry) screen.viewportToTexture.value.copy(entry.viewportToTexture);
      });
      const labelPolicy = [...ordered]
        .reverse()
        .find(
          (entry) =>
            entry.opacity > 0 ||
            (!!entry.projective?.frame && !!entry.projective.sourceProjection)
        );
      mapStyleProjectionUniforms.screenBasemapLabels!.value =
        labelPolicy?.showBasemapLabels === false ? 0 : 1;
      // The projected frame owns the matte until the flat preview takes over.
      // Its transparent, prepared flat slot must not fade that matte out.
      const backdrop =
        ordered.find(
          (entry) =>
            entry.projective?.frame &&
            entry.projective.sourceProjection &&
            (entry.backdropLook || entry.backdropTint)
        ) ??
        [...ordered]
          .reverse()
          .find(
            (entry) =>
              !entry.projective &&
              entry.opacity > 0 &&
              (entry.backdropLook || entry.backdropTint)
          ) ??
        ordered.find(
          (entry) =>
            !entry.projective && (entry.backdropLook || entry.backdropTint)
        );
      const backdropUniforms = mapStyleProjectionUniforms.screenBackdrop!;
      const backdropKey = JSON.stringify([
        backdrop?.backdropLook,
        backdrop?.backdropTint,
      ]);
      if (framesActive) handoffLookKey = undefined;
      else if (heldBackdrop && backdrop) {
        if (handoffLookKey === undefined) handoffLookKey = backdropKey;
        else if (handoffLookKey !== backdropKey) heldBackdrop = null;
      } else if (!backdrop) {
        heldBackdrop = null;
        handoffLookKey = undefined;
      }
      backdropUniforms.look.value.set(
        backdrop?.backdropLook?.contrast ?? 1,
        backdrop?.backdropLook?.brightness ?? 1,
        backdrop?.backdropLook?.saturation ?? 1
      );
      backdropUniforms.tint.value.fromArray(
        backdrop?.backdropTint ?? [0, 0, 0, 0]
      );
      backdropUniforms.opacity.value =
        backdrop?.backdropOpacity ??
        (backdrop?.projective?.frame ? 1 : backdrop?.opacity ?? 0);
      if (heldBackdrop) {
        backdropUniforms.look.value.copy(heldBackdrop.look);
        backdropUniforms.tint.value.copy(heldBackdrop.tint);
        // Keep the captured look through handoff, but honor an independent
        // matte fade. Flat-preview opacity remains separate to avoid a double fade.
        backdropUniforms.opacity.value =
          heldBackdrop.opacity * (backdrop?.backdropOpacity ?? 1);
      }
      const borderEntry = ordered.find(
        (entry) => !entry.projective && entry.border && entry.opacity > 0
      );
      const border = borderEntry?.border;
      const borderUniforms = mapStyleProjectionUniforms.screenBorder!;
      if (border) {
        borderUniforms.viewportToImage.value.copy(border.viewportToImage);
        borderUniforms.imageSize.value.set(
          border.imageSize.width,
          border.imageSize.height
        );
      }
      borderUniforms.style.value.set(
        Math.max(0, border?.width ?? 0),
        (border?.opacity ?? 0) * (borderEntry?.opacity ?? 0),
        Math.max(0, border?.feather ?? 0),
        (border?.featherOpacity ?? 0) * (borderEntry?.opacity ?? 0)
      );
      screenPhotosActive = ordered.some(
        (entry) => !entry.projective && entry.opacity > 0
      );
      screenOverlayMesh.visible =
        screenPhotosActive || framesActive || screenBackdrops.size > 0;
      mapStyleProjectionEpoch++;
      if (requestRepaint) map?.triggerRepaint();
    },
    setProjectiveOverlay(
      id: string,
      overlay: MapStyleProjectiveOverlay | null,
      requestRepaint = true
    ) {
      if (overlay) projectiveOverlays.set(id, overlay);
      else projectiveOverlays.delete(id);
      const active = [...projectiveOverlays.values()].at(-1);
      const uniform = mapStyleProjectionUniforms.projectiveOverlay!;
      const marks = active?.marks.slice(0, projectiveCapacity) ?? [];
      projectiveScratch.fill(0);
      for (let index = 0; index < marks.length; index++) {
        const mark = marks[index];
        const offset = index * 44;
        projectiveScratch.set(mark.sceneToImage.elements, offset);
        projectiveScratch.set(
          (mark.sceneToImageTerrain ?? mark.sceneToImage).elements,
          offset + 16
        );
        projectiveScratch.set(
          [
            mark.color.r,
            mark.color.g,
            mark.color.b,
            Math.max(0, Math.min(1, mark.opacity)),
            Math.max(0, mark.width),
            Math.max(0, Math.min(0.08, mark.fillOpacity ?? 0)),
            mark.trailStartedAt ?? -1,
            mark.shape === "sphere" ? 2 : mark.showUpMarker === false ? 1 : 0,
            ...(mark.labelRect ?? [0, 0, 0, 0]),
          ],
          offset + 32
        );
      }
      let changed =
        uniform.count.value !== marks.length ||
        uniform.labelAtlas.value !== (active?.labelAtlas ?? null) ||
        uniform.opacity.value !== (active?.opacity ?? 0) ||
        uniform.trailDuration.value !== (active?.trailDuration ?? 8) ||
        (active && !uniform.trailColor.value.equals(active.trailColor));
      let dataChanged = false;
      for (let index = 0; index < projectiveData.length; index++) {
        if (projectiveData[index] !== projectiveScratch[index]) {
          dataChanged = true;
          break;
        }
      }
      if (!changed && !dataChanged) return;
      if (dataChanged) {
        projectiveData.set(projectiveScratch);
        projectiveTexture.needsUpdate = true;
      }
      uniform.data.value = marks.length ? projectiveTexture : null;
      uniform.labelAtlas.value = active?.labelAtlas ?? null;
      uniform.count.value = marks.length;
      uniform.opacity.value = active?.opacity ?? 0;
      uniform.trailDuration.value = Math.max(0.001, active?.trailDuration ?? 8);
      projectiveTrailUntil = marks.reduce(
        (deadline, mark) =>
          mark.trailStartedAt !== undefined && mark.trailStartedAt >= 0
            ? Math.max(
                deadline,
                mark.trailStartedAt + uniform.trailDuration.value
              )
            : deadline,
        -1
      );
      if (active) uniform.trailColor.value.copy(active.trailColor);
      mapStyleProjectionEpoch++;
      if (requestRepaint) map?.triggerRepaint();
    },

    setSurfaceOverlay(
      id: string,
      overlay: {
        texture: THREE.Texture;
        sceneToTexture: THREE.Matrix4;
        opacity: number;
        previous?: {
          texture: THREE.Texture;
          sceneToTexture: THREE.Matrix4;
          opacity?: number;
        };
        transition?: number;
      } | null
    ) {
      const preceding = [...surfaceOverlays.values()].at(-1);
      if (overlay) surfaceOverlays.set(id, overlay);
      else surfaceOverlays.delete(id);
      const active = [...surfaceOverlays.values()].at(-1);
      const surface = mapStyleProjectionUniforms.surfaceOverlay!;
      surface.texture.value = active?.texture ?? null;
      surface.opacity.value = active?.opacity ?? 0;
      surface.previousTexture.value = active?.previous?.texture ?? null;
      surface.previousEnabled.value = active?.previous ? 1 : 0;
      const previousOpacity = active?.previous?.opacity;
      surface.previousOpacity.value =
        typeof previousOpacity === "number" && Number.isFinite(previousOpacity)
          ? Math.max(0, Math.min(1, previousOpacity))
          : -1;
      surface.transition.value = Math.max(
        0,
        Math.min(1, active?.transition ?? 1)
      );
      if (active?.previous)
        surface.previousSceneToTexture.value.copy(
          active.previous.sceneToTexture
        );
      if (active) surface.sceneToTexture.value.copy(active.sceneToTexture);
      mapStyleProjectionEpoch++;
      const trailScalarOnly =
        active &&
        preceding &&
        typeof active.previous?.opacity === "number" &&
        typeof preceding.previous?.opacity === "number" &&
        active.texture === preceding.texture &&
        active.opacity === preceding.opacity &&
        active.transition === preceding.transition &&
        active.sceneToTexture.equals(preceding.sceneToTexture) &&
        active.previous.texture === preceding.previous.texture &&
        active.previous.sceneToTexture.equals(
          preceding.previous.sceneToTexture
        );
      // Trail cadence belongs to its caller. Uploading its scalar in a render
      // event must not turn an idle ten-second fade into a full-rate render loop.
      if (!trailScalarOnly) map?.triggerRepaint();
    },

    setEnabled(enabled: boolean) {
      if (presentationEnabled === enabled) return;
      presentationEnabled = enabled;
      mapStyleProjectionEpoch += 1;
      mapStyleFramebufferCache?.invalidate();
      if (!enabled) mapStyleProjectionUniforms.enabled.value = 0;
      map?.triggerRepaint();
    },

    setVisible(visible: boolean) {
      if (mapStyleProjectionVisible === visible) return;
      mapStyleProjectionVisible = visible;
      mapStyleProjectionEpoch += 1;
      mapStyleFramebufferCache?.invalidate();
      if (!visible) mapStyleProjectionUniforms.enabled.value = 0;
      map?.triggerRepaint();
    },

    attach(mapInstance: MaplibreMap, sceneRenderer: THREE.WebGLRenderer) {
      map = mapInstance;
      renderer = sceneRenderer;
      mapStyleFramebufferCache?.dispose();
      mapStyleFramebufferCache = createMapStyleFramebufferCache(
        mapInstance,
        layerId
      );
      capturedMapStyleRevision = -1;
      mapStyleProjectionEpoch += 1;
    },
    removeRuntime(id: string) {
      mapStyleProjectionVersions.delete(id);
      mapStyleProjectionReceivers.delete(id);
    },
    capture(
      sceneToClipMatrix: THREE.Matrix4,
      lightingReplay: boolean,
      localFrame?: SharedThreeSceneLocalFrame
    ): boolean {
      const projective = mapStyleProjectionUniforms.projectiveOverlay!;
      projective.time.value = performance.now() / 1000;
      const fadeBucket =
        projective.opacity.value > 0 &&
        projective.time.value < projectiveTrailUntil
          ? Math.floor(projective.time.value * 10)
          : -1;
      if (fadeBucket !== projectiveFadeBucket) {
        projectiveFadeBucket = fadeBucket;
        // Invalidate only the finite 10-Hz fade, including its final transparent
        // frame. Otherwise lighting accumulation can keep an old trail forever.
        mapStyleProjectionEpoch++;
      }
      projective.pixelRatio.value =
        viewport.x / Math.max(1, map?.getCanvas().clientWidth ?? viewport.x);
      mapStyleProjectionUniforms.sceneToClip.value.copy(sceneToClipMatrix);
      const hasReceivers =
        (presentationEnabled ||
          surfaceOverlays.size > 0 ||
          projectiveOverlays.size > 0 ||
          screenOverlays.size > 0 ||
          photoMosaic.active ||
          axisSourceCount > 0) &&
        configureMapStyleProjection();
      updateAxisReceiverBounds(sceneToClipMatrix, localFrame);
      backgroundAvailable.value = 0;
      const framingActive =
        framesActive ||
        mapStyleProjectionUniforms.screenBorder!.style.value.x > 0;
      if (
        (presentationEnabled && mapStyleProjectionVisible && hasReceivers) ||
        framingActive
      ) {
        try {
          if (presentationEnabled) bindMapStyleDepth();
          const contentRevision = mapStyleFramebufferCache?.revision ?? 0;
          if (capturedMapStyleRevision !== contentRevision) {
            capturedMapStyleRevision = contentRevision;
            mapStyleProjectionEpoch += 1;
          }
          const captureSignature = [
            viewport.x,
            viewport.y,
            ...sceneToClipMatrix.elements,
            mapStyleProjectionUniforms.depthEnabled.value,
            ...mapStyleProjectionUniforms.depthNearFar.value.toArray(),
          ].join(",");
          if (
            !mapStyleFramebufferTexture ||
            !mapStyleFramebufferCache?.canReuse(
              captureSignature,
              lightingReplay
            )
          ) {
            captureMapStyleFramebuffer();
            mapStyleFramebufferCache?.captured(captureSignature);
          }
          backgroundAvailable.value = framingActive ? 1 : 0;
          mapStyleProjectionUniforms.enabled.value =
            presentationEnabled && mapStyleProjectionVisible ? 1 : 0;
        } catch (error) {
          mapStyleFramebufferCache?.captureFailed();
          mapStyleProjectionUniforms.enabled.value =
            presentationEnabled &&
            mapStyleProjectionVisible &&
            mapStyleFramebufferTexture
              ? 1
              : 0;
          mapStyleProjectionUniforms.sceneToClip.value.copy(
            capturedMapStyleMatrix
          );
          // The borrowed depth belongs to this frame, not the retained capture.
          mapStyleProjectionUniforms.depthEnabled.value = 0;
          console.warn("[shared-three-scene] map-style capture failed", error);
          if (!mapStyleFramebufferTexture) return false;
        }
      } else {
        mapStyleProjectionUniforms.enabled.value = 0;
      }

      return true;
    },
    dispose() {
      detach();
      axisOverlays.clear();
      for (const material of axisReceivers)
        setMapStyleAxisBoundaryUniforms(material, null);
      axisReceivers.clear();
      axisBoundaries.dispose();
      photoGapRepair.dispose();
      photoMosaic.dispose();
      photoDepth.dispose();
      screenOverlays.clear();
      screenBackdrops.clear();
      mapColorOwners.clear();
      mapStyleProjectionUniforms.screenFootprintColor!.value.copy(
        defaultFootprintColor
      );
      mapStyleProjectionUniforms.screenBackdropOverride!.value.set(0, 0, 0, 0);
      screenOverlayMesh.geometry.dispose();
      screenMaterial.dispose();
      projectiveOverlays.clear();
      projectiveTexture.dispose();
      mapStyleProjectionUniforms.projectiveOverlay!.data.value = null;
      mapStyleProjectionUniforms.projectiveOverlay!.count.value = 0;
      surfaceOverlays.clear();
      mapStyleProjectionUniforms.surfaceOverlay!.texture.value = null;
      mapStyleProjectionUniforms.surfaceOverlay!.opacity.value = 0;
      mapStyleProjectionVersions.clear();
      mapStyleProjectionReceivers.clear();
      mapStylePhotoReceiverStates.clear();
      projectivePhotosActive = false;
      screenPhotosActive = false;
      framesActive = false;
      heldBackdrop = null;
      handoffLookKey = undefined;

      map = null;
      renderer = null;
    },
  };
};
