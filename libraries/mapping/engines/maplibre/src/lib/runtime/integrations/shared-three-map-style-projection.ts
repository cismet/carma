import * as THREE from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  SharedThreeSceneRuntime,
  MapStyleProjectionUniforms,
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
  };
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
            runtime.mapStyleProjectionBlend ?? "replace"
          );
          configured = true;
        }
      });
      mapStyleProjectionVersions.set(runtime.id, version);
      mapStyleProjectionReceivers.set(runtime.id, configured);
    }
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
      mapStyleProjectionUniforms.sceneToClip.value.copy(sceneToClipMatrix);
      if (mapStyleProjectionVisible && configureMapStyleProjection()) {
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
      mapStyleProjectionVersions.clear();
      mapStyleProjectionReceivers.clear();

      map = null;
      renderer = null;
    },
  };
};
