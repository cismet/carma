import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch } from "../../store";
import {
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";

export type LayerbarInteractionTarget = Readonly<{
  layerId: string;
  buttonId: string;
}>;

const isLayerbarInteractionActive = (
  activeInteractionLayerID: string | null,
  activeInteractionButtonID: string | null,
  target: LayerbarInteractionTarget
) =>
  activeInteractionLayerID === target.layerId &&
  activeInteractionButtonID === target.buttonId;

const setLayerbarInteractionActive = (
  dispatch: AppDispatch,
  target: LayerbarInteractionTarget,
  active: boolean
) => {
  dispatch(setActiveInteractionLayerID(active ? target.layerId : null));
  dispatch(setActiveInteractionButtonID(active ? target.buttonId : null));
};

export const useLayerbarInteractionToggle = (
  target: LayerbarInteractionTarget
) => {
  const dispatch = useDispatch<AppDispatch>();
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const active = isLayerbarInteractionActive(
    activeInteractionLayerID,
    activeInteractionButtonID,
    target
  );
  const onToggle = useCallback(() => {
    setLayerbarInteractionActive(dispatch, target, !active);
  }, [active, dispatch, target]);

  return { active, onToggle };
};
