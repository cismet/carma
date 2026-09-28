import { useDispatch, useSelector } from "react-redux";

import {
  TRAFFIC_ANIMATION_LAYER_ID,
  TRAFFIC_TOOLS_INTERACTION_ID,
  useHasAddonStateProducer,
  useTrafficAnimationLayerRow,
} from "@carma-mapping/addons";

import {
  getActiveInteractionButtonID,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";
import { useLauncherCarriedControls } from "./useLauncherCarriedControls";

const TRAFFIC_BUTTON_IDS = new Set([TRAFFIC_TOOLS_INTERACTION_ID]);

export function useTrafficAnimationLayerButton() {
  const dispatch = useDispatch();
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const hasEngine = useHasAddonStateProducer("trafficAnimation");

  // The traffic is always its style's: the readout that opens the ribbon sits
  // on that style's button, never in a row of its own.
  const { rowLayer, launcherId, onLauncher, show, remove } =
    useLauncherCarriedControls({
      kind: "trafficAnimation",
      rowId: TRAFFIC_ANIMATION_LAYER_ID,
      buttonIds: TRAFFIC_BUTTON_IDS,
    });

  useTrafficAnimationLayerRow({
    hasRow: Boolean(rowLayer) || onLauncher,
    hasEngine,
    hasLauncher: launcherId !== undefined,
    onAdd: show,
    // the readout moves with the clock and the slider
    onUpdate: show,
    onRemove: (id) => {
      remove(id);
      // the ribbon hung off the readout that just went away
      if (activeInteractionButtonID === TRAFFIC_TOOLS_INTERACTION_ID) {
        dispatch(setActiveInteractionLayerID(null));
        dispatch(setActiveInteractionButtonID(null));
      }
    },
  });
}
