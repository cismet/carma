import { useDispatch, useSelector } from "react-redux";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Tooltip } from "antd";

import {
  getTargetAddonsWithTrigger,
  resolveAddonTrigger,
  toAddonButtonId,
} from "@carma-mapping/addons";
import type { LayerStackEntry } from "@carma-mapping/layers";
import { cn } from "@carma-commons/utils";

import {
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import { getGeoportalLayerToolActionButtonClassName } from "./layer-tool-action-button-style";

export const LayerAddonTriggerButtons = ({
  target,
  buttonClassName,
}: {
  target: LayerStackEntry;
  buttonClassName?: string;
}) => {
  const dispatch = useDispatch();
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const addons = getTargetAddonsWithTrigger(target);
  const isInteractionActive = activeInteractionLayerID === target.id;

  return (
    <>
      {addons.map((addon) => {
        const addonTrigger = resolveAddonTrigger(addon, target);
        if (!addonTrigger) {
          return null;
        }
        const buttonId = toAddonButtonId(addon.kind);
        const isAddonActive =
          isInteractionActive && activeInteractionButtonID === buttonId;
        return (
          <Tooltip key={addon.kind} title={addonTrigger.label}>
            <button
              type="button"
              id={`layerInteractionButton-${target.id}-${addon.kind}`}
              className={cn(
                "group",
                buttonClassName
                  ? cn(buttonClassName, isAddonActive && "!text-[#1677ff]")
                  : getGeoportalLayerToolActionButtonClassName(isAddonActive)
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (addonTrigger.onClick) {
                  addonTrigger.onClick();
                  return;
                }
                dispatch(
                  setActiveInteractionLayerID(isAddonActive ? null : target.id)
                );
                dispatch(
                  setActiveInteractionButtonID(isAddonActive ? null : buttonId)
                );
              }}
              aria-label={addonTrigger.label}
            >
              <Badge count={addonTrigger.badge} size="small" color="#4b5563">
                <FontAwesomeIcon
                  icon={addonTrigger.icon}
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
    </>
  );
};
