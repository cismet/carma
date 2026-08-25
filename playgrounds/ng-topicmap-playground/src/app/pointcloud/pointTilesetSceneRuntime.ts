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
} from "@carma-mapping/engines/maplibre";

/**
 * Renders a point cloud delivered as a 3D Tiles 1.1 tileset (glTF POINTS
 * content) inside the shared MapLibre point-cloud scene. It is the tileset
 * counterpart of the COPC runtime: same scene layer, same local ENU origin,
 * so both deliveries of one dataset land in exactly the same place.
 */
export type PointTilesetSceneRuntimeOptions = {
  id: string;
  tilesetUrl: string;
  /** Scene origin as WGS84 [lng, lat]. */
  originLngLat: [number, number];
  /** Ellipsoidal height of the scene origin. */
  anchorHeightEllipsoidal: number;
  pointSize?: number;
  errorTarget?: number;
  requestRender?: () => void;
};

export const createPointTilesetSceneRuntime = ({
  id,
  tilesetUrl,
  originLngLat,
  anchorHeightEllipsoidal,
  pointSize: initialPointSize = 2,
  errorTarget = 8,
  requestRender = () => undefined,
}: PointTilesetSceneRuntimeOptions): SharedThreeSceneRuntime & {
  setPointSize: (size: number) => void;
  /** WGS84 extent of the loaded tileset, or null before its root arrives. */
  getGeographicBounds: () => {
    centerLngLat: [number, number];
    boundsLngLat: [[number, number], [number, number]];
  } | null;
  setPositionOffset: (east: number, north: number, up: number) => void;
  setRotationOffset: (
    eastDegrees: number,
    northDegrees: number,
    upDegrees: number
  ) => void;
} => {
  let pointSize = initialPointSize;
  let disposed = false;

  const tiles = new TilesRenderer(tilesetUrl);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  tiles.registerPlugin(new ImplicitTilingPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: THREE.MathUtils.degToRad(originLngLat[1]),
      lon: THREE.MathUtils.degToRad(originLngLat[0]),
      height: anchorHeightEllipsoidal,
    })
  );
  tiles.errorTarget = errorTarget;
  tiles.downloadQueue.maxJobs = 8;
  tiles.parseQueue.maxJobs = 8;
  tiles.lruCache.minSize = 512;
  tiles.lruCache.maxSize = 4_096;

  // ReorientationPlugin yields X west / Z north; the scene layer expects
  // X east / Z south, the same correction the COPC chunks already carry.
  // The scene layer positions and scales `root` itself, so the interactive
  // registration offsets live on their own group between it and the tileset:
  // translation in the scene frame, rotation about the anchor, then the
  // X east / Z south correction the reoriented tileset needs.
  const root = new THREE.Group();
  const registrationGroup = new THREE.Group();
  const orientationGroup = new THREE.Group();
  orientationGroup.rotation.y = Math.PI;
  orientationGroup.add(tiles.group);
  registrationGroup.add(orientationGroup);
  root.add(registrationGroup);

  const applyPointSize = (object: THREE.Object3D) => {
    object.traverse((child) => {
      const points = child as THREE.Points;
      if (!(points instanceof THREE.Points)) return;
      const material = points.material as THREE.PointsMaterial;
      material.size = pointSize;
      material.sizeAttenuation = false;
      material.vertexColors = Boolean(points.geometry.getAttribute("color"));
      material.needsUpdate = true;
    });
  };
  const onLoadModel = (event: { scene?: THREE.Object3D }) => {
    if (!event.scene) return;
    applyPointSize(event.scene);
    requestRender();
  };
  tiles.addEventListener("load-model", onLoadModel);
  // UpdateOnChangePlugin only re-traverses on detected change; a periodic kick
  // keeps a slow tileset from settling in a half-loaded state.
  const watchdogTimer = window.setInterval(() => {
    if (!disposed) tiles.dispatchEvent({ type: "needs-update" });
  }, 2_000);

  return {
    id,
    originLngLat,
    root,
    update: (frame: SharedThreeSceneFrame) => {
      if (disposed) return;
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
    getGeographicBounds: () => {
      const sphere = new THREE.Sphere();
      if (!tiles.getBoundingSphere(sphere) || !(sphere.radius > 0)) return null;
      // The tileset is anchored on its own centre, so the sphere radius is the
      // half-extent to frame. Using it for both axes over-frames slightly,
      // which is what a fly-to wants.
      const [longitude, latitude] = originLngLat;
      const metresPerDegreeLatitude = 111_320;
      const metresPerDegreeLongitude = Math.max(
        1,
        metresPerDegreeLatitude * Math.cos((latitude * Math.PI) / 180)
      );
      const deltaLatitude = sphere.radius / metresPerDegreeLatitude;
      const deltaLongitude = sphere.radius / metresPerDegreeLongitude;
      return {
        centerLngLat: [longitude, latitude] as [number, number],
        boundsLngLat: [
          [longitude - deltaLongitude, latitude - deltaLatitude],
          [longitude + deltaLongitude, latitude + deltaLatitude],
        ] as [[number, number], [number, number]],
      };
    },
    /** Interactive registration offset in ENU metres. */
    setPositionOffset: (east: number, north: number, up: number) => {
      // Scene frame is X east, Y up, Z south.
      registrationGroup.position.set(east, up, -north);
      registrationGroup.updateMatrixWorld(true);
      requestRender();
    },
    /** Interactive registration rotation about the scene's ENU axes. */
    setRotationOffset: (
      eastDegrees: number,
      northDegrees: number,
      upDegrees: number
    ) => {
      // Extrinsic XYZ about the fixed grid axes, matching the COPC layer:
      // X east, Y north, Z up -> scene X, -Z, Y.
      registrationGroup.rotation.set(
        THREE.MathUtils.degToRad(eastDegrees),
        THREE.MathUtils.degToRad(upDegrees),
        -THREE.MathUtils.degToRad(northDegrees),
        "XYZ"
      );
      registrationGroup.updateMatrixWorld(true);
      requestRender();
    },
    setPointSize: (size: number) => {
      if (size === pointSize) return;
      pointSize = size;
      applyPointSize(tiles.group);
      requestRender();
    },
    dispose: () => {
      disposed = true;
      window.clearInterval(watchdogTimer);
      tiles.removeEventListener("load-model", onLoadModel);
      tiles.dispose();
      dracoLoader.dispose();
    },
  };
};
