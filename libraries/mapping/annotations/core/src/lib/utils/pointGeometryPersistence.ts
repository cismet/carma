import type { Cartesian3Json } from "@carma/cesium";

import type { AnnotationGeometryPoint } from "../types/annotationPersistenceTypes";
import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "../types/annotationLabel";
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
  geometryECEF: Cartesian3Json;
  hidden?: boolean;
  locked?: boolean;
  pointLabelMode?: PointLabelMetricMode;
  auxiliaryLabelAnchor?: boolean;
  verticalOffsetAnchorECEF?: Cartesian3Json;
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
    },
    hidden: point.hidden,
    locked: point.locked,
    pointLabelMode: point.pointLabelMode,
    auxiliaryLabelAnchor: point.auxiliaryLabelAnchor,
    verticalOffsetAnchorECEF: point.verticalOffsetAnchorECEF,
    labelAnchor: normalizeLabelAnchor(point.labelAnchor),
    labelAppearance: normalizeLabelAppearance(point.labelAppearance),
  }));
