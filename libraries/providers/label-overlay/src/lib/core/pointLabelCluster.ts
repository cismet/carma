import type { CssPixelPosition } from "@carma-units";

import type { PointLabelAttach } from "./pointLabelAttach";
export type ClusterableScreenPoint<T> = {
  id: string;
  anchor: CssPixelPosition;
  collapseKey?: string | null;
  selected?: boolean;
  layoutPriority?: number;
  zIndex?: number;
  item: T;
};

export type ScreenPointCluster<T> = {
  id: string;
  anchor: CssPixelPosition;
  collapseKey: string | null;
  members: readonly ClusterableScreenPoint<T>[];
  representative: ClusterableScreenPoint<T>;
  stackCount: number;
};

export type ScreenPointClusterConfig = {
  collapseDistancePx: number;
  minimumClusterSize: number;
  selectedPreventsCollapse: boolean;
  anchorMode: "representative" | "average";
};

export type PointLabelClusterExpansionSlot = {
  id: string;
  offset: CssPixelPosition;
  attach: PointLabelAttach;
};

export type AssignPointLabelClusterExpansionSlotsResult<T> = {
  member: ClusterableScreenPoint<T>;
  slot: PointLabelClusterExpansionSlot;
};

export type PointLabelClusterExpansionConfig = {
  stepPx: number;
  slots?: readonly PointLabelClusterExpansionSlot[];
};

const DEFAULT_POINT_LABEL_CLUSTER_CONFIG: ScreenPointClusterConfig = {
  collapseDistancePx: 5,
  minimumClusterSize: 2,
  selectedPreventsCollapse: true,
  anchorMode: "representative",
};

const compareClusterMembers = <T>(
  left: ClusterableScreenPoint<T>,
  right: ClusterableScreenPoint<T>,
  leftIndex: number,
  rightIndex: number
): number => {
  if (left.selected !== right.selected) {
    return left.selected ? -1 : 1;
  }

  const priorityDelta =
    (right.layoutPriority ?? 0) - (left.layoutPriority ?? 0);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const zIndexDelta = (right.zIndex ?? 0) - (left.zIndex ?? 0);
  if (zIndexDelta !== 0) {
    return zIndexDelta;
  }

  return leftIndex - rightIndex;
};

const resolveClusterAnchor = <T>(
  members: readonly ClusterableScreenPoint<T>[],
  representative: ClusterableScreenPoint<T>,
  config: ScreenPointClusterConfig
): CssPixelPosition => {
  if (config.anchorMode === "representative") {
    return representative.anchor;
  }

  return averageCssPixelPositions(members.map((member) => member.anchor));
};

export const addCssPixelPositions = (
  anchor: CssPixelPosition,
  offset: CssPixelPosition
): CssPixelPosition =>
  ({
    x: anchor.x + offset.x,
    y: anchor.y + offset.y,
  } as CssPixelPosition);

export const averageCssPixelPositions = (
  anchors: readonly CssPixelPosition[]
): CssPixelPosition => {
  if (anchors.length === 0) {
    return {
      x: 0,
      y: 0,
    } as CssPixelPosition;
  }

  const totals = anchors.reduce(
    (accumulator, anchor) => ({
      x: accumulator.x + anchor.x,
      y: accumulator.y + anchor.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: totals.x / anchors.length,
    y: totals.y / anchors.length,
  } as CssPixelPosition;
};

const areAnchorsWithinDistance = (
  left: CssPixelPosition,
  right: CssPixelPosition,
  maxDistancePx: number
): boolean => Math.hypot(left.x - right.x, left.y - right.y) <= maxDistancePx;

const resolveAttachForOffset = (offset: CssPixelPosition): PointLabelAttach => {
  if (offset.x < 0) {
    return "right";
  }
  if (offset.x > 0) {
    return "left";
  }
  return "center";
};

const createExpansionSlot = (
  id: string,
  x: number,
  y: number,
  stepPx: number
): PointLabelClusterExpansionSlot => {
  const offset = {
    x: x * stepPx,
    y: y * stepPx,
  } as CssPixelPosition;

  return {
    id,
    offset,
    attach: resolveAttachForOffset(offset),
  };
};

const getOverflowExpansionSlot = (
  overflowIndex: number,
  stepPx: number
): PointLabelClusterExpansionSlot => {
  const column = 2 + Math.floor(overflowIndex / 3);
  const row = [-1, 0, 1][overflowIndex % 3];
  return createExpansionSlot(`overflow-${column}-${row}`, column, row, stepPx);
};

export const createDefaultPointLabelClusterExpansionSlots = (
  stepPx: number = 40
): PointLabelClusterExpansionSlot[] => [
  createExpansionSlot("top-right", 1, -1, stepPx),
  createExpansionSlot("top", 0, -1, stepPx),
  createExpansionSlot("top-left", -1, -1, stepPx),
  createExpansionSlot("right", 1, 0, stepPx),
  createExpansionSlot("center", 0, 0, stepPx),
  createExpansionSlot("left", -1, 0, stepPx),
  createExpansionSlot("bottom-right", 1, 1, stepPx),
  createExpansionSlot("bottom", 0, 1, stepPx),
  createExpansionSlot("bottom-left", -1, 1, stepPx),
  createExpansionSlot("right-far", 2, 0, stepPx),
];

export const getVolumeEquivalentPointClusterRadiusPx = (
  baseRadiusPx: number,
  clusteredPointCount: number
): number => {
  if (!Number.isFinite(baseRadiusPx) || baseRadiusPx <= 0) {
    return 0;
  }

  const resolvedClusteredPointCount =
    Number.isFinite(clusteredPointCount) && clusteredPointCount > 0
      ? clusteredPointCount
      : 1;

  return baseRadiusPx * Math.cbrt(resolvedClusteredPointCount);
};

export const getVolumeEquivalentPointClusterDiameterPx = (
  baseDiameterPx: number,
  clusteredPointCount: number
): number =>
  getVolumeEquivalentPointClusterRadiusPx(
    baseDiameterPx / 2,
    clusteredPointCount
  ) * 2;

export const assignPointLabelClusterExpansionSlots = <T>(
  members: readonly ClusterableScreenPoint<T>[],
  { stepPx = 40, slots }: Partial<PointLabelClusterExpansionConfig> = {}
): AssignPointLabelClusterExpansionSlotsResult<T>[] => {
  const resolvedSlots =
    slots && slots.length > 0
      ? [...slots]
      : createDefaultPointLabelClusterExpansionSlots(stepPx);

  return members.map((member, index) => ({
    member,
    slot:
      resolvedSlots[index] ??
      getOverflowExpansionSlot(index - resolvedSlots.length, stepPx),
  }));
};

export const clusterScreenSpaceLabelPoints = <T>(
  points: readonly ClusterableScreenPoint<T>[],
  overrides: Partial<ScreenPointClusterConfig> = {}
): ScreenPointCluster<T>[] => {
  const config = {
    ...DEFAULT_POINT_LABEL_CLUSTER_CONFIG,
    ...overrides,
  };

  const indexedPoints = points.map((point, index) => ({
    point,
    index,
  }));

  const clusterBuckets = new Map<string, typeof indexedPoints>();
  indexedPoints.forEach((entry) => {
    const key = entry.point.collapseKey?.trim();
    const bucketKey =
      key && key.length > 0 ? key : `__single__:${entry.point.id}`;
    const bucket = clusterBuckets.get(bucketKey) ?? [];
    bucket.push(entry);
    clusterBuckets.set(bucketKey, bucket);
  });

  const clusters: ScreenPointCluster<T>[] = [];
  clusterBuckets.forEach((bucketEntries, bucketKey) => {
    if (bucketKey.startsWith("__single__:")) {
      const only = bucketEntries[0];
      clusters.push({
        id: only.point.id,
        anchor: only.point.anchor,
        collapseKey: null,
        members: [only.point],
        representative: only.point,
        stackCount: 1,
      });
      return;
    }

    const visited = new Set<number>();
    bucketEntries.forEach((entry, entryIndex) => {
      if (visited.has(entryIndex)) {
        return;
      }

      const pending = [entryIndex];
      const componentIndices: number[] = [];
      while (pending.length > 0) {
        const currentIndex = pending.pop() as number;
        if (visited.has(currentIndex)) {
          continue;
        }
        visited.add(currentIndex);
        componentIndices.push(currentIndex);

        const current = bucketEntries[currentIndex];
        bucketEntries.forEach((candidate, candidateIndex) => {
          if (
            visited.has(candidateIndex) ||
            candidateIndex === currentIndex ||
            !areAnchorsWithinDistance(
              current.point.anchor,
              candidate.point.anchor,
              config.collapseDistancePx
            )
          ) {
            return;
          }

          pending.push(candidateIndex);
        });
      }

      const componentEntries = componentIndices.map(
        (index) => bucketEntries[index]
      );
      const members = componentEntries
        .sort((left, right) =>
          compareClusterMembers(
            left.point,
            right.point,
            left.index,
            right.index
          )
        )
        .map((componentEntry) => componentEntry.point);
      const representative = members[0];
      const shouldCollapse =
        members.length >= config.minimumClusterSize &&
        !(
          config.selectedPreventsCollapse &&
          members.some((member) => member.selected)
        );

      if (!shouldCollapse) {
        members.forEach((member) => {
          clusters.push({
            id: member.id,
            anchor: member.anchor,
            collapseKey: bucketKey,
            members: [member],
            representative: member,
            stackCount: 1,
          });
        });
        return;
      }

      clusters.push({
        id: `cluster:${bucketKey}:${members
          .map((member) => member.id)
          .join("|")}`,
        anchor: resolveClusterAnchor(members, representative, config),
        collapseKey: bucketKey,
        members,
        representative,
        stackCount: members.length,
      });
    });
  });

  return clusters.sort((left, right) => {
    const leftIndex = indexedPoints.findIndex(
      ({ point }) => point.id === left.representative.id
    );
    const rightIndex = indexedPoints.findIndex(
      ({ point }) => point.id === right.representative.id
    );
    return compareClusterMembers(
      left.representative,
      right.representative,
      leftIndex,
      rightIndex
    );
  });
};
