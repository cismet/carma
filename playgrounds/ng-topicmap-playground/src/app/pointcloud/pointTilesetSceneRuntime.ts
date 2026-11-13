import * as THREE from "three";

import {
  createPointTilesetRuntime,
  type PointTilesetRuntime,
} from "@carma-mapping/engines/maplibre";

/**
 * Renders a point cloud delivered as a 3D Tiles 1.1 tileset (glTF POINTS
 * content) inside the shared MapLibre point-cloud scene. It is the tileset
 * counterpart of the COPC runtime: same scene layer, same local ENU origin,
 * so both deliveries of one dataset land in exactly the same place.
 *
 * The rendering lives in the engine's `createPointTilesetRuntime`; this adds
 * the playground's interactive registration offsets and the extent helper.
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
  requestRender = () => undefined,
  ...options
}: PointTilesetSceneRuntimeOptions): PointTilesetRuntime & {
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
  const runtime = createPointTilesetRuntime({
    ...options,
    dracoDecoderPath: "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
    requestRender,
  });
  const registrationGroup = runtime.offsetGroup;

  return {
    ...runtime,
    getGeographicBounds: () => {
      const sphere = new THREE.Sphere();
      if (!runtime.getBoundingSphere(sphere)) return null;
      // The tileset is anchored on its own centre, so the sphere radius is the
      // half-extent to frame. Using it for both axes over-frames slightly,
      // which is what a fly-to wants.
      const [longitude, latitude] = options.originLngLat;
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
  };
};
