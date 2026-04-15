import {
  type CandidateConnectionPreview,
  REFERENCE_LINE_EPSILON_METERS,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  resolveDistanceRelation,
  type LineType,
  type PointAnnotationEntry,
  type PointDistanceRelation,
  LINE_TYPES,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import { getDegreesFromCartesian } from "@carma-mapping/engines/cesium/core";
import type { EdgeSceneLineRenderModel } from "../scene/visualization.types";
const { CARTESIAN: LINE_TYPE_CARTESIAN } = LINE_TYPES;

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
  previewEdges?: readonly EdgeSceneLineRenderModel[];
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
  previewEdges = [],
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

  previewEdges.forEach((edge) => {
    sceneLines.push({
      ...edge,
      lineType: edge.lineType ?? DEFAULT_LINE_TYPE,
    });
  });

  return sceneLines;
};

export const buildCandidatePreviewEdgeRenderModels = ({
  candidateConnection,
  styles,
}: {
  candidateConnection: CandidateConnectionPreview | null;
  styles?: EdgeSceneLineStyleOverrides;
}): EdgeSceneLineRenderModel[] => {
  if (!candidateConnection) {
    return [];
  }

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

  if (
    Cartesian3.distance(
      candidateConnection.anchorPointECEF,
      candidateConnection.targetPointECEF
    ) <= REFERENCE_LINE_EPSILON_METERS
  ) {
    return [];
  }

  const auxiliaryPointECEF = buildAuxiliaryPoint(
    candidateConnection.anchorPointECEF,
    candidateConnection.targetPointECEF
  );
  const previewLines: EdgeSceneLineRenderModel[] = [];

  if (candidateConnection.showDirectLine) {
    previewLines.push(
      applyStyle(
        {
          id: "reference-preview-direct",
          start: candidateConnection.anchorPointECEF,
          end: candidateConnection.targetPointECEF,
        },
        resolvedStyles.direct
      )
    );
  }

  if (
    candidateConnection.showVerticalLine &&
    Cartesian3.distance(
      candidateConnection.anchorPointECEF,
      auxiliaryPointECEF
    ) > REFERENCE_LINE_EPSILON_METERS
  ) {
    previewLines.push(
      applyStyle(
        {
          id: "reference-preview-vertical",
          start: candidateConnection.anchorPointECEF,
          end: auxiliaryPointECEF,
        },
        resolvedStyles.vertical
      )
    );
  }

  if (
    candidateConnection.showHorizontalLine &&
    Cartesian3.distance(
      auxiliaryPointECEF,
      candidateConnection.targetPointECEF
    ) > REFERENCE_LINE_EPSILON_METERS
  ) {
    previewLines.push(
      applyStyle(
        {
          id: "reference-preview-horizontal",
          start: auxiliaryPointECEF,
          end: candidateConnection.targetPointECEF,
        },
        resolvedStyles.horizontal
      )
    );
  }

  return previewLines;
};
