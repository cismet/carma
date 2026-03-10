import { Cartesian3 } from "@carma/cesium";

import type {
  PlanarMeasurementGroup,
  PlanarPolygonGroup,
} from "../types/planarTypes";

export const POLYGON_PREVIEW_STROKE = "rgba(255, 255, 255, 0.65)";
export const POLYGON_PREVIEW_STROKE_WIDTH_PX = 1;

export type PointWithGeometryECEF = {
  geometryECEF: Cartesian3;
};

export type CandidateConnectionPreview = {
  anchorPointECEF: Cartesian3;
  targetPointECEF: Cartesian3;
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
};

export type PolygonPreviewGroup = {
  group: PlanarPolygonGroup;
  vertexPoints: Cartesian3[];
};

export type VerticalPreviewEdgeSegment = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
};

export type VerticalPreviewCornerMarker = {
  id: string;
  position: Cartesian3;
};

export type PolylinePreviewMeasurement = {
  id: string;
  vertexPoints: Cartesian3[];
};

export type PolygonPreviewGroupsBySurface = {
  groundPolygonPreviewGroups: PolygonPreviewGroup[];
  verticalPolygonPreviewGroups: PolygonPreviewGroup[];
  planarPolygonPreviewGroups: PolygonPreviewGroup[];
};

export type PolygonPreviewBuildParams = {
  planarPolygonGroups: PlanarMeasurementGroup[];
  pointsById: ReadonlyMap<string, PointWithGeometryECEF>;
  verticalRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
  activePlanarMeasurementId?: string | null;
  candidateConnection?: CandidateConnectionPreview | null;
};
