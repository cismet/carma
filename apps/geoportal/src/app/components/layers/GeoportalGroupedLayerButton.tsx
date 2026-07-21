import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { LayerGroup } from "@carma-mapping/layers";
import { LayerButton } from "@carma-mapping/components";
import { cn } from "@carma-commons/utils";

import type { AppDispatch } from "../../store";
import { updateInfoElementsAfterRemovingFeature } from "../../store/slices/features";
import {
  changeVisibility,
  getSelectionShowsNoInfoView,
  removeLayer,
} from "../../store/slices/mapping";
import { getUIShowLayerHideButtons } from "../../store/slices/ui";
import { resolveGeoportalLayerButtonCloseIcon } from "../../hooks/use-geoportal-layer-button-actions";
import { getGeoportalLayerButtonBackgroundClassName } from "./layer-tool-action-button-style";

export interface GeoportalGroupedLayerButtonProps {
  group: LayerGroup;
  hide?: boolean;
}

/**
 * The layer button for a `LayerGroup`: one button standing for the whole group.
 * It behaves like a normal layer button (draggable to reorder, greys out while
 * another layer's info view is open) and its end button removes the group, or,
 * while the hide buttons are shown, toggles the group's visibility.
 *
 * Because the group is a single stack entry, both actions are one dispatch
 * against the group's id. Clicking the button body does nothing yet: a group
 * has no info view.
 */
const GeoportalGroupedLayerButton = ({
  group,
  hide = false,
}: GeoportalGroupedLayerButtonProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const showLayerHideButtons = useSelector(getUIShowLayerHideButtons);
  const showsNoSelection = useSelector(getSelectionShowsNoInfoView);

  const { attributes, listeners, setNodeRef, transform } = useSortable({
    id: group.id,
  });

  const groupVisible = group.visible !== false;

  const handleEndButtonClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      // mirror the normal layer button: shift shows the hide buttons and turns
      // the close action into a visibility toggle
      if (showLayerHideButtons) {
        dispatch(changeVisibility({ id: group.id, visible: !groupVisible }));
        return;
      }
      group.layers.forEach((member) => {
        dispatch(updateInfoElementsAfterRemovingFeature(member.id));
      });
      dispatch(removeLayer(group.id));
    },
    [dispatch, group, groupVisible, showLayerHideButtons]
  );

  const endIcon = resolveGeoportalLayerButtonCloseIcon({
    showLayerHideButtons,
    visible: groupVisible,
  });

  return (
    <div className={cn(hide && "hidden")} id={`layer-${group.id}`}>
      <LayerButton
        ref={setNodeRef}
        style={{
          transform: CSS.Translate.toString(transform),
          userSelect: "none",
          touchAction: "none",
        }}
        {...listeners}
        {...attributes}
        classNames={[
          getGeoportalLayerButtonBackgroundClassName({
            showsNoSelection,
            visible: groupVisible,
          }),
          "pl-3 pr-2",
        ]}
      >
        <FontAwesomeIcon icon={faLayerGroup} className="text-gray-700" />
        <span className="text-base ml-1">{group.title}</span>
        <button
          type="button"
          id={`removeLayerButton-${group.id}`}
          className="hover:text-gray-500 text-gray-600 px-1.5 flex items-center justify-center"
          onClick={handleEndButtonClick}
          aria-label={
            showLayerHideButtons
              ? groupVisible
                ? "Gruppe ausblenden"
                : "Gruppe einblenden"
              : "Gruppe entfernen"
          }
        >
          <FontAwesomeIcon icon={endIcon} className="text-xs" />
        </button>
      </LayerButton>
    </div>
  );
};

export default GeoportalGroupedLayerButton;
