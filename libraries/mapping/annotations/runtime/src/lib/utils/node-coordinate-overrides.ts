import type {
  StoredAnnotation,
  CesiumGeographicCoordinate,
  AnnotationNode,
} from "../store";
import { areCoordinatesEqual } from "./coordinate-equality";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
  RuntimeEdgeRenderModel,
} from "../render/measurement-render-models";
import type { RuntimeVisualModels } from "../render/visual-models";

export type NodeCoordinateOverrides = Readonly<
  Record<string, CesiumGeographicCoordinate>
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

export const applyNodeCoordinateOverridesToVisualModels = (
  visualModels: RuntimeVisualModels,
  coordinateOverrides: NodeCoordinateOverrides
): RuntimeVisualModels => {
  if (!hasNodeCoordinateOverrides(coordinateOverrides)) {
    return visualModels;
  }

  const nextPoints = visualModels.points?.map((point) => {
    const draftCoordinate =
      point.nodeId !== undefined
        ? coordinateOverrides[point.nodeId]
        : undefined;

    return draftCoordinate
      ? {
          ...point,
          coordinate: draftCoordinate,
        }
      : point;
  });

  const nextPointLabels = visualModels.pointLabels?.map((pointLabel) => {
    const draftCoordinate =
      pointLabel.nodeId !== undefined
        ? coordinateOverrides[pointLabel.nodeId]
        : undefined;
    const nextCoordinateCandidates = pointLabel.coordinateCandidates?.map(
      (candidate) => {
        const candidateDraftCoordinate =
          candidate.nodeId !== undefined
            ? coordinateOverrides[candidate.nodeId]
            : undefined;

        return candidateDraftCoordinate
          ? {
              ...candidate,
              coordinate: candidateDraftCoordinate,
            }
          : candidate;
      }
    );
    const coordinateCandidatesChanged =
      nextCoordinateCandidates?.some(
        (candidate, index) =>
          candidate !== pointLabel.coordinateCandidates?.[index]
      ) ?? false;
    const nextCoordinate =
      draftCoordinate ??
      (coordinateCandidatesChanged && nextCoordinateCandidates?.length === 1
        ? nextCoordinateCandidates[0]?.coordinate ?? pointLabel.coordinate
        : pointLabel.coordinate);

    return draftCoordinate || coordinateCandidatesChanged
      ? {
          ...pointLabel,
          coordinate: nextCoordinate,
          ...(nextCoordinateCandidates
            ? {
                coordinateCandidates: nextCoordinateCandidates,
              }
            : {}),
        }
      : pointLabel;
  });

  return {
    points: nextPoints,
    edges: visualModels.edges,
    polygonFills: visualModels.polygonFills,
    pointLabels: nextPointLabels,
  };
};

const collectAffectedMeasurementIdSet = ({
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

const mergeAffectedRuntimeRenderModels = <TRenderModel extends { id: string }>({
  baseModels,
  previewModels,
  isAffected,
}: {
  baseModels: readonly TRenderModel[] | undefined;
  previewModels: readonly TRenderModel[] | undefined;
  isAffected: (renderModel: TRenderModel) => boolean;
}): readonly TRenderModel[] | undefined => {
  if (!baseModels && !previewModels) {
    return undefined;
  }

  const resolvedBaseModels = baseModels ?? [];
  const resolvedPreviewModels = previewModels ?? [];
  const previewModelById = new Map(
    resolvedPreviewModels
      .filter(isAffected)
      .map((renderModel) => [renderModel.id, renderModel] as const)
  );
  const baseModelIdSet = new Set(
    resolvedBaseModels.map((renderModel) => renderModel.id)
  );
  const mergedModels = resolvedBaseModels.flatMap((renderModel) => {
    if (!isAffected(renderModel)) {
      return [renderModel];
    }

    const previewModel = previewModelById.get(renderModel.id);
    return previewModel ? [previewModel] : [];
  });

  resolvedPreviewModels.forEach((renderModel) => {
    if (!isAffected(renderModel) || baseModelIdSet.has(renderModel.id)) {
      return;
    }

    mergedModels.push(renderModel);
  });

  return mergedModels;
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
  affectedMeasurementIdSet,
  movedNodeIdSet,
}: {
  point: RuntimePointMarkerRenderModel;
  affectedMeasurementIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof point.measurementId === "string" &&
    affectedMeasurementIdSet.has(point.measurementId)) ||
  (typeof point.nodeId === "string" && movedNodeIdSet.has(point.nodeId));

const isAffectedEdgeRenderModel = ({
  edge,
  affectedMeasurementIdSet,
  movedNodeIdSet,
}: {
  edge: RuntimeEdgeRenderModel;
  affectedMeasurementIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof edge.measurementId === "string" &&
    affectedMeasurementIdSet.has(edge.measurementId)) ||
  Boolean(edge.nodeIds?.some((nodeId) => movedNodeIdSet.has(nodeId)));

const isAffectedPolygonFillRenderModel = ({
  polygonFill,
  affectedMeasurementIdSet,
  movedNodeIdSet,
}: {
  polygonFill: RuntimePolygonFillRenderModel;
  affectedMeasurementIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof polygonFill.measurementId === "string" &&
    affectedMeasurementIdSet.has(polygonFill.measurementId)) ||
  Boolean(polygonFill.nodeIds?.some((nodeId) => movedNodeIdSet.has(nodeId)));

const isAffectedPointLabelRenderModel = ({
  pointLabel,
  affectedMeasurementIdSet,
  movedNodeIdSet,
}: {
  pointLabel: RuntimePointLabelRenderModel;
  affectedMeasurementIdSet: ReadonlySet<string>;
  movedNodeIdSet: ReadonlySet<string>;
}) =>
  (typeof pointLabel.measurementId === "string" &&
    affectedMeasurementIdSet.has(pointLabel.measurementId)) ||
  (typeof pointLabel.nodeId === "string" &&
    movedNodeIdSet.has(pointLabel.nodeId)) ||
  Boolean(
    pointLabel.coordinateCandidates?.some(
      (coordinateCandidate) =>
        typeof coordinateCandidate.nodeId === "string" &&
        movedNodeIdSet.has(coordinateCandidate.nodeId)
    )
  );

export const mergeRuntimeVisualModelsForCoordinateOverlay = ({
  baseVisualModels,
  overlayVisualModels,
  annotationEntries,
  coordinateOverrides,
}: {
  baseVisualModels: RuntimeVisualModels;
  overlayVisualModels: RuntimeVisualModels;
  annotationEntries: readonly StoredAnnotation[];
  coordinateOverrides: NodeCoordinateOverrides;
}): RuntimeVisualModels => {
  if (!hasNodeCoordinateOverrides(coordinateOverrides)) {
    return baseVisualModels;
  }

  const movedNodeIdSet = new Set(Object.keys(coordinateOverrides));
  const affectedMeasurementIdSet = collectAffectedMeasurementIdSet({
    annotationEntries,
    coordinateOverrides,
  });

  return {
    points: mergeAffectedRuntimeRenderModels({
      baseModels: baseVisualModels.points,
      previewModels: overlayVisualModels.points,
      isAffected: (point) =>
        isAffectedPointMarkerRenderModel({
          point,
          affectedMeasurementIdSet,
          movedNodeIdSet,
        }),
    }),
    edges: mergeAffectedRuntimeRenderModels({
      baseModels: baseVisualModels.edges,
      previewModels: overlayVisualModels.edges,
      isAffected: (edge) =>
        isAffectedEdgeRenderModel({
          edge,
          affectedMeasurementIdSet,
          movedNodeIdSet,
        }),
    }),
    polygonFills: mergeAffectedRuntimeRenderModels({
      baseModels: baseVisualModels.polygonFills,
      previewModels: overlayVisualModels.polygonFills,
      isAffected: (polygonFill) =>
        isAffectedPolygonFillRenderModel({
          polygonFill,
          affectedMeasurementIdSet,
          movedNodeIdSet,
        }),
    }),
    pointLabels: mergeAffectedRuntimeRenderModels({
      baseModels: baseVisualModels.pointLabels,
      previewModels: overlayVisualModels.pointLabels,
      isAffected: (pointLabel) =>
        isAffectedPointLabelRenderModel({
          pointLabel,
          affectedMeasurementIdSet,
          movedNodeIdSet,
        }),
    }),
  };
};

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
  const affectedMeasurementIdSet = collectAffectedMeasurementIdSet({
    annotationEntries,
    coordinateOverrides,
  });
  const isAffectedPoint = (point: RuntimePointMarkerRenderModel) =>
    isAffectedPointMarkerRenderModel({
      point,
      affectedMeasurementIdSet,
      movedNodeIdSet,
    });
  const isAffectedEdge = (edge: RuntimeEdgeRenderModel) =>
    isAffectedEdgeRenderModel({
      edge,
      affectedMeasurementIdSet,
      movedNodeIdSet,
    });
  const isAffectedPolygonFill = (polygonFill: RuntimePolygonFillRenderModel) =>
    isAffectedPolygonFillRenderModel({
      polygonFill,
      affectedMeasurementIdSet,
      movedNodeIdSet,
    });
  const isAffectedPointLabel = (pointLabel: RuntimePointLabelRenderModel) =>
    isAffectedPointLabelRenderModel({
      pointLabel,
      affectedMeasurementIdSet,
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
