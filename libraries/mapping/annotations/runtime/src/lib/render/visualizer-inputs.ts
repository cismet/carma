import { resolvePointLabelVisualDefaults } from "../config/runtime-point-label-visual-defaults";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "./annotation-render-models";

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
  onAnnotationSelect?: (annotationId: string) => void;
  onNodeAnnotationsSelect?: (annotationIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, annotationId?: string) => void;
  canStartNodeEditing?: (nodeId: string, annotationId?: string) => boolean;
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
  onAnnotationSelect?: (annotationId: string) => void;
  onNodeAnnotationsSelect?: (annotationIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, annotationId?: string) => void;
  canStartNodeEditing?: (nodeId: string, annotationId?: string) => boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
};

type BuildVisualizerInputsArgs = BuildHostInteractionPointLabelsArgs &
  BuildHostInteractionPointMarkersArgs;

const isAnnotationSelected = (
  selectedAnnotationIdSet: ReadonlySet<string>,
  annotationId?: string
) => annotationId !== undefined && selectedAnnotationIdSet.has(annotationId);

const createNodeLongPressHandler = ({
  nodeId,
  annotationId,
  onNodeLongPress,
  canStartNodeEditing,
}: {
  nodeId?: string;
  annotationId?: string;
  onNodeLongPress?: (nodeId: string, annotationId?: string) => void;
  canStartNodeEditing?: (nodeId: string, annotationId?: string) => boolean;
}) =>
  onNodeLongPress &&
  nodeId &&
  (canStartNodeEditing?.(nodeId, annotationId) ?? true)
    ? () => onNodeLongPress(nodeId, annotationId)
    : undefined;

const canUseNodeEditingLongPress = ({
  nodeId,
  annotationId,
  canStartNodeEditing,
}: {
  nodeId?: string;
  annotationId?: string;
  canStartNodeEditing?: (nodeId: string, annotationId?: string) => boolean;
}) => !nodeId || (canStartNodeEditing?.(nodeId, annotationId) ?? true);

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

const buildAnnotationIdsByNodeLinkId = (
  points: readonly RuntimePointMarkerRenderModel[],
  nodeLinkIdByNodeId: ReadonlyMap<string, string>
) => {
  const annotationIdsByNodeLinkId = new Map<string, string[]>();

  points.forEach((point) => {
    if (!point.nodeId || !point.annotationId) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(point.nodeId) ?? point.nodeId;
    const annotationIds = annotationIdsByNodeLinkId.get(nodeLinkId) ?? [];
    if (!annotationIds.includes(point.annotationId)) {
      annotationIds.push(point.annotationId);
      annotationIdsByNodeLinkId.set(nodeLinkId, annotationIds);
    }
  });

  return annotationIdsByNodeLinkId;
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
  onAnnotationSelect,
  onNodeAnnotationsSelect,
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
          annotationId: pointLabel.annotationId,
          canStartNodeEditing,
        });

        return {
          ...pointLabel,
          onClick:
            !routePointerQueryThroughPointMarker &&
            (pointLabel.onClick || referenceNodeInteractionEnabled)
              ? () => {
                  if (pointLabel.onClick) {
                    pointLabel.onClick();
                    return;
                  }

                  if (referenceNodeInteractionEnabled && pointLabel.nodeId) {
                    onReferenceNodeClick?.(pointLabel.nodeId);
                  }
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
                  annotationId: pointLabel.annotationId,
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
        onAnnotationSelect ||
        onNodeAnnotationsSelect ||
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
  const annotationIdsByNodeLinkId = buildAnnotationIdsByNodeLinkId(
    points,
    nodeLinkIdByNodeId
  );

  points.forEach((point) => {
    const nodeId = point.nodeId;
    const annotationId = point.annotationId;

    if (!nodeId) {
      return;
    }
    if (!pointMarkerIdsHandledByVisibleLabels.has(point.id)) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(nodeId) ?? nodeId;
    const nodeAnnotationIds = annotationIdsByNodeLinkId.get(nodeLinkId) ?? [];
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
            annotationId,
            onNodeLongPress,
            canStartNodeEditing,
          });
    const interactionPointLabel: RuntimePointLabelRenderModel = {
      id: `${point.id}-node-interaction`,
      annotationId,
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
        : nodeAnnotationIds.length > 0 && onNodeAnnotationsSelect
        ? () => {
            onNodeAnnotationsSelect(nodeAnnotationIds);
          }
        : annotationId && onAnnotationSelect
        ? () => {
            onAnnotationSelect(annotationId);
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

    const existingIsSelected = isAnnotationSelected(
      selectedAnnotationIdSet,
      existingInteractionPointLabel.annotationId
    );
    const nextIsSelected = isAnnotationSelected(
      selectedAnnotationIdSet,
      point.annotationId
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
  onAnnotationSelect,
  onNodeAnnotationsSelect,
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
        const annotationIdsByNodeLinkId = buildAnnotationIdsByNodeLinkId(
          points,
          nodeLinkIdByNodeId
        );

        return points.map((point) => {
          const nodeId = point.nodeId;
          const annotationId = point.annotationId;
          const nodeLinkId = nodeId
            ? nodeLinkIdByNodeId.get(nodeId) ?? nodeId
            : null;
          const nodeAnnotationIds = nodeLinkId
            ? annotationIdsByNodeLinkId.get(nodeLinkId) ?? []
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
              : nodeAnnotationIds.length > 0 && onNodeAnnotationsSelect
              ? () => {
                  onNodeAnnotationsSelect(nodeAnnotationIds);
                }
              : annotationId && onAnnotationSelect
              ? () => {
                  onAnnotationSelect(annotationId);
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
              annotationId,
              canStartNodeEditing,
            });
          const nodeLongPressHandler = suppressPointMarkerLongPress
            ? undefined
            : createNodeLongPressHandler({
                nodeId,
                annotationId,
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
    onAnnotationSelect: args.onAnnotationSelect,
    onNodeAnnotationsSelect: args.onNodeAnnotationsSelect,
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
