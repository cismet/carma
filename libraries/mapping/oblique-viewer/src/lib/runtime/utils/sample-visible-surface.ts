import { Matrix4, Plane, Raycaster, Vector3 } from "three";
import type { ImageView } from "@carma-commons/image-pyramid";
import type { Ratio } from "@carma-units";
import {
  planPhotoMosaic,
  type MosaicPhoto,
  type MosaicSurfaceSample,
} from "../../core/utils/photo-mosaic-plan";

export type VisibleSurfaceHit = {
  point: Vector3;
  surface: "mesh" | "terrain";
  /** Normal in the same shared scene coordinates as point. */
  normal?: Vector3;
};
export type VisibleSurfaceOptions = {
  clip: Matrix4;
  /** Actual output-buffer dimensions; device pixel ratio is already included. */
  pixels: { width: number; height: number };
  projectEye: (point: Vector3) => [number, number] | null | undefined;
  intersectSurface: (
    ray: Raycaster,
    eye: [number, number]
  ) => VisibleSurfaceHit | null;
  isCurrent?: () => boolean;
  signal?: AbortSignal;
};
export type VisibleSurfaceSamples = {
  samples: MosaicSurfaceSample[];
  sampleScreen: { x: number; y: number }[];
  centerSampleIndex: number;
  cols: number;
  rows: number;
  sampleRadiusPixels: number;
};

/** Sample the rendered surfaces cooperatively, with adjacent rays one buffer pixel apart. */
export const sampleVisibleSurface = async ({
  clip,
  pixels: size,
  projectEye,
  intersectSurface,
  isCurrent,
  signal,
}: VisibleSurfaceOptions): Promise<VisibleSurfaceSamples | null> => {
  const valid = () => !signal?.aborted && (isCurrent?.() ?? true);
  if (
    !valid() ||
    !Number.isFinite(size.width + size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    !clip.elements.every(Number.isFinite) ||
    clip.determinant() === 0
  )
    return null;
  const inverse = clip.clone().invert();
  const ray = (x: number, y: number) => {
    const near = new Vector3(
      (2 * x) / size.width - 1,
      1 - (2 * y) / size.height,
      -1
    ).applyMatrix4(inverse);
    const far = new Vector3(
      (2 * x) / size.width - 1,
      1 - (2 * y) / size.height,
      1
    ).applyMatrix4(inverse);
    const cast = new Raycaster(
      near,
      far.clone().sub(near).normalize(),
      0,
      near.distanceTo(far)
    );
    (cast as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
    return cast;
  };
  let sliceStarted = performance.now();
  const castSurface = async (x: number, y: number) => {
    // Each triangle traversal can consume the slice on its own. Yield between
    // neighbour casts as well as between grid cells.
    if (performance.now() - sliceStarted >= 4) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
    if (!valid()) return null;
    const cast = ray(x, y);
    const eye = projectEye(cast.ray.origin);
    if (!eye) return null;
    const hit = intersectSurface(cast, eye);
    return hit
      ? { ...hit, distance: cast.ray.origin.distanceTo(hit.point) }
      : null;
  };
  const tangentPoint = (x: number, y: number, plane: Plane) => {
    const cast = ray(x, y);
    // A parallel ray on the plane has no unique derivative intersection.
    if (Math.abs(cast.ray.direction.dot(plane.normal)) < 1e-10) return null;
    const point = cast.ray.intersectPlane(plane, new Vector3());
    return point &&
      point.toArray().every(Number.isFinite) &&
      cast.ray.origin.distanceTo(point) <= cast.far
      ? point
      : null;
  };
  const samples: MosaicSurfaceSample[] = [],
    sampleScreen: { x: number; y: number }[] = [];
  let centerSampleIndex = -1;
  const cols = 9,
    rows = 7;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x = ((col + 0.5) * size.width) / cols,
        y = ((row + 0.5) * size.height) / rows;
      const hit = await castSurface(x, y);
      if (!valid()) return null;
      if (!hit) continue;
      const normal = hit.normal;
      const plane =
        normal &&
        normal.toArray().every(Number.isFinite) &&
        Number.isFinite(normal.lengthSq()) &&
        normal.lengthSq() > 0
          ? new Plane().setFromNormalAndCoplanarPoint(
              normal.clone().normalize(),
              hit.point
            )
          : null;
      const tangentDx = plane ? tangentPoint(x + 1, y, plane) : null;
      const tangentDy = plane ? tangentPoint(x, y + 1, plane) : null;
      let dx: VisibleSurfaceHit | null, dy: VisibleSurfaceHit | null;
      if (tangentDx && tangentDy) {
        dx = { point: tangentDx, surface: hit.surface };
        dy = { point: tangentDy, surface: hit.surface };
      } else {
        dx = await castSurface(x + 1, y);
        if (!valid()) return null;
        dy = await castSurface(x, y + 1);
        if (!valid()) return null;
      }
      if (
        !hit ||
        !dx ||
        !dy ||
        hit.surface !== dx.surface ||
        hit.surface !== dy.surface
      )
        continue;
      const a = hit.point.distanceTo(dx.point),
        b = hit.point.distanceTo(dy.point);
      // Silhouette/depth jumps do not represent local pixel density.
      if (
        !Number.isFinite(a + b) ||
        Math.min(a, b) <= 1e-8 ||
        Math.max(a, b) > Math.max(0.25, hit.distance * 0.01) ||
        Math.max(a, b) / Math.min(a, b) > 20
      )
        continue;
      if (col === 4 && row === 3) centerSampleIndex = samples.length;
      sampleScreen.push({ x, y });
      samples.push({
        point: hit.point.clone(),
        dx: dx.point.clone(),
        dy: dy.point.clone(),
      });
    }
  return valid()
    ? {
        samples,
        sampleScreen,
        centerSampleIndex,
        cols,
        rows,
        sampleRadiusPixels:
          Math.hypot(size.width / cols, size.height / rows) / 2 + 1,
      }
    : null;
};

export type HoverPhotoView = {
  view: ImageView;
  width: number;
  height: number;
  requiredDensity: number;
  nativeLimited: boolean;
  budgetLimited: boolean;
};
/** One clipped photo ROI, never a full-sensor fallback for missing surface information. */
export const planHoverPhotoView = async ({
  photo,
  surfaceSamples,
  ...options
}: VisibleSurfaceOptions & {
  photo: MosaicPhoto;
  /** Shared geometry work; cancellation remains local to this view request. */
  surfaceSamples?: Promise<VisibleSurfaceSamples | null>;
}): Promise<HoverPhotoView | null> => {
  if (options.signal?.aborted || options.isCurrent?.() === false) return null;
  const sampled = await (surfaceSamples ?? sampleVisibleSurface(options));
  if (
    !sampled?.samples.length ||
    options.signal?.aborted ||
    options.isCurrent?.() === false
  )
    return null;
  const [plan] = planPhotoMosaic({
    photos: [photo],
    samples: sampled.samples,
    centerSampleIndex: sampled.centerSampleIndex,
    sampleRadiusPixels: sampled.sampleRadiusPixels,
  });
  if (!plan) return null;
  const crop = plan.view.visible;
  const maximumPixels = Math.min(
    options.pixels.width * options.pixels.height,
    8_000_000
  );
  const requested = Math.min(1, plan.view.density);
  const density = Math.min(
    requested,
    Math.sqrt(maximumPixels / (crop.width * crop.height))
  );
  if (!(Number.isFinite(density) && density > 0)) return null;
  const width = Math.floor(crop.width * density),
    height = Math.floor(crop.height * density);
  if (width < 1 || height < 1) return null;
  return {
    view: { visible: crop, density: density as Ratio },
    width,
    height,
    requiredDensity: plan.requiredDensity,
    nativeLimited: plan.nativeLimited,
    budgetLimited: density < requested,
  };
};
