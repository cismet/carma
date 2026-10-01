import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";

/**
 * Renders a point cloud delivered as a 3D Tiles 1.1 tileset (glTF POINTS
 * content) inside the shared MapLibre three.js scene.
 *
 * The mesh runtime (`three-tiles-runtime`) only knows meshes: clay material,
 * white shading and outlines are all mesh-only, so points get this much
 * smaller runtime instead. Points are drawn at a fixed pixel size with their
 * vertex colours.
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
  errorTarget = 8,
  opacity: initialOpacity = 1,
  dracoDecoderPath,
  requestRender = () => undefined,
}: PointTilesetRuntimeOptions): PointTilesetRuntime => {
  let pointSize = initialPointSize;
  let opacity = initialOpacity;
  let active = true;
  let disposed = false;

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
      height: anchorHeightEllipsoidal,
    })
  );
  tiles.errorTarget = errorTarget;
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
  offsetGroup.add(orientationGroup);
  root.add(offsetGroup);

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
    offsetGroup,
    update: (frame: SharedThreeSceneFrame) => {
      if (disposed || !active) {
        return;
      }
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
      if (next === tiles.errorTarget) {
        return;
      }
      tiles.errorTarget = next;
      tiles.dispatchEvent({ type: "needs-update" });
      requestRender();
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
    },
  };
};
