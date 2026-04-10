import type { Vector3 } from "@carma-units";

import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "../types/annotationLabel";
import type { AnnotationGeometryPoint } from "../types/annotationPersistenceTypes";
import {
  normalizeLabelAnchor,
  normalizeLabelAppearance,
} from "./annotationLabel";
type PointGeometryLike = {
  id: string;
  geometryWGS84: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
  geometryECEF: Vector3<number>;
  hidden?: boolean;
  locked?: boolean;
  pointLabelMode?: PointLabelMetricMode;
  auxiliaryLabelAnchor?: boolean;
  verticalOffsetAnchorECEF?: Vector3<number>;
  labelAnchor?: AnnotationLabelAnchor;
  labelAppearance?: AnnotationLabelAppearance;
};

export const buildPointGeometryRows = <TPoint extends PointGeometryLike>(
  points: ReadonlyArray<TPoint>
): AnnotationGeometryPoint[] =>
  points.map((point) => ({
    id: point.id,
    longitude: point.geometryWGS84.longitude,
    latitude: point.geometryWGS84.latitude,
    height: point.geometryWGS84.altitude,
    geometryECEF: {
      x: point.geometryECEF.x,
      y: point.geometryECEF.y,
      z: point.geometryECEF.z,
    } as AnnotationGeometryPoint["geometryECEF"],
    hidden: point.hidden,
    locked: point.locked,
    pointLabelMode: point.pointLabelMode,
    auxiliaryLabelAnchor: point.auxiliaryLabelAnchor,
    verticalOffsetAnchorECEF: point.verticalOffsetAnchorECEF
      ? ({
          x: point.verticalOffsetAnchorECEF.x,
          y: point.verticalOffsetAnchorECEF.y,
          z: point.verticalOffsetAnchorECEF.z,
        } as AnnotationGeometryPoint["verticalOffsetAnchorECEF"])
      : undefined,
    labelAnchor: normalizeLabelAnchor(point.labelAnchor),
    labelAppearance: normalizeLabelAppearance(point.labelAppearance),
  }));
