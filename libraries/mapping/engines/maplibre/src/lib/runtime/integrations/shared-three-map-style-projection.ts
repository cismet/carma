import * as THREE from "three";
import { MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER } from "../../core/shared-three-map-style-shaders";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  SharedThreeSceneRuntime,
  MapStyleProjectionUniforms,
  MapStyleProjectiveOverlay,
} from "../../core/shared-three-scene-types";
import { createMapStyleFramebufferCache } from "./map-style-framebuffer-cache";
import { configureMapStyleProjectedMaterial } from "./shared-three-map-style-material";

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
    screenOverlays: [
      {
        texture: { value: null },
        viewportToTexture: { value: new THREE.Matrix3() },
        opacity: { value: 0 },
      },
      {
        texture: { value: null },
        viewportToTexture: { value: new THREE.Matrix3() },
        opacity: { value: 0 },
      },
    ],
    screenBackdrop: {
      look: { value: new THREE.Vector3(1, 1, 1) },
      tint: { value: new THREE.Vector4(0, 0, 0, 0) },
      opacity: { value: 0 },
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
  const screenOverlays = new Map<
    string,
    {
      texture: THREE.Texture;
      viewportToTexture: THREE.Matrix3;
      opacity: number;
      priority?: number;
      backdropLook?: {
        contrast: number;
        brightness: number;
        saturation: number;
      };
      backdropTint?: readonly [number, number, number, number];
      version: number;
    }
  >();
  const screenUniforms: Record<string, THREE.IUniform> = {
    carmaScreenBackdropLook: mapStyleProjectionUniforms.screenBackdrop!.look,
    carmaScreenBackdropTint: mapStyleProjectionUniforms.screenBackdrop!.tint,
    carmaScreenBackdropOpacity:
      mapStyleProjectionUniforms.screenBackdrop!.opacity,
  };
  mapStyleProjectionUniforms.screenOverlays!.forEach((screen, index) => {
    screenUniforms[`carmaScreenTexture${index}`] = screen.texture;
    screenUniforms[`carmaScreenToTexture${index}`] = screen.viewportToTexture;
    screenUniforms[`carmaScreenOpacity${index}`] = screen.opacity;
  });
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: screenUniforms,
    vertexShader: `varying vec2 vScreenUv; void main(){vScreenUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: `varying vec2 vScreenUv; ${MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER}
void main(){vec4 image=carmaScreenImages(vScreenUv);if(image.a<=0.0)discard;gl_FragColor=image;
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

  const configureMapStyleProjection = (): boolean => {
    let receiversChanged = false;
    for (const runtime of runtimes.values()) {
      const receiver = runtime.receivesMapStyleTexture;
      if (!receiver) continue;
      const version = runtime.mapStyleProjectionVersion?.() ?? 0;
      if (mapStyleProjectionVersions.get(runtime.id) === version) continue;
      let configured = false;
      runtime.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (typeof receiver === "function" && !receiver(material)) continue;
          configureMapStyleProjectedMaterial(
            material,
            mapStyleProjectionUniforms,
            runtime.mapStyleProjectionBlend ?? "replace",
            runtime.mountsOnLocalFrame === true
          );
          configured = true;
        }
      });
      mapStyleProjectionVersions.set(runtime.id, version);
      mapStyleProjectionReceivers.set(runtime.id, configured);
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

  return {
    get epoch() {
      return mapStyleProjectionEpoch;
    },
    getState(renderedFrames: number) {
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
      };
    },

    screenOverlayMesh,
    setScreenOverlay(
      id: string,
      overlay: {
        texture: THREE.Texture;
        viewportToTexture: THREE.Matrix3;
        opacity: number;
        priority?: number;
        backdropLook?: {
          contrast: number;
          brightness: number;
          saturation: number;
        };
        backdropTint?: readonly [number, number, number, number];
      } | null,
      requestRepaint = true
    ) {
      const previous = screenOverlays.get(id);
      if (
        overlay &&
        previous &&
        previous.texture === overlay.texture &&
        previous.version === overlay.texture.version &&
        previous.opacity === overlay.opacity &&
        previous.priority === overlay.priority &&
        previous.backdropLook?.contrast === overlay.backdropLook?.contrast &&
        previous.backdropLook?.brightness ===
          overlay.backdropLook?.brightness &&
        previous.backdropLook?.saturation ===
          overlay.backdropLook?.saturation &&
        [0, 1, 2, 3].every(
          (index) =>
            previous.backdropTint?.[index] === overlay.backdropTint?.[index]
        ) &&
        previous.viewportToTexture.equals(overlay.viewportToTexture)
      )
        return;
      if (!overlay && !previous) return;
      if (overlay)
        screenOverlays.set(id, {
          ...overlay,
          backdropLook: overlay.backdropLook
            ? { ...overlay.backdropLook }
            : undefined,
          backdropTint: overlay.backdropTint
            ? [...overlay.backdropTint]
            : undefined,
          viewportToTexture: overlay.viewportToTexture.clone(),
          version: overlay.texture.version,
        });
      else screenOverlays.delete(id);
      const ordered = [...screenOverlays.values()]
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .slice(-2);
      mapStyleProjectionUniforms.screenOverlays!.forEach((screen, index) => {
        const entry = ordered[index];
        screen.texture.value = entry?.texture ?? null;
        screen.opacity.value = entry?.opacity ?? 0;
        if (entry) screen.viewportToTexture.value.copy(entry.viewportToTexture);
      });
      const backdrop = ordered.find(
        (entry) => entry.backdropLook || entry.backdropTint
      );
      const backdropUniforms = mapStyleProjectionUniforms.screenBackdrop!;
      backdropUniforms.look.value.set(
        backdrop?.backdropLook?.contrast ?? 1,
        backdrop?.backdropLook?.brightness ?? 1,
        backdrop?.backdropLook?.saturation ?? 1
      );
      backdropUniforms.tint.value.fromArray(
        backdrop?.backdropTint ?? [0, 0, 0, 0]
      );
      backdropUniforms.opacity.value = backdrop?.opacity ?? 0;
      screenOverlayMesh.visible = ordered.some((entry) => entry.opacity > 0);
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
            mark.showUpMarker === false ? 1 : 0,
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
      lightingReplay: boolean
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
          screenOverlays.size > 0) &&
        configureMapStyleProjection();
      if (presentationEnabled && mapStyleProjectionVisible && hasReceivers) {
        try {
          bindMapStyleDepth();
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
          mapStyleProjectionUniforms.enabled.value = 1;
        } catch (error) {
          mapStyleFramebufferCache?.captureFailed();
          mapStyleProjectionUniforms.enabled.value = mapStyleFramebufferTexture
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
      mapStyleFramebufferCache?.dispose();
      mapStyleFramebufferCache = null;
      releaseMapStyleDepth();
      mapStyleFramebufferTexture?.dispose();
      mapStyleFramebufferTexture = null;
      mapStyleProjectionUniforms.texture.value = null;
      mapStyleProjectionUniforms.enabled.value = 0;
      screenOverlays.clear();
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

      map = null;
      renderer = null;
    },
  };
};
