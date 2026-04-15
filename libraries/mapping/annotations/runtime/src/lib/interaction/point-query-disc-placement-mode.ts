export const POINT_QUERY_DISC_PLACEMENT_MODES = {
  TRUE_SAMPLE: "true-sample",
  CAMERA_PLANE_REPROJECT: "camera-plane-reproject",
} as const;

export type PointQueryDiscPlacementMode =
  (typeof POINT_QUERY_DISC_PLACEMENT_MODES)[keyof typeof POINT_QUERY_DISC_PLACEMENT_MODES];

export const isPointQueryDiscPlaneOffsetPlacementMode = (
  placementMode: PointQueryDiscPlacementMode | undefined
) => placementMode === POINT_QUERY_DISC_PLACEMENT_MODES.CAMERA_PLANE_REPROJECT;
