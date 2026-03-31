import { createElement, useEffect, useMemo, useRef } from "react";

import {
  createPlacement,
  computePointLabelLayout,
  getPerspectiveStemAngleMagnitude,
  PointLabel,
  POINT_LABEL_HOVER_BACKGROUND_COLOR,
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  POINT_LABEL_TEXT_BACKGROUND_COLOR,
  resolvePointLabelLayoutConfig,
  type LabelOverlayElement,
  type LayoutPointInput,
  type PointLabelAttach,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma/units/types";
const DEFAULT_PAIR_LABEL_ATTACH: PointLabelAttach = "left";
const DEFAULT_OVERLAY_ID_PREFIX = "distance-pair-label";
const LABEL_ATTACH_ORDER_WITH_POINT_LABEL: PointLabelAttach[] = [
  "left",
  "right",
  "center",
];
const LABEL_ATTACH_ORDER_NO_POINT_LABEL: PointLabelAttach[] = [
  "left",
  "right",
  "center",
];

const EMPTY_PAIR_LABEL_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
  collapsedToCompact: new Set<string>(),
};

const isNotNull = <T,>(value: T | null): value is T => value !== null;

export type DistanceLabelEntry = {
  relationId: string;
  anchorPointId: string;
  text: string;
  hasCompanionPointLabel: boolean;
};

export type DistanceLabelObstacleEntry = {
  id: string;
  anchorPointId: string;
  text: string;
  layoutPriority?: number;
};

export type UseDistanceLabelVisualizerOptions = {
  obstacles: DistanceLabelObstacleEntry[];
  cameraPitch: number;
  viewportWidth: number;
  viewportHeight: number;
  resolveAnchorCanvasPosition: (
    anchorPointId: string
  ) => CssPixelPosition | null;
  addLabelOverlayElement: (element: LabelOverlayElement) => void;
  removeLabelOverlayElement: (id: string) => void;
  overlayIdPrefix?: string;
  zIndex?: number;
};

export const useDistanceLabelVisualizer = (
  entries: DistanceLabelEntry[],
  {
    obstacles,
    cameraPitch,
    viewportWidth,
    viewportHeight,
    resolveAnchorCanvasPosition,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    overlayIdPrefix = DEFAULT_OVERLAY_ID_PREFIX,
    zIndex = 18,
  }: UseDistanceLabelVisualizerOptions
) => {
  const overlayIdsRef = useRef<string[]>([]);
  const pointLabelLayoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(),
    []
  );

  const attachOverrideByRelationId = useMemo(() => {
    const relationIdsByPointId = new Map<string, string[]>();

    entries.forEach(({ relationId, anchorPointId }) => {
      const existingRelationIds = relationIdsByPointId.get(anchorPointId) ?? [];
      relationIdsByPointId.set(anchorPointId, [
        ...existingRelationIds,
        relationId,
      ]);
    });

    return Array.from(relationIdsByPointId.entries()).reduce<
      Record<string, PointLabelAttach>
    >((accumulator, [pointId, relationIds]) => {
      const representativeEntry = entries.find(
        (entry) => entry.anchorPointId === pointId
      );
      const hasCompanionPointLabel = Boolean(
        representativeEntry?.hasCompanionPointLabel
      );
      const attachOrder = hasCompanionPointLabel
        ? LABEL_ATTACH_ORDER_WITH_POINT_LABEL
        : LABEL_ATTACH_ORDER_NO_POINT_LABEL;

      relationIds.forEach((relationId, index) => {
        if (!hasCompanionPointLabel && relationIds.length <= 1) {
          return;
        }
        const attach = attachOrder[index % attachOrder.length];
        if (!attach) return;
        accumulator[relationId] = attach;
      });

      return accumulator;
    }, {});
  }, [entries]);

  const layoutResult = useMemo(() => {
    const obstacleLayoutPoints: LayoutPointInput[] = obstacles
      .map((obstacle, index) => {
        const anchor = resolveAnchorCanvasPosition(obstacle.anchorPointId);
        if (!anchor) return null;
        return {
          id: obstacle.id,
          anchor,
          text: obstacle.text,
          index,
          layoutPriority: obstacle.layoutPriority ?? 1,
        };
      })
      .filter(isNotNull);

    const pairLayoutPoints: LayoutPointInput[] = entries
      .map((entry, index) => {
        const anchor = resolveAnchorCanvasPosition(entry.anchorPointId);
        if (!anchor) return null;
        return {
          id: entry.relationId,
          anchor,
          text: entry.text,
          index: obstacles.length + index,
          layoutPriority: 2,
        };
      })
      .filter(isNotNull);

    const layoutPoints: LayoutPointInput[] = [
      ...obstacleLayoutPoints,
      ...pairLayoutPoints,
    ];
    if (layoutPoints.length === 0) {
      return EMPTY_PAIR_LABEL_LAYOUT_RESULT;
    }

    return computePointLabelLayout({
      points: layoutPoints,
      viewportWidth: Math.max(1, viewportWidth),
      viewportHeight: Math.max(1, viewportHeight),
      cameraPitch,
      config: pointLabelLayoutConfig,
    });
  }, [
    cameraPitch,
    entries,
    obstacles,
    pointLabelLayoutConfig,
    resolveAnchorCanvasPosition,
    viewportHeight,
    viewportWidth,
  ]);

  useEffect(() => {
    overlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    overlayIdsRef.current = [];

    const nextOverlayIds: string[] = [];
    const cameraResponsiveAngleMagnitude = getPerspectiveStemAngleMagnitude(
      cameraPitch,
      pointLabelLayoutConfig
    );

    entries.forEach(({ relationId, anchorPointId, text }) => {
      const overlayId = `${overlayIdPrefix}-${relationId}`;
      const layoutPlacement = layoutResult.placements[relationId] ?? undefined;
      const attachOverride =
        attachOverrideByRelationId[relationId] ?? undefined;
      const placement = attachOverride
        ? createPlacement(
            attachOverride,
            layoutPlacement?.distance ?? pointLabelLayoutConfig.stemDistance,
            cameraResponsiveAngleMagnitude
          )
        : layoutPlacement;
      const isHiddenByLayout = attachOverride
        ? false
        : layoutResult.hiddenByLayout.has(relationId);

      addLabelOverlayElement({
        id: overlayId,
        zIndex,
        getCanvasPosition: () => resolveAnchorCanvasPosition(anchorPointId),
        content: createElement(PointLabel, {
          pointId: relationId,
          content: text,
          pitch: cameraPitch,
          labelAngleRad: placement?.angleRad,
          labelDistance: placement?.distance,
          labelAttach: placement?.attach ?? DEFAULT_PAIR_LABEL_ATTACH,
          hideMarker: true,
          hideLabelAndStem: false,
          fontSize: "11px",
          fontFamily: "Arial, sans-serif",
          textColor: "#111111",
          textBackgroundColor: POINT_LABEL_TEXT_BACKGROUND_COLOR,
          selectedBackgroundColor: POINT_LABEL_SELECTED_BACKGROUND_COLOR,
          hoverBackgroundColor: POINT_LABEL_HOVER_BACKGROUND_COLOR,
          fullBorder: true,
        }),
        visible: true,
        isHidden: isHiddenByLayout,
      });

      nextOverlayIds.push(overlayId);
    });

    overlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      overlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    attachOverrideByRelationId,
    cameraPitch,
    entries,
    layoutResult,
    overlayIdPrefix,
    pointLabelLayoutConfig,
    removeLabelOverlayElement,
    resolveAnchorCanvasPosition,
    zIndex,
  ]);
};
