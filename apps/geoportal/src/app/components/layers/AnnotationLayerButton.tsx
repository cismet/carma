import { faTimes } from "@fortawesome/free-solid-svg-icons";

import {
  useAnnotationLayerbarActions,
  type AnnotationLayerbarActionsOptions,
} from "../../hooks/use-annotation-layerbar-actions";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";
import { LayerbarActionGroup } from "./LayerbarActionGroup";

/** The layer-bar row of an annotation runtime's measurements, in the Cesium and the MapLibre view. */
export const AnnotationLayerButton = ({
  source,
  saveInteraction,
  texts,
  ...buttonProps
}: GeoportalLayerButtonProps &
  Omit<AnnotationLayerbarActionsOptions, "layerId">) => {
  const { actions, handleClose } = useAnnotationLayerbarActions({
    layerId: buttonProps.id,
    source,
    saveInteraction,
    texts,
  });
  return (
    <GeoportalLayerButton
      {...buttonProps}
      actionSlot={<LayerbarActionGroup actions={actions} />}
      closeButton={{ icon: faTimes, onClick: handleClose }}
      closeButtonVariant="compact"
      overflowVisible
    />
  );
};
