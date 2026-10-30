import type {
  StoredAnnotation,
  AnnotationGeographicCoordinate,
  AnnotationNode,
} from "../store";
import { areCoordinatesEqual } from "./coordinate-equality";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
  RuntimeEdgeRenderModel,
} from "../render/annotation-render-models";
import type { RuntimeVisualModels } from "../render/visual-models";

export type NodeCoordinateOverrides = Readonly<
  Record<string, AnnotationGeographicCoordinate>
>;

export const EMPTY_NODE_COORDINATE_OVERRIDES = {} as NodeCoordinateOverrides;

export const hasNodeCoordinateOverrides = (
  coordinateOverrides: NodeCoordinateOverrides
) => Object.keys(coordinateOverrides).length > 0;

export const areNodeCoordinateOverridesEqual = (
  left: NodeCoordinateOverrides,
  right: NodeCoordinateOverrides
) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftCoordinate = left[key];
    const rightCoordinate = right[key];

    return areCoordinatesEqual(leftCoordinate, rightCoordinate);
  });
};

export const applyNodeCoordinateOverridesToNodes = (
  nodes: readonly AnnotationNode[],
  coordinateOverrides: NodeCoordinateOverrides
) => {
  if (!hasNodeCoordinateOverrides(coordinateOverrides)) {
    return nodes;
  }

  return nodes.map((node) => {
    const draftCoordinate = coordinateOverrides[node.id];
    if (!draftCoordinate) {
      return node;
    }

    return {
      ...node,
      coordinate: draftCoordinate,
    };
  });
};

const collectAffectedAnnotationIdSet = ({
  annotationEntries,
  coordinateOverrides,
}: {
  annotationEntries: readonly StoredAnnotation[];
  coordinateOverrides: NodeCoordinateOverrides;
}) => {
  const movedNodeIdSet = new Set(Object.keys(coordinateOverrides));

  return new Set(
    annotationEntries.flatMap((annotationEntry) =>
      annotationEntry.nodeIds.some((nodeId) => movedNodeIdSet.has(nodeId))
        ? [annotationEntry.id]
        : []
    )
  );
};

const filterAffectedRuntimeRenderModels = <
  TRenderModel extends {
    id: string;
  }
>({
  models,
  isAffected,
  keepAffected,
}: {
  models: readonly TRenderModel[] | undefined;
  isAffected: (renderModel: TRenderModel) => boolean;
  keepAffected: boolean;
}): readonly TRenderModel[] | undefined => {
  if (!models) {
    return undefined;
  }

  const filteredModels = models.filter(
    (renderModel) => isAffected(renderModel) === keepAffected
  );

  return filteredModels.length > 0 ? filteredModels : undefined;
};

const isAffectedPointMarkerRenderModel = ({
  point,
  affectedAnnotationIdSet,
  movedNodeIdSet,
}: {
  point: RuntimePointMarkerRenderModel;
  affectedAnnotationIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof point.annotationId === "string" &&
    affectedAnnotationIdSet.has(point.annotationId)) ||
  (typeof point.nodeId === "string" && movedNodeIdSet.has(point.nodeId));

const isAffectedEdgeRenderModel = ({
  edge,
  affectedAnnotationIdSet,
  movedNodeIdSet,
}: {
  edge: RuntimeEdgeRenderModel;
  affectedAnnotationIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof edge.annotationId === "string" &&
    affectedAnnotationIdSet.has(edge.annotationId)) ||
  Boolean(edge.nodeIds?.some((nodeId) => movedNodeIdSet.has(nodeId)));

const isAffectedPolygonFillRenderModel = ({
  polygonFill,
  affectedAnnotationIdSet,
  movedNodeIdSet,
}: {
  polygonFill: RuntimePolygonFillRenderModel;
  affectedAnnotationIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof polygonFill.annotationId === "string" &&
    affectedAnnotationIdSet.has(polygonFill.annotationId)) ||
  Boolean(polygonFill.nodeIds?.some((nodeId) => movedNodeIdSet.has(nodeId)));

const isAffectedPointLabelRenderModel = ({
  pointLabel,
  affectedAnnotationIdSet,
  movedNodeIdSet,
}: {
  pointLabel: RuntimePointLabelRenderModel;
  affectedAnnotationIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof pointLabel.annotationId === "string" &&
    affectedAnnotationIdSet.has(pointLabel.annotationId)) ||
  (typeof pointLabel.nodeId === "string" &&
    movedNodeIdSet.has(pointLabel.nodeId)) ||
  Boolean(
    pointLabel.coordinateCandidates?.some(
      (coordinateCandidate) =>
        typeof coordinateCandidate.nodeId === "string" &&
        movedNodeIdSet.has(coordinateCandidate.nodeId)
    )
  );

export const splitRuntimeVisualModelsForCoordinateOverlay = ({
  baseVisualModels,
  overlayVisualModels,
  annotationEntries,
  coordinateOverrides,
}: {
  baseVisualModels: RuntimeVisualModels;
  overlayVisualModels: RuntimeVisualModels;
  annotationEntries: readonly StoredAnnotation[];
  coordinateOverrides: NodeCoordinateOverrides;
}): {
  baseVisualModels: RuntimeVisualModels;
  overlayVisualModels: RuntimeVisualModels | null;
} => {
  if (!hasNodeCoordinateOverrides(coordinateOverrides)) {
    return {
      baseVisualModels,
      overlayVisualModels: null,
    };
  }

  const movedNodeIdSet = new Set(Object.keys(coordinateOverrides));
  const affectedAnnotationIdSet = collectAffectedAnnotationIdSet({
    annotationEntries,
    coordinateOverrides,
  });
  const isAffectedPoint = (point: RuntimePointMarkerRenderModel) =>
    isAffectedPointMarkerRenderModel({
      point,
      affectedAnnotationIdSet,
      movedNodeIdSet,
    });
  const isAffectedEdge = (edge: RuntimeEdgeRenderModel) =>
    isAffectedEdgeRenderModel({
      edge,
      affectedAnnotationIdSet,
      movedNodeIdSet,
    });
  const isAffectedPolygonFill = (polygonFill: RuntimePolygonFillRenderModel) =>
    isAffectedPolygonFillRenderModel({
      polygonFill,
      affectedAnnotationIdSet,
      movedNodeIdSet,
    });
  const isAffectedPointLabel = (pointLabel: RuntimePointLabelRenderModel) =>
    isAffectedPointLabelRenderModel({
      pointLabel,
      affectedAnnotationIdSet,
      movedNodeIdSet,
    });

  const splitBaseVisualModels: RuntimeVisualModels = {
    points: filterAffectedRuntimeRenderModels({
      models: baseVisualModels.points,
      isAffected: isAffectedPoint,
      keepAffected: false,
    }),
    edges: filterAffectedRuntimeRenderModels({
      models: baseVisualModels.edges,
      isAffected: isAffectedEdge,
      keepAffected: false,
    }),
    polygonFills: filterAffectedRuntimeRenderModels({
      models: baseVisualModels.polygonFills,
      isAffected: isAffectedPolygonFill,
      keepAffected: false,
    }),
    pointLabels: filterAffectedRuntimeRenderModels({
      models: baseVisualModels.pointLabels,
      isAffected: isAffectedPointLabel,
      keepAffected: false,
    }),
  };
  const splitOverlayVisualModels: RuntimeVisualModels = {
    points: filterAffectedRuntimeRenderModels({
      models: overlayVisualModels.points,
      isAffected: isAffectedPoint,
      keepAffected: true,
    }),
    edges: filterAffectedRuntimeRenderModels({
      models: overlayVisualModels.edges,
      isAffected: isAffectedEdge,
      keepAffected: true,
    }),
    polygonFills: filterAffectedRuntimeRenderModels({
      models: overlayVisualModels.polygonFills,
      isAffected: isAffectedPolygonFill,
      keepAffected: true,
    }),
    pointLabels: filterAffectedRuntimeRenderModels({
      models: overlayVisualModels.pointLabels,
      isAffected: isAffectedPointLabel,
      keepAffected: true,
    }),
  };
  const hasOverlayVisualModels =
    Boolean(splitOverlayVisualModels.points?.length) ||
    Boolean(splitOverlayVisualModels.edges?.length) ||
    Boolean(splitOverlayVisualModels.polygonFills?.length) ||
    Boolean(splitOverlayVisualModels.pointLabels?.length);

  return {
    baseVisualModels: splitBaseVisualModels,
    overlayVisualModels: hasOverlayVisualModels
      ? splitOverlayVisualModels
      : null,
  };
};
