import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Putting a real camera where MapLibre is looking from.
// ─────────────────────────────────────────────────────────────

/** MapLibre's own default field of view, radians, for when the transform hides it. */
const DEFAULT_FOV_RAD = 0.6435011087932844;

/** Below this pitch the view is flat enough that "up" has to follow the bearing. */
const FLAT_PITCH_DEG = 5;

export interface LodCameraFrame {
  /** Scene origin, the point the local metre frame is measured from. */
  originMerc: MercatorCoordinate;
  /** One metre in Mercator units at that origin. */
  meterScale: number;
  /** Drawing buffer size in pixels. */
  viewport: THREE.Vector2;
  /** Optional elevation for the map centre when terrain lives outside MapLibre. */
  centerElevationMeters?: number;
}

/**
 * Move `camera` to where MapLibre's camera is, in the local scene frame
 * (x east, y up, z south, metres from the origin).
 *
 * A MapLibre custom layer is handed a projection matrix and nothing else, which
 * is all that drawing needs. Anything that has to decide *what* to draw needs
 * more than that: a 3D Tiles renderer picks a level of detail from how many
 * pixels a tile's geometric error covers, and that is a question about where the
 * camera stands and how wide it sees, not about a matrix. So the pose is rebuilt
 * from the map's own centre, pitch, bearing and camera distance.
 *
 * `transform.cameraToCenterDistance` is in pixels at the current world size,
 * hence the division by `worldSize` and then by the metre scale. The two are
 * read off the transform because MapLibre exposes no public equivalent.
 *
 * Returns false when the transform has nothing usable yet, which happens on the
 * first frames after a style swap.
 */
export function synthesizeLodCamera(
  camera: THREE.PerspectiveCamera,
  map: MaplibreMap,
  frame: LodCameraFrame,
  lookTarget = new THREE.Vector3()
): boolean {
  const { originMerc, meterScale, viewport } = frame;

  const transform = (
    map as unknown as {
      transform: {
        _fov?: number;
        cameraToCenterDistance?: number;
        worldSize?: number;
      };
    }
  ).transform;

  const fovRad = transform._fov ?? DEFAULT_FOV_RAD;
  const distancePx = transform.cameraToCenterDistance ?? 0;
  const worldSize = transform.worldSize ?? 1;
  if (!distancePx || !worldSize || meterScale <= 0) {
    return false;
  }
  const distanceMeters = distancePx / worldSize / meterScale;

  const centerLngLat = map.getCenter();
  const centerMerc = MercatorCoordinate.fromLngLat(
    centerLngLat,
    frame.centerElevationMeters ?? map.queryTerrainElevation(centerLngLat) ?? 0
  );
  lookTarget.set(
    (centerMerc.x - originMerc.x) / meterScale,
    (centerMerc.z - originMerc.z) / meterScale,
    (centerMerc.y - originMerc.y) / meterScale
  );

  const pitch = THREE.MathUtils.degToRad(map.getPitch());
  const bearing = THREE.MathUtils.degToRad(map.getBearing());
  camera.position.set(
    lookTarget.x - Math.sin(bearing) * Math.sin(pitch) * distanceMeters,
    lookTarget.y + Math.cos(pitch) * distanceMeters,
    lookTarget.z + Math.cos(bearing) * Math.sin(pitch) * distanceMeters
  );

  // Straight down, the direction the camera is looking is the world's up axis,
  // so lookAt has no way to work out which way round the view is. The bearing
  // has to supply it.
  if (map.getPitch() < FLAT_PITCH_DEG) {
    camera.up.set(-Math.sin(bearing), 0, -Math.cos(bearing));
  } else {
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(lookTarget);

  camera.fov = THREE.MathUtils.radToDeg(fovRad);
  camera.aspect = viewport.x / Math.max(1, viewport.y);
  camera.near = 2;
  camera.far = 1_000_000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return true;
}
