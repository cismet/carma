import { Cartesian3, getDegreesFromCartesian } from "@carma/cesium";
import {
  LINE_TYPE_CARTESIAN,
  REFERENCE_LINE_EPSILON_METERS,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  resolveDistanceRelation,
  type LineType,
  type PointAnnotationEntry,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type {
  EdgeCandidateLine,
  EdgeSceneLineRenderModel,
  TransientEdgeSegment,
} from "../annotationVisualization.types";

const DEFAULT_LINE_TYPE: LineType = LINE_TYPE_CARTESIAN;

const DEFAULT_EDGE_SCENE_LINE_STYLES = {
  direct: {
    stroke: "rgba(255, 255, 255, 1)",
    strokeWidth: 1,
    dashed: false,
    lineType: DEFAULT_LINE_TYPE,
  },
  vertical: {
    stroke: "rgba(111, 168, 255, 0.96)",
    strokeWidth: 1,
    dashed: false,
    lineType: DEFAULT_LINE_TYPE,
  },
  horizontal: {
    stroke: "rgba(188, 194, 102, 0.95)",
    strokeWidth: 1,
    dashed: false,
    lineType: DEFAULT_LINE_TYPE,
  },
} as const;

type EdgeSceneLineStyle =
  (typeof DEFAULT_EDGE_SCENE_LINE_STYLES)[keyof typeof DEFAULT_EDGE_SCENE_LINE_STYLES];

export type EdgeSceneLineStyleOverrides = {
  direct?: Partial<EdgeSceneLineStyle>;
  vertical?: Partial<EdgeSceneLineStyle>;
  horizontal?: Partial<EdgeSceneLineStyle>;
};

type BuildEdgeSceneLineRenderModelsParams = {
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  distanceRelations: readonly PointDistanceRelation[];
  candidateEdgeLine?: EdgeCandidateLine;
  transientEdges?: readonly TransientEdgeSegment[];
  styles?: EdgeSceneLineStyleOverrides;
};

const buildAuxiliaryPoint = (
  anchorPointECEF: Cartesian3,
  targetPointECEF: Cartesian3
) => {
  const anchorWGS84 = getDegreesFromCartesian(anchorPointECEF);
  const targetWGS84 = getDegreesFromCartesian(targetPointECEF);
  return Cartesian3.fromDegrees(
    anchorWGS84.longitude,
    anchorWGS84.latitude,
    targetWGS84.altitude ?? 0
  );
};

const applyStyle = (
  line: Omit<
    EdgeSceneLineRenderModel,
    "stroke" | "strokeWidth" | "dashed" | "lineType"
  >,
  style: EdgeSceneLineStyle
): EdgeSceneLineRenderModel => ({
  ...line,
  stroke: style.stroke,
  strokeWidth: style.strokeWidth,
  dashed: style.dashed,
  lineType: style.lineType,
});

export const buildEdgeSceneLineRenderModels = ({
  pointsById,
  distanceRelations,
  candidateEdgeLine = null,
  transientEdges = [],
  styles,
}: BuildEdgeSceneLineRenderModelsParams): EdgeSceneLineRenderModel[] => {
  const relationPointsById = new Map(pointsById);
  const resolvedStyles = {
    direct: {
      ...DEFAULT_EDGE_SCENE_LINE_STYLES.direct,
      ...(styles?.direct ?? {}),
    },
    vertical: {
      ...DEFAULT_EDGE_SCENE_LINE_STYLES.vertical,
      ...(styles?.vertical ?? {}),
    },
    horizontal: {
      ...DEFAULT_EDGE_SCENE_LINE_STYLES.horizontal,
      ...(styles?.horizontal ?? {}),
    },
  };

  const sceneLines: EdgeSceneLineRenderModel[] = [];

  distanceRelations
    .map((relation) => resolveDistanceRelation(relation, relationPointsById))
    .filter(Boolean)
    .forEach((resolvedRelation) => {
      const {
        relation,
        pointA,
        pointB,
        anchorPoint,
        targetPoint,
        auxiliaryPoint,
      } = resolvedRelation;

      if (relation.showDirectLine) {
        sceneLines.push(
          applyStyle(
            {
              id: `reference-line-${relation.id}`,
              start: pointA.geometryECEF,
              end: pointB.geometryECEF,
            },
            resolvedStyles.direct
          )
        );
      }

      if (
        isDistanceRelationVerticalLineVisible(relation) &&
        Cartesian3.distance(anchorPoint.geometryECEF, auxiliaryPoint) >
          REFERENCE_LINE_EPSILON_METERS
      ) {
        sceneLines.push(
          applyStyle(
            {
              id: `reference-vertical-line-${relation.id}`,
              start: anchorPoint.geometryECEF,
              end: auxiliaryPoint,
            },
            resolvedStyles.vertical
          )
        );
      }

      if (
        isDistanceRelationHorizontalLineVisible(relation) &&
        Cartesian3.distance(auxiliaryPoint, targetPoint.geometryECEF) >
          REFERENCE_LINE_EPSILON_METERS
      ) {
        sceneLines.push(
          applyStyle(
            {
              id: `reference-horizontal-line-${relation.id}`,
              start: auxiliaryPoint,
              end: targetPoint.geometryECEF,
            },
            resolvedStyles.horizontal
          )
        );
      }
    });

  if (
    candidateEdgeLine &&
    Cartesian3.distance(
      candidateEdgeLine.anchorPointECEF,
      candidateEdgeLine.targetPointECEF
    ) > REFERENCE_LINE_EPSILON_METERS
  ) {
    const auxiliaryPointECEF = buildAuxiliaryPoint(
      candidateEdgeLine.anchorPointECEF,
      candidateEdgeLine.targetPointECEF
    );

    if (candidateEdgeLine.showDirectLine) {
      sceneLines.push(
        applyStyle(
          {
            id: "reference-preview-direct",
            start: candidateEdgeLine.anchorPointECEF,
            end: candidateEdgeLine.targetPointECEF,
          },
          resolvedStyles.direct
        )
      );
    }

    if (
      candidateEdgeLine.showVerticalLine &&
      Cartesian3.distance(
        candidateEdgeLine.anchorPointECEF,
        auxiliaryPointECEF
      ) > REFERENCE_LINE_EPSILON_METERS
    ) {
      sceneLines.push(
        applyStyle(
          {
            id: "reference-preview-vertical",
            start: candidateEdgeLine.anchorPointECEF,
            end: auxiliaryPointECEF,
          },
          resolvedStyles.vertical
        )
      );
    }

    if (
      candidateEdgeLine.showHorizontalLine &&
      Cartesian3.distance(
        auxiliaryPointECEF,
        candidateEdgeLine.targetPointECEF
      ) > REFERENCE_LINE_EPSILON_METERS
    ) {
      sceneLines.push(
        applyStyle(
          {
            id: "reference-preview-horizontal",
            start: auxiliaryPointECEF,
            end: candidateEdgeLine.targetPointECEF,
          },
          resolvedStyles.horizontal
        )
      );
    }
  }

  transientEdges.forEach((edge) => {
    sceneLines.push({
      ...edge,
      lineType: edge.lineType ?? DEFAULT_LINE_TYPE,
    });
  });

  return sceneLines;
};
