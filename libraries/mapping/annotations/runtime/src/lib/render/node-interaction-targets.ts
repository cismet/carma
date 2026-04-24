export const shouldShowNodeInteractionTargets = ({
  enableHostInteractionTargets,
  hasNodeInteractionHandlers,
  nodeInteractionHoverEnabled,
  nodeLongPressInteractionEnabled,
  blockLabelInteractions,
}: {
  enableHostInteractionTargets: boolean;
  hasNodeInteractionHandlers: boolean;
  nodeInteractionHoverEnabled: boolean;
  nodeLongPressInteractionEnabled: boolean;
  blockLabelInteractions: boolean;
}) =>
  enableHostInteractionTargets &&
  hasNodeInteractionHandlers &&
  (nodeInteractionHoverEnabled ||
    nodeLongPressInteractionEnabled ||
    !blockLabelInteractions);
