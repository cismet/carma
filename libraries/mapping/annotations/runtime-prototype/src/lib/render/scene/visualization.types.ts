import type {
  PointAnnotationEntry,
  PolygonPreviewGroup,
} from "@carma-mapping/annotations/core";
import type { ArcType, Color } from "@carma-cesium";
export type EdgeSceneLineRenderModel = {
  id: string;
  start: PointAnnotationEntry["geometryECEF"];
  end: PointAnnotationEntry["geometryECEF"];
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  lineType?: ArcType;
};

export type PolygonPrimitiveRenderModel = {
  id: string;
  vertexPoints: ReadonlyArray<PolygonPreviewGroup["vertexPoints"][number]>;
  fillColor: Color;
};
