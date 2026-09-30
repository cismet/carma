import { TILE_MAIN_OBSERVER_ID } from "./tile-camera-demand";

export type MeshCameraContribution = Readonly<{
  id: string;
  currentErrorPixels: number | null;
  nextErrorPixels: number;
  visibleAreaFraction: number;
  targetErrorPixels: number;
}>;

export const MESH_CAMERA_PHASE_PRIORITY = {
  PRIMARY_FILL: 4,
  OTHER_FILL: 3,
  REFINEMENT: 1,
  NONE: Number.NEGATIVE_INFINITY,
} as const;

/** Camera-local progress; ready replacement families never wait for a global wave. */
export const nextMeshCameraErrorTarget = (
  baseTargetPixels: number,
  currentErrorPixels: number
): number => {
  if (!Number.isFinite(baseTargetPixels) || baseTargetPixels <= 0)
    throw new RangeError(
      "Mesh camera error target must be finite and positive"
    );
  if (
    !Number.isFinite(currentErrorPixels) ||
    currentErrorPixels <= baseTargetPixels
  )
    return baseTargetPixels;
  const band = Math.ceil(Math.log2(currentErrorPixels / baseTargetPixels));
  return Math.max(baseTargetPixels, baseTargetPixels * 2 ** (band - 1));
};

/** Equal camera weights, with area expressed as a share of each camera's viewport. */
export const evaluateMeshCameraObjective = (
  contributions: readonly MeshCameraContribution[]
) => {
  let priority: number = MESH_CAMERA_PHASE_PRIORITY.NONE;
  let benefit = 0;
  let currentErrorPixels = 0;
  let nextErrorPixels = 0;
  let visibleAreaFraction = 0;
  let errorBand = 0;
  let primaryGapArea = 0;
  let otherGapArea = 0;
  for (const contribution of contributions) {
    const {
      currentErrorPixels: current,
      nextErrorPixels: next,
      targetErrorPixels: target,
    } = contribution;
    if (
      !Number.isFinite(contribution.visibleAreaFraction) ||
      (!Number.isFinite(next) && !(current === null && next === Infinity)) ||
      next < 0 ||
      !Number.isFinite(target) ||
      target <= 0 ||
      (current !== null && (!Number.isFinite(current) || current < 0))
    )
      continue;
    const area = Math.max(0, Math.min(1, contribution.visibleAreaFraction));
    if (area === 0) continue;
    visibleAreaFraction += area;
    currentErrorPixels = Math.max(currentErrorPixels, current ?? 0);
    nextErrorPixels = Math.max(
      nextErrorPixels,
      Number.isFinite(next) ? next : target
    );
    if (current === null) {
      priority = Math.max(
        priority,
        contribution.id === TILE_MAIN_OBSERVER_ID
          ? MESH_CAMERA_PHASE_PRIORITY.PRIMARY_FILL
          : MESH_CAMERA_PHASE_PRIORITY.OTHER_FILL
      );
      if (contribution.id === TILE_MAIN_OBSERVER_ID) primaryGapArea += area;
      else otherGapArea += area;
      continue;
    }
    const reduction = Math.max(0, current - Math.max(next, target));
    if (reduction === 0) continue;
    priority = Math.max(priority, MESH_CAMERA_PHASE_PRIORITY.REFINEMENT);
    benefit = Math.min(Number.MAX_VALUE, benefit + reduction * area);
    errorBand = Math.max(
      errorBand,
      Math.ceil(
        Number.isFinite(current / target)
          ? Math.log2(current / target)
          : Math.log2(current) - Math.log2(target)
      )
    );
  }
  return {
    priority,
    benefit:
      primaryGapArea > 0
        ? primaryGapArea
        : otherGapArea > 0
        ? otherGapArea
        : benefit,
    currentErrorPixels,
    nextErrorPixels,
    visibleAreaFraction,
    errorBand: primaryGapArea > 0 || otherGapArea > 0 ? 0 : errorBand,
  };
};
