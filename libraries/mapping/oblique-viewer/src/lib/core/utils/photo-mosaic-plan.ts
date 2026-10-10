import type { ImageRect, ImageView } from "@carma-commons/image-pyramid";
import type { DevicePixels, Ratio } from "@carma-units";
import { Matrix4, Vector3, Vector4 } from "three";
import { normalizeSeamlessCenterY } from "./seamless-image-center";

export type MosaicPhoto = Readonly<{
  id: string;
  /** Scene to bottom-left sensor UV; positive w is in front of the photo. */
  projection: Matrix4;
  width: number;
  height: number;
}>;
export type MosaicSurfaceSample = Readonly<{
  point: Vector3;
  /** Absolute points one output-buffer pixel away on the same surface. */
  dx?: Vector3;
  dy?: Vector3;
}>;
export type MosaicImagePatch = Readonly<
  ImageRect & {
    /** Required sampling for this surface cell only, capped at native resolution. */
    density: Ratio;
    requiredDensity: number;
  }
>;
export type PhotoMosaicPlan = Readonly<{
  id: string;
  view: ImageView;
  /** Conservative bounds of owned cells; gaps between cells stay unrequested. */
  patches: readonly MosaicImagePatch[];
  /** Larger values draw above smaller values. */
  priority: number;
  /** Indices of surface samples assigned to this photo. */
  coverage: readonly number[];
  /** Uncapped output-buffer pixels per native pixel. */
  requiredDensity: number;
  nativeLimited: boolean;
}>;
const project = (photo: MosaicPhoto, point: Vector3) => {
  const p = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    photo.projection
  );
  if (!(p.w > 0) || !p.toArray().every(Number.isFinite)) return null;
  return { x: p.x / p.w, y: p.y / p.w, homogeneous: p };
};
const differential = (photo: MosaicPhoto, sample: MosaicSurfaceSample) => {
  if (!sample.dx || !sample.dy) return null;
  const p = project(photo, sample.point);
  if (!p) return null;
  const derivative = (neighbor: Vector3) => {
    const offset = neighbor.clone().sub(sample.point);
    const d = new Vector4(offset.x, offset.y, offset.z, 0).applyMatrix4(
      photo.projection
    );
    const w = p.homogeneous.w;
    return [
      (photo.width * (d.x - p.x * d.w)) / w,
      (-photo.height * (d.y - p.y * d.w)) / w,
      d.w / w,
    ];
  };
  const [a, c, wx] = derivative(sample.dx),
    [b, d, wy] = derivative(sample.dy);
  if (![a, b, c, d, wx, wy].every(Number.isFinite)) return null;
  const sum = a * a + b * b + c * c + d * d,
    determinant = a * d - b * c;
  const largest = Math.sqrt(
    (sum + Math.sqrt(Math.max(0, sum * sum - 4 * determinant * determinant))) /
      2
  );
  const smallest = Math.abs(determinant) / largest;
  if (!(smallest > 0 && Number.isFinite(smallest))) return null;
  return { a, b, c, d, wx, wy, density: 1 / smallest };
};

/** Output-buffer-pixel Jacobian; render resolution/DPR is already in dx/dy. */
export const mosaicSampleDensity = (
  photo: MosaicPhoto,
  sample: MosaicSurfaceSample
): number | null => differential(photo, sample)?.density ?? null;

/** Plan sampled surface coverage only. Callers filter cardinal direction and
 * supply actual visible-surface hits; no unobserved geometry is claimed covered.
 * Photos claim cells strictly inside-out by preferred-center distance, never by coverage size.
 */
export const planPhotoMosaic = ({
  photos,
  samples,
  centerSampleIndex,
  centerY = 0.3,
  sampleRadiusPixels,
}: {
  photos: readonly MosaicPhoto[];
  samples: readonly MosaicSurfaceSample[];
  centerSampleIndex: number;
  centerY?: number;
  /** Half the sampling-cell diagonal plus an output-buffer-pixel guard. */
  sampleRadiusPixels: number;
}): PhotoMosaicPlan[] => {
  if (!(sampleRadiusPixels >= 0 && Number.isFinite(sampleRadiusPixels)))
    return [];
  const preferredY = normalizeSeamlessCenterY(centerY);
  const unique = new Set<string>();
  const candidates = photos.flatMap((photo) => {
    if (
      unique.has(photo.id) ||
      !(photo.width > 0 && photo.height > 0) ||
      !Number.isFinite(photo.width + photo.height)
    )
      return [];
    unique.add(photo.id);
    const hits = samples.map((sample) => project(photo, sample.point));
    const jacobians = samples.map((sample) => differential(photo, sample));
    const coverage = hits.flatMap((point, index) => {
      const j = jacobians[index];
      return point &&
        point.x >= 0 &&
        point.x <= 1 &&
        point.y >= 0 &&
        point.y <= 1 &&
        j &&
        Number.isFinite(j.density) &&
        1 - sampleRadiusPixels * Math.hypot(j.wx, j.wy) > 0
        ? [index]
        : [];
    });
    // The actual viewport center remains the ranking reference even outside
    // this sensor. Only a missing/behind-camera center falls back to visible hits.
    const center = hits[centerSampleIndex];
    const distance = (point: NonNullable<(typeof hits)[number]>) =>
      Math.hypot(point.x - 0.5, point.y - preferredY);
    return coverage.length
      ? [
          {
            photo,
            hits,
            jacobians,
            coverage,
            centerDistance: center
              ? distance(center)
              : coverage.reduce(
                  (nearest, index) => Math.min(nearest, distance(hits[index]!)),
                  Infinity
                ),
          },
        ]
      : [];
  });
  const uncovered = new Set(
    candidates.flatMap((candidate) => candidate.coverage)
  );
  const plans: PhotoMosaicPlan[] = [];
  candidates.sort(
    (a, b) =>
      a.centerDistance - b.centerDistance ||
      (a.photo.id < b.photo.id ? -1 : a.photo.id > b.photo.id ? 1 : 0)
  );
  for (const selected of candidates) {
    if (!uncovered.size) break;
    const coverage = selected.coverage.filter((index) =>
      uncovered.delete(index)
    );
    if (!coverage.length) continue;
    const { photo, hits, jacobians } = selected;
    const patches: MosaicImagePatch[] = [];
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity,
      density = 0;
    for (const index of coverage) {
      const point = hits[index]!;
      const jacobian = jacobians[index]!;
      density = Math.max(density, jacobian.density);
      // A local projective tangent patch has a bounded margin only while its
      // entire sampling cell stays on the same side of the photo horizon.
      const denominator =
        1 - sampleRadiusPixels * Math.hypot(jacobian.wx, jacobian.wy);
      const padX =
        1 +
        (sampleRadiusPixels * Math.hypot(jacobian.a, jacobian.b)) / denominator;
      const padY =
        1 +
        (sampleRadiusPixels * Math.hypot(jacobian.c, jacobian.d)) / denominator;
      const x = point.x * photo.width,
        y = (1 - point.y) * photo.height;
      const patchX = Math.max(0, Math.floor(x - padX));
      const patchY = Math.max(0, Math.floor(y - padY));
      patches.push({
        density: Math.min(1, jacobian.density) as Ratio,
        requiredDensity: jacobian.density,
        x: patchX as DevicePixels,
        y: patchY as DevicePixels,
        width: (Math.min(photo.width, Math.ceil(x + padX)) -
          patchX) as DevicePixels,
        height: (Math.min(photo.height, Math.ceil(y + padY)) -
          patchY) as DevicePixels,
      });
      left = Math.min(left, x - padX);
      right = Math.max(right, x + padX);
      top = Math.min(top, y - padY);
      bottom = Math.max(bottom, y + padY);
    }
    const x = Math.max(0, Math.floor(left));
    const y = Math.max(0, Math.floor(top));
    const width = Math.min(photo.width, Math.ceil(right)) - x;
    const height = Math.min(photo.height, Math.ceil(bottom)) - y;
    plans.push({
      id: photo.id,
      priority: candidates.length - plans.length,
      coverage,
      patches,
      view: {
        visible: {
          x: x as DevicePixels,
          y: y as DevicePixels,
          width: width as DevicePixels,
          height: height as DevicePixels,
        },
        density: Math.min(1, density) as Ratio,
      },
      requiredDensity: density,
      nativeLimited: density > 1,
    });
  }
  return plans;
};
