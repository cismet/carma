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
  activeEditedNodeId: string | null;
  isMoveGizmoDragging: boolean;
  nodeLinkIdByNodeId: ReadonlyMap<string, string>;
  previewNodeLinkId: string | null;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeMeasurementsSelect?: (measurementIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
  enableHostInteractionTargets: boolean;
};

type BuildHostInteractionPointMarkersArgs = {
  points: readonly RuntimePointMarkerRenderModel[];
  enableHostInteractionTargets: boolean;
  showNodeInteractionTargets: boolean;
  nodeInteractionHoverEnabled: boolean;
  previewSnapTargetsEnabled: boolean;
  blockLabelInteractions: boolean;
  activeEditedNodeId: string | null;
  isMoveGizmoDragging: boolean;
  nodeLinkIdByNodeId: ReadonlyMap<string, string>;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeMeasurementsSelect?: (measurementIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
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

const buildMeasurementIdsByNodeLinkId = (
  points: readonly RuntimePointMarkerRenderModel[],
  nodeLinkIdByNodeId: ReadonlyMap<string, string>
) => {
  const measurementIdsByNodeLinkId = new Map<string, string[]>();

  points.forEach((point) => {
    if (!point.nodeId || !point.measurementId) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(point.nodeId) ?? point.nodeId;
    const measurementIds = measurementIdsByNodeLinkId.get(nodeLinkId) ?? [];
    if (!measurementIds.includes(point.measurementId)) {
      measurementIds.push(point.measurementId);
      measurementIdsByNodeLinkId.set(nodeLinkId, measurementIds);
    }
  });

  return measurementIdsByNodeLinkId;
};

export const buildHostInteractionPointLabels = ({
  pointLabels,
  points,
  selectedAnnotationIdSet,
  showNodeInteractionTargets,
  nodeInteractionHoverEnabled,
  previewSnapTargetsEnabled,
  blockLabelInteractions,
  activeEditedNodeId,
  isMoveGizmoDragging,
  nodeLinkIdByNodeId,
  previewNodeLinkId,
  isInPreviewNodeLink,
  onMeasurementSelect,
  onNodeMeasurementsSelect,
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
          activeEditedNodeId &&
            !isMoveGizmoDragging &&
            onReferenceNodeClick &&
            pointLabel.nodeId &&
            !isInPreviewNodeLink(pointLabel.nodeId)
        );
        const suppressLabelLongPress =
          blockLabelInteractions &&
          pointLabel.allowLongPressWhenBlocked !== true;

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
          onHoverChange: pointLabel.onHoverChange,
          onLongPress: suppressLabelLongPress
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

  const pointMarkerIdsHandledByVisibleLabels = new Set(
    normalizedPointLabels.flatMap((pointLabel) =>
      pointLabel.pointMarkerId &&
      pointLabel.hideLabelAndStem !== true &&
      pointLabel.hideMarker !== true
        ? [pointLabel.pointMarkerId]
        : []
    )
  );
  const interactionLabelsByKey = new Map<
    string,
    RuntimePointLabelRenderModel
  >();
  const measurementIdsByNodeLinkId = buildMeasurementIdsByNodeLinkId(
    points,
    nodeLinkIdByNodeId
  );

  points.forEach((point) => {
    const nodeId = point.nodeId;
    const measurementId = point.measurementId;

    if (!nodeId) {
      return;
    }
    if (!pointMarkerIdsHandledByVisibleLabels.has(point.id)) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(nodeId) ?? nodeId;
    const nodeMeasurementIds = measurementIdsByNodeLinkId.get(nodeLinkId) ?? [];
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
        (activeEditedNodeId !== null && !isMoveGizmoDragging) ||
          previewSnapTargetsEnabled
      ),
      allowLongPressWhenBlocked: false,
      onHoverChange: nodeInteractionHoverEnabled
        ? (hovered) => {
            onReferenceNodeHover?.(nodeId, hovered);
          }
        : undefined,
      onClick:
        activeEditedNodeId && !isMoveGizmoDragging && onReferenceNodeClick
          ? () => {
              onReferenceNodeClick?.(nodeId);
            }
          : previewSnapTargetsEnabled
          ? () => {
              onPreviewSnapTargetNodeClick?.(nodeId);
            }
          : nodeMeasurementIds.length > 0 && onNodeMeasurementsSelect
          ? () => {
              onNodeMeasurementsSelect(nodeMeasurementIds);
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
  showNodeInteractionTargets,
  nodeInteractionHoverEnabled,
  previewSnapTargetsEnabled,
  blockLabelInteractions,
  activeEditedNodeId,
  isMoveGizmoDragging,
  nodeLinkIdByNodeId,
  isInPreviewNodeLink,
  onMeasurementSelect,
  onNodeMeasurementsSelect,
  onNodeLongPress,
  onPreviewSnapTargetNodeClick,
  onReferenceNodeClick,
  onReferenceNodeHover,
}: BuildHostInteractionPointMarkersArgs): readonly RuntimePointMarkerRenderModel[] =>
  !enableHostInteractionTargets
    ? points.map((point) => ({
        ...point,
        onClick: undefined,
        onHoverChange: undefined,
        onLongPress: undefined,
      }))
    : (() => {
        const measurementIdsByNodeLinkId = buildMeasurementIdsByNodeLinkId(
          points,
          nodeLinkIdByNodeId
        );

        return points.map((point) => {
          const nodeId = point.nodeId;
          const measurementId = point.measurementId;
          const nodeLinkId = nodeId
            ? nodeLinkIdByNodeId.get(nodeId) ?? nodeId
            : null;
          const nodeMeasurementIds = nodeLinkId
            ? measurementIdsByNodeLinkId.get(nodeLinkId) ?? []
            : [];
          const referenceNodeInteractionEnabled = Boolean(
            activeEditedNodeId &&
              !isMoveGizmoDragging &&
              onReferenceNodeClick &&
              nodeId &&
              !isInPreviewNodeLink(nodeId)
          );
          const nodeClickHandler =
            referenceNodeInteractionEnabled && nodeId
              ? () => {
                  onReferenceNodeClick?.(nodeId);
                }
              : previewSnapTargetsEnabled && nodeId
              ? () => {
                  onPreviewSnapTargetNodeClick?.(nodeId);
                }
              : showNodeInteractionTargets &&
                nodeMeasurementIds.length > 0 &&
                onNodeMeasurementsSelect
              ? () => {
                  onNodeMeasurementsSelect(nodeMeasurementIds);
                }
              : measurementId && onMeasurementSelect
              ? () => {
                  onMeasurementSelect(measurementId);
                }
              : point.onClick;
          const nodeHoverHandler =
            nodeInteractionHoverEnabled &&
            nodeId &&
            !isInPreviewNodeLink(nodeId)
              ? (hovered: boolean) => {
                  onReferenceNodeHover?.(nodeId, hovered);
                }
              : point.onHoverChange;
          const suppressPointMarkerLongPress =
            previewSnapTargetsEnabled ||
            (blockLabelInteractions && activeEditedNodeId === null);
          const nodeLongPressHandler =
            suppressPointMarkerLongPress ||
            blockLabelInteractions ||
            isInPreviewNodeLink(nodeId)
              ? undefined
              : createNodeLongPressHandler({
                  nodeId,
                  measurementId,
                  onNodeLongPress,
                });

          return {
            ...point,
            onClick: nodeClickHandler,
            onHoverChange: nodeHoverHandler,
            onLongPress: suppressPointMarkerLongPress
              ? undefined
              : point.onLongPress ?? nodeLongPressHandler,
            longPressDurationMs:
              point.longPressDurationMs ??
              visualizerInputDefaults.nodeLabelLongPressDurationMs,
          };
        });
      })();

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
    showNodeInteractionTargets: args.showNodeInteractionTargets,
    nodeInteractionHoverEnabled: args.nodeInteractionHoverEnabled,
    previewSnapTargetsEnabled: args.previewSnapTargetsEnabled,
    blockLabelInteractions: args.blockLabelInteractions,
    activeEditedNodeId: args.activeEditedNodeId,
    isMoveGizmoDragging: args.isMoveGizmoDragging,
    nodeLinkIdByNodeId: args.nodeLinkIdByNodeId,
    isInPreviewNodeLink: args.isInPreviewNodeLink,
    onMeasurementSelect: args.onMeasurementSelect,
    onNodeMeasurementsSelect: args.onNodeMeasurementsSelect,
    onNodeLongPress: args.onNodeLongPress,
    onPreviewSnapTargetNodeClick: args.onPreviewSnapTargetNodeClick,
    onReferenceNodeClick: args.onReferenceNodeClick,
    onReferenceNodeHover: args.onReferenceNodeHover,
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
