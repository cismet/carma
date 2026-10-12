import { resolvePointLabelVisualDefaults } from "../config/runtime-point-label-visual-defaults";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "./annotation-render-models";

const visualizerInputDefaults = Object.freeze({
  nodeLabelLongPressDurationMs: 320,
});

type NodeInteractionHandlers = {
  onAnnotationSelect?: (annotationId: string) => void;
  onNodeAnnotationsSelect?: (annotationIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, annotationId?: string) => void;
  canStartNodeEditing?: (nodeId: string, annotationId?: string) => boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
};

type NodeInteractionContext = NodeInteractionHandlers & {
  enableHostInteractionTargets: boolean;
  previewSnapTargetsEnabled: boolean;
  referenceNodeClickEnabled: boolean;
  referenceNodeHoverEnabled: boolean;
  nodeLinkIdByNodeId: ReadonlyMap<string, string>;
  isInPreviewNodeLink: (nodeId?: string) => boolean;
};

type BuildHostInteractionPointLabelsArgs = NodeInteractionContext & {
  pointLabels: readonly RuntimePointLabelRenderModel[];
  points: readonly RuntimePointMarkerRenderModel[];
  selectedAnnotationIdSet: ReadonlySet<string>;
  previewNodeLinkId: string | null;
};

type BuildHostInteractionPointMarkersArgs = NodeInteractionContext & {
  points: readonly RuntimePointMarkerRenderModel[];
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
} & Pick<NodeInteractionHandlers, "onNodeLongPress" | "canStartNodeEditing">) =>
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
} & Pick<NodeInteractionHandlers, "canStartNodeEditing">) =>
  !nodeId || (canStartNodeEditing?.(nodeId, annotationId) ?? true);

/** The click of a node's interaction target: reference pick, preview snap, linked-annotation select, annotation select. */
const resolveNodeClickHandler = ({
  nodeId,
  annotationId,
  nodeAnnotationIds,
  referenceNodeInteractionEnabled,
  previewSnapTargetsEnabled,
  onReferenceNodeClick,
  onPreviewSnapTargetNodeClick,
  onNodeAnnotationsSelect,
  onAnnotationSelect,
}: {
  nodeId?: string;
  annotationId?: string;
  nodeAnnotationIds: readonly string[];
  referenceNodeInteractionEnabled: boolean;
  previewSnapTargetsEnabled: boolean;
} & Pick<
  NodeInteractionHandlers,
  | "onReferenceNodeClick"
  | "onPreviewSnapTargetNodeClick"
  | "onNodeAnnotationsSelect"
  | "onAnnotationSelect"
>): (() => void) | undefined => {
  if (referenceNodeInteractionEnabled && nodeId) {
    return () => {
      onReferenceNodeClick?.(nodeId);
    };
  }
  if (previewSnapTargetsEnabled && nodeId) {
    return () => {
      onPreviewSnapTargetNodeClick?.(nodeId);
    };
  }
  if (nodeAnnotationIds.length > 0 && onNodeAnnotationsSelect) {
    return () => {
      onNodeAnnotationsSelect(nodeAnnotationIds);
    };
  }
  if (annotationId && onAnnotationSelect) {
    return () => {
      onAnnotationSelect(annotationId);
    };
  }
  return undefined;
};

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

/** Ids of the point markers a visible label draws itself. */
const getPointMarkerIdsHandledByLabels = (
  pointLabels: readonly RuntimePointLabelRenderModel[]
) =>
  new Set(
    pointLabels.flatMap((pointLabel) =>
      pointLabel.pointMarkerId &&
      pointLabel.hideLabelAndStem !== true &&
      pointLabel.hideMarker !== true
        ? [pointLabel.pointMarkerId]
        : []
    )
  );

const buildHostInteractionPointLabels = ({
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

  const pointMarkerIdsHandledByVisibleLabels = getPointMarkerIdsHandledByLabels(
    normalizedPointLabels
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
    const { nodeId, annotationId } = point;

    if (!nodeId || !pointMarkerIdsHandledByVisibleLabels.has(point.id)) {
      return;
    }

    const nodeLinkId = nodeLinkIdByNodeId.get(nodeId) ?? nodeId;
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
      onClick: resolveNodeClickHandler({
        nodeId,
        annotationId,
        nodeAnnotationIds: annotationIdsByNodeLinkId.get(nodeLinkId) ?? [],
        referenceNodeInteractionEnabled,
        previewSnapTargetsEnabled,
        onReferenceNodeClick,
        onPreviewSnapTargetNodeClick,
        onNodeAnnotationsSelect,
        onAnnotationSelect,
      }),
      onLongPress: nodeLongPressHandler,
      longPressDurationMs: visualizerInputDefaults.nodeLabelLongPressDurationMs,
    };
    const interactionPointLabelKey = nodeLongPressHandler
      ? point.id
      : nodeLinkId;

    const existingInteractionPointLabel = interactionLabelsByKey.get(
      interactionPointLabelKey
    );
    if (
      !existingInteractionPointLabel ||
      (!isAnnotationSelected(
        selectedAnnotationIdSet,
        existingInteractionPointLabel.annotationId
      ) &&
        isAnnotationSelected(selectedAnnotationIdSet, point.annotationId))
    ) {
      interactionLabelsByKey.set(
        interactionPointLabelKey,
        interactionPointLabel
      );
    }
  });

  return [...normalizedPointLabels, ...interactionLabelsByKey.values()];
};

const buildHostInteractionPointMarkers = ({
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
}: BuildHostInteractionPointMarkersArgs): readonly RuntimePointMarkerRenderModel[] => {
  if (!enableHostInteractionTargets) {
    return points.map((point) => ({
      ...point,
      onClick: undefined,
      onHoverChange: undefined,
      onLongPress: undefined,
    }));
  }

  const nodeInteractionHoverEnabled =
    referenceNodeHoverEnabled || previewSnapTargetsEnabled;
  const annotationIdsByNodeLinkId = buildAnnotationIdsByNodeLinkId(
    points,
    nodeLinkIdByNodeId
  );

  return points.map((point) => {
    const { nodeId, annotationId } = point;
    const nodeLinkId = nodeId ? nodeLinkIdByNodeId.get(nodeId) ?? nodeId : null;
    const referenceNodeInteractionEnabled = Boolean(
      referenceNodeClickEnabled &&
        onReferenceNodeClick &&
        nodeId &&
        !isInPreviewNodeLink(nodeId)
    );
    const nodeHoverHandler =
      nodeInteractionHoverEnabled && nodeId && !isInPreviewNodeLink(nodeId)
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

    return {
      ...point,
      onClick:
        resolveNodeClickHandler({
          nodeId,
          annotationId,
          nodeAnnotationIds: nodeLinkId
            ? annotationIdsByNodeLinkId.get(nodeLinkId) ?? []
            : [],
          referenceNodeInteractionEnabled,
          previewSnapTargetsEnabled,
          onReferenceNodeClick,
          onPreviewSnapTargetNodeClick,
          onNodeAnnotationsSelect,
          onAnnotationSelect,
        }) ?? point.onClick,
      onHoverChange: nodeHoverHandler,
      onLongPress: suppressPointMarkerLongPress
        ? undefined
        : point.onLongPress ??
          createNodeLongPressHandler({
            nodeId,
            annotationId,
            onNodeLongPress,
            canStartNodeEditing,
          }),
      longPressDurationMs:
        point.longPressDurationMs ??
        visualizerInputDefaults.nodeLabelLongPressDurationMs,
    };
  });
};

export const buildVisualizerInputs = (args: BuildVisualizerInputsArgs) => {
  const pointLabels = buildHostInteractionPointLabels(args);
  const pointMarkerIdsHandledByLabels =
    getPointMarkerIdsHandledByLabels(pointLabels);

  return {
    pointLabels,
    visibleStandalonePoints: buildHostInteractionPointMarkers(args).filter(
      (point) => !pointMarkerIdsHandledByLabels.has(point.id)
    ),
  };
};
