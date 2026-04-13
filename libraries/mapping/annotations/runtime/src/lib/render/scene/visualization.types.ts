import type {
  LineType,
  PointAnnotationEntry,
  PolygonPreviewGroup,
} from "@carma-mapping/annotations/core";
import type { Color } from "@carma-cesium";
export type EdgeSceneLineRenderModel = {
  id: string;
  start: PointAnnotationEntry["geometryECEF"];
  end: PointAnnotationEntry["geometryECEF"];
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  lineType?: LineType;
};

export type PolygonPrimitiveRenderModel = {
  id: string;
  vertexPoints: ReadonlyArray<PolygonPreviewGroup["vertexPoints"][number]>;
  fillColor: Color;
};
