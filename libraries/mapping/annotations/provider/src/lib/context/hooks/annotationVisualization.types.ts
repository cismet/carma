import type {
  LineType,
  GroundPolygonPreviewGroup,
  PointAnnotationEntry,
  PolygonPreviewGroup,
} from "@carma-mapping/annotations/core";
import type { Color } from "@carma/cesium";

export type EdgeSceneLineRenderModel = {
  id: string;
  start: PointAnnotationEntry["geometryECEF"];
  end: PointAnnotationEntry["geometryECEF"];
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  lineType?: LineType;
};

export type EdgeCandidateLine = {
  anchorPointECEF: PointAnnotationEntry["geometryECEF"];
  targetPointECEF: PointAnnotationEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
  previewTotalDistanceMeters?: number;
} | null;

export type GroundPolygonPrimitiveRenderModel = {
  id: string;
  vertexPoints: ReadonlyArray<
    GroundPolygonPreviewGroup["vertexPoints"][number]
  >;
  fillColor: Color;
};

export type CoplanarPolygonPrimitiveRenderModel = {
  id: string;
  vertexPoints: ReadonlyArray<PolygonPreviewGroup["vertexPoints"][number]>;
  fillColor: Color;
};

export type TransientEdgeSegment = EdgeSceneLineRenderModel;
