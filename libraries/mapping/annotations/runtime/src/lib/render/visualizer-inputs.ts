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
  previewSnapTargetsEnabled: boolean;
  referenceNodeClickEnabled: boolean;
  referenceNodeHoverEnabled: boolean;
  nodeLinkIdByNodeId: ReadonlyMap<string, string>;
  previewNodeLinkId: string | null;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeMeasurementsSelect?: (measurementIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  canStartNodeEditing?: (nodeId: string, measurementId?: string) => boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
  enableHostInteractionTargets: boolean;
};

type BuildHostInteractionPointMarkersArgs = {
  points: readonly RuntimePointMarkerRenderModel[];
  enableHostInteractionTargets: boolean;
  previewSnapTargetsEnabled: boolean;
  referenceNodeClickEnabled: boolean;
  referenceNodeHoverEnabled: boolean;
  nodeLinkIdByNodeId: ReadonlyMap<string, string>;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeMeasurementsSelect?: (measurementIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  canStartNodeEditing?: (nodeId: string, measurementId?: string) => boolean;
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
  canStartNodeEditing,
}: {
  nodeId?: string;
  measurementId?: string;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  canStartNodeEditing?: (nodeId: string, measurementId?: string) => boolean;
}) =>
  onNodeLongPress &&
  nodeId &&
  (canStartNodeEditing?.(nodeId, measurementId) ?? true)
    ? () => onNodeLongPress(nodeId, measurementId)
    : undefined;

const canUseNodeEditingLongPress = ({
  nodeId,
  measurementId,
  canStartNodeEditing,
}: {
  nodeId?: string;
  measurementId?: string;
  canStartNodeEditing?: (nodeId: string, measurementId?: string) => boolean;
}) => !nodeId || (canStartNodeEditing?.(nodeId, measurementId) ?? true);

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
  previewSnapTargetsEnabled,
  referenceNodeClickEnabled,
  referenceNodeHoverEnabled,
  nodeLinkIdByNodeId,
  previewNodeLinkId,
  isInPreviewNodeLink,
  onMeasurementSelect,
  onNodeMeasurementsSelect,
  onNodeLongPress,
  canStartNodeEditing,
  onPreviewSnapTargetNodeClick,
  onReferenceNodeClick,
  onReferenceNodeHover,
  enableHostInteractionTargets,
}: BuildHostInteractionPointLabelsArgs): readonly RuntimePointLabelRenderModel[] => {
  const visiblePointLabels = buildVisiblePointLabels(pointLabels);
  const nodeInteractionHoverEnabled =
    enableHostInteractionTargets &&
    (referenceNodeHoverEnabled || previewSnapTargetsEnabled);

  const normalizedPointLabels = !enableHostInteractionTargets
    ? visiblePointLabels.map((pointLabel) => ({
        ...pointLabel,
        onClick: undefined,
        onDoubleClick: undefined,
        onHoverChange: undefined,
        onLongPress: undefined,
        longPressDurationMs:
          pointLabel.longPressDurationMs ??
          visualizerInputDefaults.nodeLabelLongPressDurationMs,
      }))
    : visiblePointLabels.map((pointLabel) => {
        const referenceNodeInteractionEnabled = Boolean(
          referenceNodeClickEnabled &&
            onReferenceNodeClick &&
            pointLabel.nodeId &&
            !isInPreviewNodeLink(pointLabel.nodeId)
        );
        const routePointerQueryThroughPointMarker =
          previewSnapTargetsEnabled && pointLabel.nodeId !== undefined;
        const nodeEditingLongPressAllowed = canUseNodeEditingLongPress({
          nodeId: pointLabel.nodeId,
          measurementId: pointLabel.measurementId,
          canStartNodeEditing,
        });

        return {
          ...pointLabel,
          onClick:
            !routePointerQueryThroughPointMarker &&
            (pointLabel.onClick || referenceNodeInteractionEnabled)
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
          onHoverChange: pointLabel.onHoverChange,
          onLongPress:
            referenceNodeInteractionEnabled ||
            routePointerQueryThroughPointMarker ||
            !nodeEditingLongPressAllowed
              ? undefined
              : pointLabel.onLongPress ??
                createNodeLongPressHandler({
                  nodeId: pointLabel.nodeId,
                  measurementId: pointLabel.measurementId,
                  onNodeLongPress,
                  canStartNodeEditing,
                }),
          longPressDurationMs:
            pointLabel.longPressDurationMs ??
            visualizerInputDefaults.nodeLabelLongPressDurationMs,
        };
      });

  const nodeInteractionTargetsRequired = Boolean(
    enableHostInteractionTargets &&
      (nodeInteractionHoverEnabled ||
        previewSnapTargetsEnabled ||
        referenceNodeClickEnabled ||
        onMeasurementSelect ||
        onNodeMeasurementsSelect ||
        onNodeLongPress)
  );

  if (!nodeInteractionTargetsRequired) {
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

    const referenceNodeInteractionEnabled = Boolean(
      referenceNodeClickEnabled &&
        onReferenceNodeClick &&
        !isInPreviewNodeLink(nodeId)
    );
    const nodeLongPressHandler =
      referenceNodeInteractionEnabled || previewSnapTargetsEnabled
        ? undefined
        : createNodeLongPressHandler({
            nodeId,
            measurementId,
            onNodeLongPress,
            canStartNodeEditing,
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
      onHoverChange: nodeInteractionHoverEnabled
        ? (hovered) => {
            onReferenceNodeHover?.(nodeId, hovered);
          }
        : undefined,
      onClick: referenceNodeInteractionEnabled
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
  previewSnapTargetsEnabled,
  referenceNodeClickEnabled,
  referenceNodeHoverEnabled,
  nodeLinkIdByNodeId,
  isInPreviewNodeLink,
  onMeasurementSelect,
  onNodeMeasurementsSelect,
  onNodeLongPress,
  canStartNodeEditing,
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
        const nodeInteractionHoverEnabled =
          referenceNodeHoverEnabled || previewSnapTargetsEnabled;
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
            referenceNodeClickEnabled &&
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
              : nodeMeasurementIds.length > 0 && onNodeMeasurementsSelect
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
            referenceNodeInteractionEnabled ||
            isInPreviewNodeLink(nodeId) ||
            !canUseNodeEditingLongPress({
              nodeId,
              measurementId,
              canStartNodeEditing,
            });
          const nodeLongPressHandler = suppressPointMarkerLongPress
            ? undefined
            : createNodeLongPressHandler({
                nodeId,
                measurementId,
                onNodeLongPress,
                canStartNodeEditing,
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
    previewSnapTargetsEnabled: args.previewSnapTargetsEnabled,
    referenceNodeClickEnabled: args.referenceNodeClickEnabled,
    referenceNodeHoverEnabled: args.referenceNodeHoverEnabled,
    nodeLinkIdByNodeId: args.nodeLinkIdByNodeId,
    isInPreviewNodeLink: args.isInPreviewNodeLink,
    onMeasurementSelect: args.onMeasurementSelect,
    onNodeMeasurementsSelect: args.onNodeMeasurementsSelect,
    onNodeLongPress: args.onNodeLongPress,
    canStartNodeEditing: args.canStartNodeEditing,
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
