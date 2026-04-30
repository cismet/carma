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
  blockLabelInteractions: boolean;
  activeMoveGizmoNodeId: string | null;
  isMoveGizmoDragging: boolean;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  onReferenceNodeClick?: (nodeId: string) => boolean;
};

type BuildVisualizerInputsArgs = BuildHostInteractionPointLabelsArgs &
  BuildHostInteractionPointMarkersArgs;

const isMeasurementSelected = (
  selectedAnnotationIdSet: ReadonlySet<string>,
  measurementId?: string
) => measurementId !== undefined && selectedAnnotationIdSet.has(measurementId);

const createNodeLongPressHandler = ({
  nodeId,
  measurementId,
  onNodeLongPress,
}: {
  nodeId?: string;
  measurementId?: string;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
}) =>
  onNodeLongPress && nodeId
    ? () => onNodeLongPress(nodeId, measurementId)
    : undefined;

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
          onLongPress:
            blockLabelInteractions &&
            pointLabel.allowLongPressWhenBlocked !== true
              ? undefined
              : pointLabel.onLongPress ??
                createNodeLongPressHandler({
                  nodeId: pointLabel.nodeId,
                  measurementId: pointLabel.measurementId,
                  onNodeLongPress,
                }),
          longPressDurationMs:
            pointLabel.longPressDurationMs ??
            visualizerInputDefaults.nodeLabelLongPressDurationMs,
        };
      });

  if (!showNodeInteractionTargets) {
    return normalizedPointLabels;
  }

  const interactionLabelsByKey = new Map<
    string,
    RuntimePointLabelRenderModel
  >();

  points.forEach((point) => {
    const nodeId = point.nodeId;
    const measurementId = point.measurementId;

    if (!nodeId) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(nodeId) ?? nodeId;
    if (previewNodeLinkId !== null && nodeLinkId === previewNodeLinkId) {
      return;
    }

    const nodeLongPressHandler = blockLabelInteractions
      ? undefined
      : createNodeLongPressHandler({
          nodeId,
          measurementId,
          onNodeLongPress,
        });
    const interactionPointLabel: RuntimePointLabelRenderModel = {
      id: `${point.id}-node-interaction`,
      measurementId,
      nodeId,
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
      allowLongPressWhenBlocked: false,
      onHoverChange: nodeInteractionHoverEnabled
        ? (hovered) => {
            onReferenceNodeHover?.(nodeId, hovered);
          }
        : undefined,
      onClick:
        activeMoveGizmoNodeId && !isMoveGizmoDragging && onReferenceNodeClick
          ? () => {
              onReferenceNodeClick?.(nodeId);
            }
          : previewSnapTargetsEnabled
          ? () => {
              onPreviewSnapTargetNodeClick?.(nodeId);
            }
          : measurementId && onMeasurementSelect
          ? () => {
              onMeasurementSelect(measurementId);
            }
          : undefined,
      onLongPress: nodeLongPressHandler,
      longPressDurationMs: visualizerInputDefaults.nodeLabelLongPressDurationMs,
    };
    const interactionPointLabelKey = nodeLongPressHandler
      ? point.id
      : nodeLinkId;

    const existingInteractionPointLabel =
      interactionLabelsByKey.get(interactionPointLabelKey) ?? null;
    if (!existingInteractionPointLabel) {
      interactionLabelsByKey.set(
        interactionPointLabelKey,
        interactionPointLabel
      );
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
      interactionLabelsByKey.set(
        interactionPointLabelKey,
        interactionPointLabel
      );
    }
  });

  return [...normalizedPointLabels, ...interactionLabelsByKey.values()];
};

export const buildHostInteractionPointMarkers = ({
  points,
  enableHostInteractionTargets,
  blockLabelInteractions,
  activeMoveGizmoNodeId,
  isMoveGizmoDragging,
  isInPreviewNodeLink,
  onNodeLongPress,
  onReferenceNodeClick,
}: BuildHostInteractionPointMarkersArgs): readonly RuntimePointMarkerRenderModel[] =>
  !enableHostInteractionTargets
    ? points.map((point) => ({
        ...point,
        onClick: undefined,
        onLongPress: undefined,
      }))
    : points.map((point) => {
        const referenceNodeInteractionEnabled = Boolean(
          activeMoveGizmoNodeId &&
            !isMoveGizmoDragging &&
            onReferenceNodeClick &&
            point.nodeId &&
            !isInPreviewNodeLink(point.nodeId)
        );
        const nodeLongPressHandler =
          blockLabelInteractions || isInPreviewNodeLink(point.nodeId)
            ? undefined
            : createNodeLongPressHandler({
                nodeId: point.nodeId,
                measurementId: point.measurementId,
                onNodeLongPress,
              });

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
          onLongPress: blockLabelInteractions
            ? undefined
            : point.onLongPress ?? nodeLongPressHandler,
          longPressDurationMs:
            point.longPressDurationMs ??
            visualizerInputDefaults.nodeLabelLongPressDurationMs,
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
    blockLabelInteractions: args.blockLabelInteractions,
    activeMoveGizmoNodeId: args.activeMoveGizmoNodeId,
    isMoveGizmoDragging: args.isMoveGizmoDragging,
    isInPreviewNodeLink: args.isInPreviewNodeLink,
    onNodeLongPress: args.onNodeLongPress,
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
