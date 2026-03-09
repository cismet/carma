import type { Cartesian3Json } from "@carma/cesium";

import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "./annotationLabel";
import type { PointDistanceRelation } from "./distanceRelation";
import type { PlanarPolygonGroup } from "./planarTypes";

export type AnnotationGeometryPoint = {
  id: string;
  longitude: number;
  latitude: number;
  height: number;
  geometryECEF: Cartesian3Json;
  hidden?: boolean;
  locked?: boolean;
  pointLabelMode?: PointLabelMetricMode;
  auxiliaryLabelAnchor?: boolean;
  verticalOffsetAnchorECEF?: Cartesian3Json;
  labelAnchor?: AnnotationLabelAnchor;
  labelAppearance?: AnnotationLabelAppearance;
};

export type AnnotationGeometryEdge = {
  id: string;
  pointAId: string;
  pointBId: string;
};

export type PlanarPolygonGroupVertex = {
  id: string;
  groupId: string;
  pointId: string;
  order: number;
};

export type AnnotationPersistenceEnvelopeV2Base<TMeasurementEntry> = {
  version: 2;
  geometry: {
    points: AnnotationGeometryPoint[];
    edges: AnnotationGeometryEdge[];
  };
  tables: {
    annotations: TMeasurementEntry[];
    distanceRelations: PointDistanceRelation[];
    planarPolygonGroups: PlanarPolygonGroup[];
    planarPolygonGroupVertices: PlanarPolygonGroupVertex[];
  };
};
