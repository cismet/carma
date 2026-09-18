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
        width?: number;
        height?: number;
        centerOffset?: { x: number; y: number };
      };
    }
  ).transform;

  const publicFovDegrees = (
    map as unknown as { getVerticalFieldOfView?: () => number }
  ).getVerticalFieldOfView?.();
  const publicFovRad = THREE.MathUtils.degToRad(publicFovDegrees ?? NaN);
  const fovRad =
    Number.isFinite(publicFovRad) && publicFovRad > 0
      ? publicFovRad
      : transform._fov ?? DEFAULT_FOV_RAD;
  const distancePx = transform.cameraToCenterDistance ?? 0;
  const worldSize = transform.worldSize ?? 1;
  if (!distancePx || !worldSize || meterScale <= 0) {
    return false;
  }
  const distanceMeters = distancePx / worldSize / meterScale;

  const centerLngLat = map.getCenter();
  const centerElevation = map.getCenterElevation?.();
  const centerMerc = MercatorCoordinate.fromLngLat(
    centerLngLat,
    frame.centerElevationMeters ??
      (typeof centerElevation === "number" && Number.isFinite(centerElevation)
        ? centerElevation
        : map.queryTerrainElevation(centerLngLat) ?? 0)
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
  const canvas = map.getCanvas?.();
  const width = transform.width || canvas?.clientWidth || viewport.x;
  const height = transform.height || canvas?.clientHeight || viewport.y;
  camera.aspect = width / Math.max(1, height);
  camera.near = 2;
  camera.far = 1_000_000;
  // MapLibre padding moves the principal point in CSS pixels, while selection
  // resolution remains the complete drawing buffer. A full-size Three view
  // offset retains those asymmetric edge rays without cropping coverage.
  // Decision: TILE-VIEWPORT-PADDING-20260914 in engines/maplibre/TILES_COVERAGE.md.
  const offset = transform.centerOffset;
  if (offset && (offset.x !== 0 || offset.y !== 0)) {
    camera.setViewOffset(width, height, -offset.x, -offset.y, width, height);
  } else {
    camera.clearViewOffset();
  }
  camera.updateMatrixWorld(true);
  return true;
}
