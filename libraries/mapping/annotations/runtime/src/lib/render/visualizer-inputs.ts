import { resolvePointLabelVisualDefaults } from "../config/runtime-point-label-visual-defaults";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "./measurement-render-models";

const visualizerInputDefaults = Object.freeze({
  nodeLabelLongPressDurationMs: 320,
});

type BuildHostInteractionPointLabelsArgs = {
  pointLabels: readonly RuntimePointLabelRenderModel[];
  points: readonly RuntimePointMarkerRenderModel[];
  selectedAnnotationIdSet: ReadonlySet<string>;
  showNodeInteractionTargets: boolean;
  nodeInteractionHoverEnabled: boolean;
  previewSnapTargetsEnabled: boolean;
  blockLabelInteractions: boolean;
  activeMoveGizmoNodeId: string | null;
  isMoveGizmoDragging: boolean;
  nodeLinkIdByNodeId: ReadonlyMap<string, string>;
  previewNodeLinkId: string | null;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
  enableHostInteractionTargets: boolean;
};

type BuildHostInteractionPointMarkersArgs = {
  points: readonly RuntimePointMarkerRenderModel[];
  enableHostInteractionTargets: boolean;
  activeMoveGizmoNodeId: string | null;
  isMoveGizmoDragging: boolean;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
};

type BuildVisualizerInputsArgs = BuildHostInteractionPointLabelsArgs &
  BuildHostInteractionPointMarkersArgs;

const isMeasurementSelected = (
  selectedAnnotationIdSet: ReadonlySet<string>,
  measurementId?: string
) => measurementId !== undefined && selectedAnnotationIdSet.has(measurementId);

const buildVisiblePointLabels = (
  pointLabels: readonly RuntimePointLabelRenderModel[]
) =>
  pointLabels
    .map(resolvePointLabelVisualDefaults)
    .filter(
      (pointLabel) =>
        !(
          pointLabel.hideLabelAndStem === true &&
          pointLabel.nodeId !== undefined
        )
    );

export const buildHostInteractionPointLabels = ({
  pointLabels,
  points,
  selectedAnnotationIdSet,
  showNodeInteractionTargets,
  nodeInteractionHoverEnabled,
  previewSnapTargetsEnabled,
  blockLabelInteractions,
  activeMoveGizmoNodeId,
  isMoveGizmoDragging,
  nodeLinkIdByNodeId,
  previewNodeLinkId,
  isInPreviewNodeLink,
  onMeasurementSelect,
  onNodeLongPress,
  onPreviewSnapTargetNodeClick,
  onReferenceNodeClick,
  onReferenceNodeHover,
  enableHostInteractionTargets,
}: BuildHostInteractionPointLabelsArgs): readonly RuntimePointLabelRenderModel[] => {
  const visiblePointLabels = buildVisiblePointLabels(pointLabels);

  const normalizedPointLabels = !enableHostInteractionTargets
    ? visiblePointLabels.map((pointLabel) => ({
        ...pointLabel,
        onClick: undefined,
        onDoubleClick: undefined,
        onHoverChange: undefined,
        onLongPress: undefined,
        allowClickWhenBlocked: false,
        allowLongPressWhenBlocked: false,
        longPressDurationMs:
          pointLabel.longPressDurationMs ??
          visualizerInputDefaults.nodeLabelLongPressDurationMs,
      }))
    : visiblePointLabels.map((pointLabel) => {
        const referenceNodeInteractionEnabled = Boolean(
          activeMoveGizmoNodeId &&
            !isMoveGizmoDragging &&
            onReferenceNodeClick &&
            pointLabel.nodeId &&
            !isInPreviewNodeLink(pointLabel.nodeId)
        );

        return {
          ...pointLabel,
          onClick:
            pointLabel.onClick || referenceNodeInteractionEnabled
              ? () => {
                  if (
                    referenceNodeInteractionEnabled &&
                    pointLabel.nodeId &&
                    onReferenceNodeClick?.(pointLabel.nodeId)
                  ) {
                    return;
                  }

                  pointLabel.onClick?.();
                }
              : undefined,
          allowClickWhenBlocked:
            pointLabel.allowClickWhenBlocked || referenceNodeInteractionEnabled,
          onLongPress: blockLabelInteractions
            ? undefined
            : pointLabel.onLongPress ??
              (onNodeLongPress && pointLabel.nodeId && pointLabel.measurementId
                ? () =>
                    onNodeLongPress(
                      pointLabel.nodeId!,
                      pointLabel.measurementId!
                    )
                : undefined),
          longPressDurationMs:
            pointLabel.longPressDurationMs ??
            visualizerInputDefaults.nodeLabelLongPressDurationMs,
        };
      });

  if (!showNodeInteractionTargets) {
    return normalizedPointLabels;
  }

  const interactionLabelsByNodeLinkId = new Map<
    string,
    RuntimePointLabelRenderModel
  >();

  points.forEach((point) => {
    if (!point.nodeId) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(point.nodeId) ?? point.nodeId;
    if (previewNodeLinkId !== null && nodeLinkId === previewNodeLinkId) {
      return;
    }

    const interactionPointLabel: RuntimePointLabelRenderModel = {
      id: `${point.id}-node-interaction`,
      measurementId: point.measurementId,
      nodeId: point.nodeId,
      pointMarkerId: point.id,
      coordinate: point.coordinate,
      markerPixelSize: point.pixelSize,
      content: "",
      hideLabelAndStem: true,
      hideMarker: true,
      markerOnlyPointerEvents: true,
      allowClickWhenBlocked: Boolean(
        (activeMoveGizmoNodeId !== null && !isMoveGizmoDragging) ||
          previewSnapTargetsEnabled
      ),
      allowLongPressWhenBlocked: true,
      onHoverChange: nodeInteractionHoverEnabled
        ? (hovered) => {
            onReferenceNodeHover?.(point.nodeId!, hovered);
          }
        : undefined,
      onClick:
        activeMoveGizmoNodeId &&
        !isMoveGizmoDragging &&
        point.nodeId &&
        onReferenceNodeClick
          ? () => {
              onReferenceNodeClick?.(point.nodeId!);
            }
          : previewSnapTargetsEnabled && point.nodeId
          ? () => {
              onPreviewSnapTargetNodeClick?.(point.nodeId!);
            }
          : point.measurementId && onMeasurementSelect
          ? () => {
              onMeasurementSelect(point.measurementId!);
            }
          : undefined,
      onLongPress: blockLabelInteractions
        ? undefined
        : onNodeLongPress
        ? () => onNodeLongPress(point.nodeId!, point.measurementId)
        : undefined,
      longPressDurationMs: visualizerInputDefaults.nodeLabelLongPressDurationMs,
    };

    const existingInteractionPointLabel =
      interactionLabelsByNodeLinkId.get(nodeLinkId) ?? null;
    if (!existingInteractionPointLabel) {
      interactionLabelsByNodeLinkId.set(nodeLinkId, interactionPointLabel);
      return;
    }

    const existingIsSelected = isMeasurementSelected(
      selectedAnnotationIdSet,
      existingInteractionPointLabel.measurementId
    );
    const nextIsSelected = isMeasurementSelected(
      selectedAnnotationIdSet,
      point.measurementId
    );

    if (!existingIsSelected && nextIsSelected) {
      interactionLabelsByNodeLinkId.set(nodeLinkId, interactionPointLabel);
    }
  });

  return [...normalizedPointLabels, ...interactionLabelsByNodeLinkId.values()];
};

export const buildHostInteractionPointMarkers = ({
  points,
  enableHostInteractionTargets,
  activeMoveGizmoNodeId,
  isMoveGizmoDragging,
  isInPreviewNodeLink,
  onReferenceNodeClick,
}: BuildHostInteractionPointMarkersArgs): readonly RuntimePointMarkerRenderModel[] =>
  !enableHostInteractionTargets
    ? points.map((point) => ({
        ...point,
        onClick: undefined,
      }))
    : points.map((point) => {
        const referenceNodeInteractionEnabled = Boolean(
          activeMoveGizmoNodeId &&
            !isMoveGizmoDragging &&
            onReferenceNodeClick &&
            point.nodeId &&
            !isInPreviewNodeLink(point.nodeId)
        );

        return {
          ...point,
          onClick:
            point.onClick || referenceNodeInteractionEnabled
              ? () => {
                  if (
                    referenceNodeInteractionEnabled &&
                    point.nodeId &&
                    onReferenceNodeClick?.(point.nodeId)
                  ) {
                    return;
                  }

                  point.onClick?.();
                }
              : undefined,
        };
      });

export const buildVisualizerInputs = ({
  points,
  ...args
}: BuildVisualizerInputsArgs) => {
  const pointLabels = buildHostInteractionPointLabels({
    ...args,
    points,
  });
  const normalizedPoints = buildHostInteractionPointMarkers({
    points,
    enableHostInteractionTargets: args.enableHostInteractionTargets,
    activeMoveGizmoNodeId: args.activeMoveGizmoNodeId,
    isMoveGizmoDragging: args.isMoveGizmoDragging,
    isInPreviewNodeLink: args.isInPreviewNodeLink,
    onReferenceNodeClick: args.onReferenceNodeClick,
  });
  const pointMarkerIdsHandledByLabels = new Set(
    pointLabels.flatMap((pointLabel) =>
      pointLabel.pointMarkerId &&
      pointLabel.hideLabelAndStem !== true &&
      pointLabel.hideMarker !== true
        ? [pointLabel.pointMarkerId]
        : []
    )
  );

  return {
    pointLabels,
    visibleStandalonePoints: normalizedPoints.filter(
      (point) => !pointMarkerIdsHandledByLabels.has(point.id)
    ),
  };
};
