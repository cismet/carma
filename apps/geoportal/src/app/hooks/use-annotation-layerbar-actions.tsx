import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useDispatch } from "react-redux";
import { faFloppyDisk, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Icon from "react-cismap/commons/Icon";

import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  flyToAnnotationIds,
  selectAuthoringAnnotationEntries,
  type useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import type { LayerbarAction } from "../components/layers/LayerbarActionGroup";
import {
  useLayerbarInteractionToggle,
  type LayerbarInteractionTarget,
} from "../components/layers/use-layerbar-interaction-toggle";
import type { AppDispatch } from "../store";
import { removeLayer } from "../store/slices/mapping";

/** The runtime of the view on screen: the Cesium provider or the 3D measurement addon. */
export type AnnotationLayerbarSource = Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "annotationEntries" | "nodes" | "engine" | "removeAnnotationsByIds"
>;

export type AnnotationLayerbarActionsOptions = {
  layerId: string;
  /** Null while no runtime is mounted; the actions are disabled then. */
  source: AnnotationLayerbarSource | null;
  /** The save panel the save action opens under the row. */
  saveInteraction: LayerbarInteractionTarget;
  texts: { focusAll: string; save: string; deleteAll: string };
};

/** The row of an annotation runtime's measurements: show all, save, delete all, close. */
export const useAnnotationLayerbarActions = ({
  layerId,
  source,
  saveInteraction: saveTarget,
  texts,
}: AnnotationLayerbarActionsOptions) => {
  const dispatch = useDispatch<AppDispatch>();
  const saveInteraction = useLayerbarInteractionToggle(saveTarget);
  const authoringAnnotationIds = source
    ? selectAuthoringAnnotationEntries({
        annotationEntries: source.annotationEntries,
      }).map((annotationEntry) => annotationEntry.id)
    : [];
  const hasAuthoringAnnotations = authoringAnnotationIds.length > 0;

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
      title: texts.focusAll,
      icon: <Icon name="search-location" className="leading-none" />,
      disabled: !hasAuthoringAnnotations,
      onClick: () => {
        if (!source) return;
        flyToAnnotationIds({
          annotationEntries: source.annotationEntries,
          annotationIds: authoringAnnotationIds,
          nodes: source.nodes,
          engine: source.engine,
        });
      },
    },
    {
      id: "save",
      title: texts.save,
      icon: <FontAwesomeIcon icon={faFloppyDisk} />,
      active: saveInteraction.active,
      disabled: !hasAuthoringAnnotations,
      onClick: saveInteraction.onToggle,
    },
    {
      id: "delete-all",
      title: texts.deleteAll,
      icon: <FontAwesomeIcon icon={faTrashCan} />,
      disabled: !hasAuthoringAnnotations,
      onClick: (event) => {
        source?.removeAnnotationsByIds(authoringAnnotationIds, {
          skipConfirmation: event.shiftKey,
          source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
        });
      },
    },
  ];

  return { actions, handleClose };
};
