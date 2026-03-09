export const ANNOTATION_LIVE_PREVIEW_TYPE_NONE = "none";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POINT = "point";
export const ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE = "distance";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE = "polyline";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND = "polygon-ground";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR = "polygon-planar";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL = "polygon-vertical";

export type AnnotationLivePreviewType =
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_NONE
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POINT
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;

export type AnnotationLivePreviewDescriptor = {
  type: AnnotationLivePreviewType;
  verticalOffsetMeters: number;
  verticalPolygonContext?: {
    groupId: string;
    firstVertexPointId: string;
  };
};
