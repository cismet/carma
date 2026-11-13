import { getCameraLocalMercatorFit } from "@carma-geo/proj";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { POINTCLOUD_CLASS_COUNT } from "../../core/pointcloud-class-filter";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";

/** glTF `_CLASSIFICATION`, lowercased by three's GLTFLoader. */
const CLASSIFICATION_ATTRIBUTE = "_classification";
const CLASS_MASK_STATE = "carmaPointClassMask";
const CLASS_MASK_SHADER_KEY = "|carma-point-class-mask-v1";

type ClassMaskUniforms = {
  carmaPointClassMask: { value: THREE.DataTexture };
  carmaPointClassMaskEnabled: { value: boolean };
};

/**
 * Hides the points whose class the mask turns off: one texel per class id,
 * looked up in the vertex shader, and a hidden point is moved outside the
 * clip volume. Chains onto whatever onBeforeCompile the material already has
 * (the map style projection wraps the same materials), and is added once.
 */
const configureClassMaskedMaterial = (
  material: THREE.PointsMaterial,
  uniforms: ClassMaskUniforms
) => {
  const userData = material.userData as Record<string, unknown>;
  if (userData[CLASS_MASK_STATE]) {
    return;
  }
  userData[CLASS_MASK_STATE] = true;
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.carmaPointClassMask = uniforms.carmaPointClassMask;
    shader.uniforms.carmaPointClassMaskEnabled =
      uniforms.carmaPointClassMaskEnabled;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float ${CLASSIFICATION_ATTRIBUTE};
uniform sampler2D carmaPointClassMask;
uniform bool carmaPointClassMaskEnabled;`
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
if (carmaPointClassMaskEnabled) {
  int carmaClassId = clamp(int(${CLASSIFICATION_ATTRIBUTE} + 0.5), 0, ${
    POINTCLOUD_CLASS_COUNT - 1
  });
  if (texelFetch(carmaPointClassMask, ivec2(carmaClassId, 0), 0).r < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
  }
}`
      );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}${CLASS_MASK_SHADER_KEY}`;
  material.needsUpdate = true;
};

/**
 * Renders a point cloud delivered as a 3D Tiles 1.1 tileset (glTF POINTS
 * content) inside the shared MapLibre three.js scene.
 *
 * The mesh runtime (`three-tiles-runtime`) only knows meshes: clay material,
 * white shading and outlines are all mesh-only, so points get this much
 * smaller runtime instead. Points are drawn at a fixed pixel size with their
 * vertex colours.
 *
 * A cloud can be kilometres long, too far for one tangent plane: the ellipsoid
 * and Web Mercator part by about 3.5 m per km east of the origin. So it mounts
 * on the layer's local frame, which keeps it true around the current view.
 * Decision: engines/maplibre/README.md#local-frame-for-ecef-tilesets-sun-and-sky.
 */
export type PointTilesetRuntimeOptions = {
  id: string;
  tilesetUrl: string;
  /** Scene origin as WGS84 [lng, lat]. */
  originLngLat: [number, number];
  /**
   * Ellipsoidal height of the scene origin. The tileset carries ellipsoidal
   * heights while the scene's vertical frame is DHHN2016, so passing the
   * height anomaly at the origin makes local y come out as the DHHN height.
   */
  anchorHeightEllipsoidal: number;
  /** Point size in CSS pixels. */
  pointSize?: number;
  /** Screen-space error target in pixels; lower loads finer tiles. */
  errorTarget?: number;
  /** 0 to 1. */
  opacity?: number;
  /** Decoder path for Draco-compressed tiles; left out, no Draco loader. */
  dracoDecoderPath?: string;
  requestRender?: () => void;
};

export type PointTilesetRuntime = SharedThreeSceneRuntime & {
  /**
   * Group between the scene-positioned root and the reoriented tileset, in
   * the scene frame (X east, Y up, Z south). Callers that register the cloud
   * by hand move or rotate this group.
   */
  offsetGroup: THREE.Group;
  setPointSize: (size: number) => void;
  setErrorTarget: (errorTarget: number) => void;
  setOpacity: (opacity: number) => void;
  /**
   * One byte per class id, 0 hides the class; null shows all. Only points
   * that carry `_CLASSIFICATION` can be filtered, the rest always draw.
   */
  setClassMask: (mask: Uint8Array | null) => void;
  /**
   * Inactive hides the cloud and stops traversal; the loaded tiles stay
   * cached, so becoming active again does not refetch.
   */
  setActive: (active: boolean) => void;
  /** Bounding sphere of the loaded tileset; false before its root arrives. */
  getBoundingSphere: (target: THREE.Sphere) => boolean;
};

export const createPointTilesetRuntime = ({
  id,
  tilesetUrl,
  originLngLat,
  anchorHeightEllipsoidal,
  pointSize: initialPointSize = 2,
  errorTarget: initialErrorTarget = 8,
  opacity: initialOpacity = 1,
  dracoDecoderPath,
  requestRender = () => undefined,
}: PointTilesetRuntimeOptions): PointTilesetRuntime => {
  let pointSize = initialPointSize;
  let errorTarget = initialErrorTarget;
  let minErrorTarget = 0;
  let opacity = initialOpacity;
  let active = true;
  let disposed = false;

  // One mask for every tile of the cloud, so changing it is a texture upload.
  const classMaskTexture = new THREE.DataTexture(
    new Uint8Array(POINTCLOUD_CLASS_COUNT).fill(255),
    POINTCLOUD_CLASS_COUNT,
    1,
    THREE.RedFormat,
    THREE.UnsignedByteType
  );
  classMaskTexture.minFilter = THREE.NearestFilter;
  classMaskTexture.magFilter = THREE.NearestFilter;
  classMaskTexture.generateMipmaps = false;
  classMaskTexture.needsUpdate = true;
  const classMaskUniforms: ClassMaskUniforms = {
    carmaPointClassMask: { value: classMaskTexture },
    carmaPointClassMaskEnabled: { value: false },
  };

  const tiles = new TilesRenderer(tilesetUrl);
  let dracoLoader: DRACOLoader | null = null;
  if (dracoDecoderPath) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(dracoDecoderPath);
  }
  tiles.registerPlugin(new ImplicitTilingPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(
    new GLTFExtensionsPlugin(dracoLoader ? { dracoLoader } : {})
  );
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: THREE.MathUtils.degToRad(originLngLat[1]),
      lon: THREE.MathUtils.degToRad(originLngLat[0]),
      height: 0,
    })
  );
  tiles.errorTarget = initialErrorTarget;
  tiles.downloadQueue.maxJobsPerOrigin = 8;
  tiles.parseQueue.maxJobs = 8;
  tiles.lruCache.minSize = 512;
  tiles.lruCache.maxSize = 4_096;

  // ReorientationPlugin yields X west / Z north; the scene layer expects
  // X east / Z south. The scene layer positions and scales `root` itself, so
  // the offsets live on their own group between it and the orientation fix.
  const root = new THREE.Group();
  const offsetGroup = new THREE.Group();
  const orientationGroup = new THREE.Group();
  orientationGroup.rotation.y = Math.PI;
  orientationGroup.add(tiles.group);
  // From the tangent plane at the origin to the local frame's reference fit.
  const localFrameMount = new THREE.Group();
  localFrameMount.matrixAutoUpdate = false;
  localFrameMount.add(orientationGroup);
  offsetGroup.add(localFrameMount);
  root.add(offsetGroup);
  let mountedReferenceLngLat: readonly [number, number] | null = null;

  const syncLocalFrameMount = ({
    referenceLngLat,
  }: SharedThreeSceneFrame["localFrame"]) => {
    if (
      mountedReferenceLngLat?.[0] === referenceLngLat[0] &&
      mountedReferenceLngLat?.[1] === referenceLngLat[1]
    ) {
      return;
    }
    localFrameMount.matrix
      .makeTranslation(0, -anchorHeightEllipsoidal, 0)
      .multiply(
        getCameraLocalMercatorFit(originLngLat, referenceLngLat, {
          correctEllipsoidMetric: true,
        })
      );
    root.updateMatrixWorld(true);
    mountedReferenceLngLat = referenceLngLat;
  };

  const applyMaterial = (object: THREE.Object3D) => {
    object.traverse((child) => {
      if (!(child instanceof THREE.Points)) {
        return;
      }
      const material = child.material as THREE.PointsMaterial;
      material.size = pointSize;
      material.sizeAttenuation = false;
      material.vertexColors = Boolean(child.geometry.getAttribute("color"));
      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.depthWrite = opacity >= 1;
      if (child.geometry.getAttribute(CLASSIFICATION_ATTRIBUTE)) {
        configureClassMaskedMaterial(material, classMaskUniforms);
      }
      material.needsUpdate = true;
    });
  };
  const onLoadModel = (event: { scene?: THREE.Object3D }) => {
    if (!event.scene) {
      return;
    }
    applyMaterial(event.scene);
    requestRender();
  };
  tiles.addEventListener("load-model", onLoadModel);
  const applyErrorTarget = () => {
    const next = Math.max(errorTarget, minErrorTarget);
    if (next === tiles.errorTarget) {
      return;
    }
    tiles.errorTarget = next;
    tiles.dispatchEvent({ type: "needs-update" });
    requestRender();
  };
  // UpdateOnChangePlugin only re-traverses on detected change; a periodic kick
  // keeps a slow tileset from settling in a half-loaded state.
  const watchdogTimer = window.setInterval(() => {
    if (!disposed && active) {
      tiles.dispatchEvent({ type: "needs-update" });
    }
  }, 2_000);

  return {
    id,
    originLngLat,
    root,
    mountsOnLocalFrame: true,
    offsetGroup,
    update: (frame: SharedThreeSceneFrame) => {
      if (disposed || !active) {
        return;
      }
      syncLocalFrameMount(frame.localFrame);
      tiles.setCamera(frame.lodCamera);
      // setResolutionFromRenderer would call renderer.getSize(); this layer
      // draws through MapLibre's own context and has no three renderer to
      // hand over, so the frame's viewport is passed explicitly.
      tiles.setResolution(
        frame.lodCamera,
        Math.max(1, frame.viewport.x),
        Math.max(1, frame.viewport.y)
      );
      tiles.update();
    },
    setPointSize: (size: number) => {
      if (size === pointSize) {
        return;
      }
      pointSize = size;
      applyMaterial(tiles.group);
      requestRender();
    },
    setErrorTarget: (next: number) => {
      errorTarget = next;
      applyErrorTarget();
    },
    setMinErrorTarget: (next: number) => {
      minErrorTarget = next;
      applyErrorTarget();
    },
    setOpacity: (next: number) => {
      const clamped = Math.min(1, Math.max(0, next));
      if (clamped === opacity) {
        return;
      }
      opacity = clamped;
      applyMaterial(tiles.group);
      requestRender();
    },
    setClassMask: (mask: Uint8Array | null) => {
      const data = classMaskTexture.image.data as Uint8Array;
      for (let classId = 0; classId < POINTCLOUD_CLASS_COUNT; classId++) {
        data[classId] = !mask || mask[classId] ? 255 : 0;
      }
      classMaskTexture.needsUpdate = true;
      classMaskUniforms.carmaPointClassMaskEnabled.value = mask !== null;
      requestRender();
    },
    setActive: (next: boolean) => {
      if (next === active) {
        return;
      }
      active = next;
      root.visible = next;
      if (next) {
        tiles.dispatchEvent({ type: "needs-update" });
      }
      requestRender();
    },
    getBoundingSphere: (target: THREE.Sphere) =>
      tiles.getBoundingSphere(target) && target.radius > 0,
    dispose: () => {
      disposed = true;
      window.clearInterval(watchdogTimer);
      tiles.removeEventListener("load-model", onLoadModel);
      tiles.dispose();
      dracoLoader?.dispose();
      classMaskTexture.dispose();
    },
  };
};
