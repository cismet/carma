import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useDispatch } from "react-redux";
import {
  faFloppyDisk,
  faTimes,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Icon from "react-cismap/commons/Icon";

import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  selectAuthoringAnnotationEntries,
} from "@carma-mapping/annotations/runtime";
import {
  MEASUREMENT3D_LAYER_ID,
  MEASUREMENT3D_SAVE_INTERACTION_ID,
  MEASUREMENT3D_TEXT,
  useMeasurement3dRuntimeServices,
} from "@carma-mapping/addons";

import type { AppDispatch } from "../../store";
import { removeLayer } from "../../store/slices/mapping";
import GeoportalLayerButton, {
  type GeoportalLayerButtonProps,
} from "./GeoportalLayerButton";
import {
  LayerbarActionGroup,
  type LayerbarAction,
} from "./LayerbarActionGroup";
import {
  useLayerbarInteractionToggle,
  type LayerbarInteractionTarget,
} from "./use-layerbar-interaction-toggle";

const MEASUREMENT3D_SAVE_LAYERBAR_INTERACTION = {
  layerId: MEASUREMENT3D_LAYER_ID,
  buttonId: MEASUREMENT3D_SAVE_INTERACTION_ID,
} as const satisfies LayerbarInteractionTarget;

const useMeasurement3dLayerbarActions = (layerId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const services = useMeasurement3dRuntimeServices();
  const saveInteraction = useLayerbarInteractionToggle(
    MEASUREMENT3D_SAVE_LAYERBAR_INTERACTION
  );
  const authoringIds = services
    ? selectAuthoringAnnotationEntries({
        annotationEntries: services.annotationEntries,
      }).map((entry) => entry.id)
    : [];
  const hasMeasurements = authoringIds.length > 0;
  const handleClose = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dispatch(removeLayer(layerId));
    },
    [dispatch, layerId]
  );
  const actions: LayerbarAction[] = [
    {
      id: "focus-all",
      title: MEASUREMENT3D_TEXT.row.focusAll,
      icon: <Icon name="search-location" className="leading-none" />,
      disabled: !hasMeasurements,
      onClick: () => services?.flyToAllAnnotations(),
    },
    {
      id: "save",
      title: MEASUREMENT3D_TEXT.row.save,
      icon: <FontAwesomeIcon icon={faFloppyDisk} />,
      active: saveInteraction.active,
      disabled: !hasMeasurements,
      onClick: saveInteraction.onToggle,
    },
    {
      id: "delete-all",
      title: MEASUREMENT3D_TEXT.row.deleteAll,
      icon: <FontAwesomeIcon icon={faTrashCan} />,
      disabled: !hasMeasurements,
      onClick: (event) => {
        services?.removeAnnotationsByIds(authoringIds, {
          skipConfirmation: event.shiftKey,
          source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
        });
      },
    },
  ];
  return { actions, handleClose };
};

/** The 3D measurement row of the MapLibre view: the Cesium row's actions. */
export const Measurement3dLayerButton = (props: GeoportalLayerButtonProps) => {
  const { actions, handleClose } = useMeasurement3dLayerbarActions(props.id);
  return (
    <GeoportalLayerButton
      {...props}
      actionSlot={<LayerbarActionGroup actions={actions} />}
      closeButton={{ icon: faTimes, onClick: handleClose }}
      closeButtonVariant="compact"
      overflowVisible
    />
  );
};
