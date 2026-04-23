import type { MetricVector3 } from "@carma-units";

import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "./annotation-label";
import type {
  DerivedNodeChainAnnotationGeometry,
  NodeChainAnnotation,
} from "./annotation-types";
import type { PointDistanceRelation } from "./distance-relation";
export type AnnotationGeometryPoint = {
  id: string;
  longitude: number;
  latitude: number;
  height: number;
  geometryECEF: MetricVector3;
  hidden?: boolean;
  locked?: boolean;
  pointLabelMode?: PointLabelMetricMode;
  auxiliaryLabelAnchor?: boolean;
  verticalOffsetAnchorECEF?: MetricVector3;
  labelAnchor?: AnnotationLabelAnchor;
  labelAppearance?: AnnotationLabelAppearance;
};

export type AnnotationGeometryEdge = {
  id: string;
  pointAId: string;
  pointBId: string;
};

export type PolygonAnnotationVertex = {
  id: string;
  groupId: string;
  pointId: string;
  order: number;
};

export type AnnotationPersistenceEnvelopeBase<TMeasurementEntry> = {
  version: 2;
  geometry: {
    points: AnnotationGeometryPoint[];
    edges: AnnotationGeometryEdge[];
  };
  tables: {
    annotations: TMeasurementEntry[];
    distanceRelations: PointDistanceRelation[];
    nodeChainAnnotations: Array<
      NodeChainAnnotation & Partial<DerivedNodeChainAnnotationGeometry>
    >;
    planarPolygonGroupVertices: PolygonAnnotationVertex[];
  };
};
