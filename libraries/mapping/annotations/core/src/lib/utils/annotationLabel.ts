import type {
  AnnotationLabelAnchor,
  AnnotationLabelAppearance,
  PointLabelMetricMode,
} from "../types/annotationLabel";
import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  POINT_LABEL_METRIC_MODES,
} from "../types/annotationLabel";

const normalizeCompactLabelContent = (
  compactContent?: string
): string | undefined => {
  if (!compactContent) return undefined;
  const normalized = compactContent.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeCssColor = (value?: string): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const normalizeLabelAnchor = (
  labelAnchor?: AnnotationLabelAnchor
): AnnotationLabelAnchor | undefined => {
  if (!labelAnchor) return undefined;
  const anchorPointId = labelAnchor.anchorPointId?.trim();
  if (!anchorPointId) return undefined;

  return {
    anchorPointId,
    collapseToCompact: Boolean(labelAnchor.collapseToCompact),
    compactContent: normalizeCompactLabelContent(labelAnchor.compactContent),
  };
};

export const normalizeLabelAppearance = (
  labelAppearance?: AnnotationLabelAppearance
): AnnotationLabelAppearance | undefined => {
  if (!labelAppearance) return undefined;

  const parsedFontSizePx = Number.isFinite(labelAppearance.fontSizePx)
    ? Number(labelAppearance.fontSizePx)
    : undefined;
  const normalizedFontSizePx =
    parsedFontSizePx !== undefined
      ? Math.min(48, Math.max(10, Math.round(parsedFontSizePx)))
      : undefined;
  const normalizedBackgroundColor = normalizeCssColor(
    labelAppearance.backgroundColor
  );
  const normalizedTextColor = normalizeCssColor(labelAppearance.textColor);

  if (
    normalizedFontSizePx === undefined &&
    !normalizedBackgroundColor &&
    !normalizedTextColor
  ) {
    return undefined;
  }

  return {
    ...(normalizedFontSizePx !== undefined
      ? { fontSizePx: normalizedFontSizePx }
      : {}),
    ...(normalizedBackgroundColor
      ? { backgroundColor: normalizedBackgroundColor }
      : {}),
    ...(normalizedTextColor ? { textColor: normalizedTextColor } : {}),
  };
};

export const getNextPointLabelMetricMode = (
  currentMode: PointLabelMetricMode = DEFAULT_POINT_LABEL_METRIC_MODE
): PointLabelMetricMode => {
  const currentIndex = POINT_LABEL_METRIC_MODES.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % POINT_LABEL_METRIC_MODES.length;
  return POINT_LABEL_METRIC_MODES[nextIndex];
};

const areLabelAnchorsEqual = (
  left?: AnnotationLabelAnchor,
  right?: AnnotationLabelAnchor
): boolean => {
  const normalizedLeft = normalizeLabelAnchor(left);
  const normalizedRight = normalizeLabelAnchor(right);
  if (!normalizedLeft && !normalizedRight) return true;
  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft.anchorPointId === normalizedRight.anchorPointId &&
    normalizedLeft.collapseToCompact === normalizedRight.collapseToCompact &&
    normalizedLeft.compactContent === normalizedRight.compactContent
  );
};

type PointLabelMeasurementLike = {
  id: string;
  labelAnchor?: AnnotationLabelAnchor;
};

type PointMeasurementWithAltitudeLike = {
  id: string;
  geometryWGS84: {
    altitude: number;
  };
};

type DistanceRelationLike = {
  pointAId?: string;
  pointBId?: string;
  polygonGroupId?: string;
};

type PolylineLabelLike = {
  id: string;
  nodeIds: ReadonlyArray<string>;
  totalLengthMeters: number;
};

type PointMarkerBadgeLike = {
  text?: string;
};

type BuildStandaloneDistancePointSetsParams<
  TPointMeasurement extends PointMeasurementWithAltitudeLike,
  TDistanceRelation extends DistanceRelationLike
> = {
  pointMeasurements: ReadonlyArray<TPointMeasurement>;
  distanceRelations: ReadonlyArray<TDistanceRelation>;
  selectedPointIds: ReadonlySet<string>;
};

export const buildStandaloneDistancePointSets = <
  TPointMeasurement extends PointMeasurementWithAltitudeLike,
  TDistanceRelation extends DistanceRelationLike
>({
  pointMeasurements,
  distanceRelations,
  selectedPointIds,
}: BuildStandaloneDistancePointSetsParams<
  TPointMeasurement,
  TDistanceRelation
>): {
  highestPointIds: Set<string>;
  unfocusedNonHighestPointIds: Set<string>;
  focusedNonHighestPointIds: Set<string>;
} => {
  const highestPointIds = new Set<string>();
  const unfocusedNonHighestPointIds = new Set<string>();
  const focusedNonHighestPointIds = new Set<string>();

  const standaloneDistanceRelations = distanceRelations.filter(
    (relation) => !relation.polygonGroupId
  );
  if (standaloneDistanceRelations.length === 0) {
    return {
      highestPointIds,
      unfocusedNonHighestPointIds,
      focusedNonHighestPointIds,
    };
  }

  const pointById = new Map(
    pointMeasurements.map(
      (measurement) => [measurement.id, measurement] as const
    )
  );
  const neighborsByPointId = new Map<string, Set<string>>();

  standaloneDistanceRelations.forEach((relation) => {
    const pointAId = relation.pointAId;
    const pointBId = relation.pointBId;
    if (!pointAId || !pointBId) return;

    if (!neighborsByPointId.has(pointAId)) {
      neighborsByPointId.set(pointAId, new Set());
    }
    if (!neighborsByPointId.has(pointBId)) {
      neighborsByPointId.set(pointBId, new Set());
    }
    neighborsByPointId.get(pointAId)?.add(pointBId);
    neighborsByPointId.get(pointBId)?.add(pointAId);
  });

  const getHighestPointId = (pointIds: string[]): string | null => {
    let highestId: string | null = null;
    let fallbackId: string | null = null;
    let highestHeight = -Infinity;

    for (const id of pointIds) {
      const point = pointById.get(id);
      if (!point) continue;
      fallbackId ??= id;

      const height = point.geometryWGS84.altitude;
      if (Number.isFinite(height) && height > highestHeight) {
        highestHeight = height;
        highestId = id;
      }
    }

    return highestId ?? fallbackId;
  };

  const visitedPointIds = new Set<string>();
  const sortedStartPointIds = Array.from(neighborsByPointId.keys()).sort(
    (left, right) => left.localeCompare(right)
  );

  sortedStartPointIds.forEach((startPointId) => {
    if (visitedPointIds.has(startPointId)) return;

    const queue = [startPointId];
    const componentPointIds: string[] = [];
    visitedPointIds.add(startPointId);

    while (queue.length > 0) {
      const currentPointId = queue.shift();
      if (!currentPointId) continue;
      componentPointIds.push(currentPointId);
      neighborsByPointId.get(currentPointId)?.forEach((neighborPointId) => {
        if (visitedPointIds.has(neighborPointId)) return;
        visitedPointIds.add(neighborPointId);
        queue.push(neighborPointId);
      });
    }

    if (componentPointIds.length === 0) return;
    const isSelectedComponent = componentPointIds.some((pointId) =>
      selectedPointIds.has(pointId)
    );

    const highestPointId = getHighestPointId(componentPointIds);
    if (!highestPointId) return;

    highestPointIds.add(highestPointId);
    const nonHighestIds = isSelectedComponent
      ? focusedNonHighestPointIds
      : unfocusedNonHighestPointIds;
    componentPointIds.forEach((pointId) => {
      if (pointId !== highestPointId) {
        nonHighestIds.add(pointId);
      }
    });
  });

  return {
    highestPointIds,
    unfocusedNonHighestPointIds,
    focusedNonHighestPointIds,
  };
};

type BuildDesiredPointLabelAnchorByIdParams<
  TPointMeasurement extends PointLabelMeasurementLike,
  TNodeChain extends { id: string; nodeIds: ReadonlyArray<string> },
  TPolyline extends PolylineLabelLike
> = {
  pointMeasurements: ReadonlyArray<TPointMeasurement>;
  nodeChains: ReadonlyArray<TNodeChain>;
  polylines: ReadonlyArray<TPolyline>;
  focusedNodeChainAnnotationId: string | null;
  pointMarkerBadgeByPointId: Readonly<Record<string, PointMarkerBadgeLike>>;
  standaloneDistanceHighestPointIds: ReadonlySet<string>;
  unfocusedStandaloneDistanceNonHighestPointIds: ReadonlySet<string>;
  focusedStandaloneDistanceNonHighestPointIds: ReadonlySet<string>;
  formatDistanceLabel: (distanceMeters: number) => string;
};

export const buildDesiredPointLabelAnchorById = <
  TPointMeasurement extends PointLabelMeasurementLike,
  TNodeChain extends { id: string; nodeIds: ReadonlyArray<string> },
  TPolyline extends PolylineLabelLike
>({
  pointMeasurements,
  nodeChains,
  polylines,
  focusedNodeChainAnnotationId,
  pointMarkerBadgeByPointId,
  standaloneDistanceHighestPointIds,
  unfocusedStandaloneDistanceNonHighestPointIds,
  focusedStandaloneDistanceNonHighestPointIds,
  formatDistanceLabel,
}: BuildDesiredPointLabelAnchorByIdParams<
  TPointMeasurement,
  TNodeChain,
  TPolyline
>): Readonly<Record<string, AnnotationLabelAnchor | undefined>> => {
  const byPointId: Record<string, AnnotationLabelAnchor | undefined> = {};
  pointMeasurements.forEach((measurement) => {
    byPointId[measurement.id] = {
      anchorPointId: measurement.id,
      collapseToCompact: false,
    };
  });

  const standaloneDistancePointIds = new Set<string>();
  standaloneDistanceHighestPointIds.forEach((pointId) => {
    standaloneDistancePointIds.add(pointId);
  });
  unfocusedStandaloneDistanceNonHighestPointIds.forEach((pointId) => {
    standaloneDistancePointIds.add(pointId);
  });
  focusedStandaloneDistanceNonHighestPointIds.forEach((pointId) => {
    standaloneDistancePointIds.add(pointId);
  });

  standaloneDistancePointIds.forEach((pointId) => {
    byPointId[pointId] = undefined;
  });
  standaloneDistanceHighestPointIds.forEach((pointId) => {
    const compactContent = normalizeCompactLabelContent(
      pointMarkerBadgeByPointId[pointId]?.text
    );
    byPointId[pointId] = {
      anchorPointId: pointId,
      collapseToCompact: true,
      ...(compactContent ? { compactContent } : {}),
    };
  });

  nodeChains.forEach((nodeChain) => {
    if (nodeChain.id === focusedNodeChainAnnotationId) {
      return;
    }

    nodeChain.nodeIds.forEach((pointId) => {
      if (!pointId) return;
      byPointId[pointId] = undefined;
    });
  });

  polylines.forEach((polyline) => {
    if (polyline.id === focusedNodeChainAnnotationId) {
      return;
    }

    const firstPointId = polyline.nodeIds[0] ?? null;
    const lastPointId = polyline.nodeIds[polyline.nodeIds.length - 1] ?? null;
    const badgeToken = normalizeCompactLabelContent(
      (firstPointId
        ? pointMarkerBadgeByPointId[firstPointId]?.text
        : undefined) ??
        (lastPointId ? pointMarkerBadgeByPointId[lastPointId]?.text : undefined)
    );

    if (firstPointId && badgeToken) {
      byPointId[firstPointId] = {
        anchorPointId: firstPointId,
        collapseToCompact: true,
        compactContent: badgeToken,
      };
    }

    if (lastPointId && lastPointId !== firstPointId) {
      byPointId[lastPointId] = {
        anchorPointId: lastPointId,
        collapseToCompact: true,
        compactContent: badgeToken
          ? `${badgeToken} ${formatDistanceLabel(polyline.totalLengthMeters)}m`
          : `${formatDistanceLabel(polyline.totalLengthMeters)}m`,
      };
    }
  });

  return byPointId;
};

type MeasurementWithLabelAnchor = {
  id: string;
  labelAnchor?: AnnotationLabelAnchor;
};

type ApplyDesiredPointLabelAnchorsParams<
  TMeasurement extends MeasurementWithLabelAnchor,
  TPointMeasurement extends TMeasurement
> = {
  annotations: ReadonlyArray<TMeasurement>;
  desiredLabelAnchorByPointId: Readonly<
    Record<string, AnnotationLabelAnchor | undefined>
  >;
  isPointMeasurement: (
    measurement: TMeasurement
  ) => measurement is TPointMeasurement;
};

export const applyDesiredPointLabelAnchors = <
  TMeasurement extends MeasurementWithLabelAnchor,
  TPointMeasurement extends TMeasurement
>({
  annotations,
  desiredLabelAnchorByPointId,
  isPointMeasurement,
}: ApplyDesiredPointLabelAnchorsParams<TMeasurement, TPointMeasurement>): {
  nextMeasurements: TMeasurement[];
  hasChanges: boolean;
} => {
  let hasChanges = false;
  const nextMeasurements = annotations.map((measurement) => {
    if (!isPointMeasurement(measurement)) {
      return measurement;
    }

    const desiredLabelAnchor = normalizeLabelAnchor(
      desiredLabelAnchorByPointId[measurement.id]
    );
    if (areLabelAnchorsEqual(measurement.labelAnchor, desiredLabelAnchor)) {
      return measurement;
    }

    hasChanges = true;
    return {
      ...measurement,
      labelAnchor: desiredLabelAnchor,
    };
  });

  return { nextMeasurements, hasChanges };
};

type PointMeasurementWithLabelAnchor = {
  id: string;
  labelAnchor?: AnnotationLabelAnchor;
};

export const collectCollapsedPillPointIds = <
  TPointMeasurement extends PointMeasurementWithLabelAnchor
>(
  pointMeasurements: ReadonlyArray<TPointMeasurement>
): Set<string> => {
  const ids = new Set<string>();
  pointMeasurements.forEach((measurement) => {
    const labelAnchor = normalizeLabelAnchor(measurement.labelAnchor);
    if (!labelAnchor) return;
    if (labelAnchor.anchorPointId !== measurement.id) return;
    if (!labelAnchor.collapseToCompact) return;
    ids.add(measurement.id);
  });
  return ids;
};

export const collectPointIdsWithoutSelfLabelAnchor = <
  TPointMeasurement extends PointMeasurementWithLabelAnchor
>(
  pointMeasurements: ReadonlyArray<TPointMeasurement>
): Set<string> => {
  const ids = new Set<string>();
  pointMeasurements.forEach((measurement) => {
    const labelAnchor = normalizeLabelAnchor(measurement.labelAnchor);
    if (!labelAnchor || labelAnchor.anchorPointId !== measurement.id) {
      ids.add(measurement.id);
    }
  });
  return ids;
};

export const collectLabelAnchorPointIdsWithForcedVisibility = <
  TPointMeasurement extends PointMeasurementWithLabelAnchor
>(
  pointMeasurements: ReadonlyArray<TPointMeasurement>,
  excludedAnchorPointIds: ReadonlySet<string>
): Set<string> => {
  const ids = new Set<string>();
  pointMeasurements.forEach((measurement) => {
    const labelAnchor = normalizeLabelAnchor(measurement.labelAnchor);
    if (!labelAnchor) return;
    if (excludedAnchorPointIds.has(labelAnchor.anchorPointId)) {
      return;
    }
    ids.add(labelAnchor.anchorPointId);
  });
  return ids;
};

type MeasurementWithLabelAppearance = {
  labelAppearance?: AnnotationLabelAppearance;
};

export const applyLabelAppearance = <
  TMeasurement extends MeasurementWithLabelAppearance
>(
  measurement: TMeasurement,
  appearance: AnnotationLabelAppearance | undefined
): TMeasurement => {
  if (!appearance) {
    const nextMeasurement = { ...measurement } as TMeasurement & {
      labelAppearance?: AnnotationLabelAppearance;
    };
    delete nextMeasurement.labelAppearance;
    return nextMeasurement as TMeasurement;
  }

  return {
    ...measurement,
    labelAppearance: appearance,
  };
};
