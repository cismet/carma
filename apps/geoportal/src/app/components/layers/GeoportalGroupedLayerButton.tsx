import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Tooltip } from "antd";

import type { LayerGroup } from "@carma-mapping/layers";
import { layerGroupHasInfoView } from "@carma-mapping/layers";
import { LayerButton } from "@carma-mapping/components";
import { cn } from "@carma-commons/utils";

import type { AppDispatch } from "../../store";
import { updateInfoElementsAfterRemovingFeature } from "../../store/slices/features";
import {
  changeVisibility,
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getClickFromInfoView,
  getSelectedLayerIndex,
  getSelectionShowsNoInfoView,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
  setClickFromInfoView,
  setSelectedLayerIndex,
  setSelectedLayerIndexNoSelection,
} from "../../store/slices/mapping";
import { getUIShowLayerHideButtons } from "../../store/slices/ui";
import {
  getTargetAddonsWithButton,
  resolveAddonLayerButton,
  toAddonButtonId,
} from "@carma-mapping/addons";
import { resolveGeoportalLayerButtonCloseIcon } from "../../hooks/use-geoportal-layer-button-actions";
import {
  getGeoportalLayerButtonBackgroundClassName,
  getGeoportalLayerToolActionButtonClassName,
} from "./layer-tool-action-button-style";

export interface GeoportalGroupedLayerButtonProps {
  group: LayerGroup;
  /** position of the group entry in the layer stack */
  index: number;
  hide?: boolean;
}

/**
 * The layer button for a `LayerGroup`: one button standing for the whole group.
 * It behaves like a normal layer button (draggable to reorder, greys out while
 * another layer's info view is open) and its end button removes the group, or,
 * while the hide buttons are shown, toggles the group's visibility.
 *
 * Because the group is a single stack entry, both actions are one dispatch
 * against the group's id. Clicking the button body toggles the group's info
 * view, as long as the group's config carries content for it.
 */
const GeoportalGroupedLayerButton = ({
  group,
  index,
  hide = false,
}: GeoportalGroupedLayerButtonProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const showLayerHideButtons = useSelector(getUIShowLayerHideButtons);
  const showsNoSelection = useSelector(getSelectionShowsNoInfoView);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const clickFromInfoView = useSelector(getClickFromInfoView);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const hasInfoView = layerGroupHasInfoView(group);
  const isSelected = selectedLayerIndex === index;
  const groupAddons = getTargetAddonsWithButton(group);
  const isInteractionActive = activeInteractionLayerID === group.id;

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
        onClick={(e) => {
          e.stopPropagation();
          // mirror the normal layer button: close another layer's open tool
          if (activeInteractionLayerID && !isInteractionActive) {
            dispatch(setActiveInteractionLayerID(null));
            dispatch(setActiveInteractionButtonID(null));
          }
          if (!hasInfoView) {
            return;
          }
          // mirror the normal layer button: the outside-click handler of an
          // open info view already moved the selection, so only reset its flag
          if (!clickFromInfoView) {
            dispatch(
              isSelected
                ? setSelectedLayerIndexNoSelection()
                : setSelectedLayerIndex(index)
            );
          } else {
            dispatch(setClickFromInfoView(false));
          }
        }}
        onMouseDown={(e) => e.preventDefault()}
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
            isSelected,
          }),
          "pl-3 pr-2",
        ]}
      >
        <FontAwesomeIcon icon={faLayerGroup} className="text-gray-700" />
        <span className="text-base ml-1">{group.title}</span>
        {groupAddons.map((addon) => {
          const addonButton = resolveAddonLayerButton(addon, group);
          if (!addonButton) {
            return null;
          }
          const buttonId = toAddonButtonId(addon.kind);
          const isAddonActive =
            isInteractionActive && activeInteractionButtonID === buttonId;
          return (
            <Tooltip key={addon.kind} title={addonButton.label}>
              <button
                type="button"
                id={`layerInteractionButton-${group.id}-${addon.kind}`}
                className={cn(
                  "group",
                  getGeoportalLayerToolActionButtonClassName(isAddonActive)
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // opening one tool closes the previous one, since both ids
                  // are set together
                  dispatch(
                    setActiveInteractionLayerID(isAddonActive ? null : group.id)
                  );
                  dispatch(
                    setActiveInteractionButtonID(isAddonActive ? null : buttonId)
                  );
                }}
                aria-label={addonButton.label}
              >
                <Badge count={addonButton.badge} size="small" color="#4b5563">
                  <FontAwesomeIcon
                    icon={addonButton.icon}
                    className={cn(
                      "text-sm",
                      isAddonActive
                        ? "!text-[#1677ff]"
                        : "!text-gray-600 group-hover:!text-gray-500"
                    )}
                  />
                </Badge>
              </button>
            </Tooltip>
          );
        })}
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
