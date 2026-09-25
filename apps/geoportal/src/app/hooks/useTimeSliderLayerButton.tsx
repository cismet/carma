import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  TIME_SLIDER_LAYER_ID,
  TIME_SLIDER_PLAY_TOGGLE_ID,
  TIME_SLIDER_TOOLS_INTERACTION_ID,
  getTimeSliderRowSeed,
  useHasAddonStateProducer,
  useTimeSliderActions,
  useTimeSliderLayerRow,
} from "@carma-mapping/addons";

import {
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";
import { useLauncherCarriedControls } from "./useLauncherCarriedControls";

export { TIME_SLIDER_LAYER_ID };

const TIME_SLIDER_BUTTON_IDS = new Set([
  TIME_SLIDER_TOOLS_INTERACTION_ID,
  TIME_SLIDER_PLAY_TOGGLE_ID,
]);

export function useTimeSliderLayerButton() {
  const dispatch = useDispatch();
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  // this hook runs on every route, the addon that draws the series does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("timeSeries");

  // A series a style launched sits on that style's button; one a workflow card
  // switched in keeps a row of its own.
  const { rowLayer, launcherId, onLauncher, launcherHidden, show, remove } =
    useLauncherCarriedControls({
      kind: "timeSlider",
      rowId: TIME_SLIDER_LAYER_ID,
      buttonIds: TIME_SLIDER_BUTTON_IDS,
    });

  // The info view's Transparenz slider writes the row's opacity into the
  // mapping slice, while the series draws from the addon channel. One value in
  // two stores, so it is carried across here; each side writes only when the
  // two differ, which is what stops the two writes chasing each other. A
  // style's slider needs no bridge: the series reads it from the style's
  // placeholder on the map.
  const { opacity: channelOpacity, setOpacity } = useTimeSliderActions();
  const rowOpacity = rowLayer?.opacity;
  useEffect(() => {
    if (rowOpacity !== undefined && rowOpacity !== channelOpacity) {
      setOpacity(rowOpacity);
    }
  }, [rowOpacity, channelOpacity, setOpacity]);

  /** the layer whose button carries the readout that opens the ribbon */
  const carrierId = onLauncher ? launcherId : TIME_SLIDER_LAYER_ID;

  useTimeSliderLayerRow({
    hasRow: Boolean(rowLayer) || onLauncher,
    hasEngine,
    hidden: launcherHidden,
    // a row that came back out of the persisted layer stack carries its
    // series in its tools; the lib hook relaunches it at boot
    restoredSeed: getTimeSliderRowSeed(rowLayer),
    // the row's icon and the control-column button are blue while the ribbon is
    // up and black while it is not, so both need to know it is on screen
    panelOpen:
      activeInteractionLayerID === carrierId &&
      activeInteractionButtonID === TIME_SLIDER_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      const shownOn = show(layer);
      // A card's series opens the ribbon right away, the way the measurement
      // row does. A style's does not: the stack is persisted without the
      // carried buttons, so this runs again on every reload with the style in
      // it, and the ribbon would pop open each time.
      if (shownOn !== TIME_SLIDER_LAYER_ID) return;
      dispatch(setActiveInteractionLayerID(shownOn));
      dispatch(setActiveInteractionButtonID(TIME_SLIDER_TOOLS_INTERACTION_ID));
    },
    // the row carries the current step, so it goes stale on every slider move
    onUpdate: show,
    onRemove: (id) => {
      remove(id);
      // the ribbon hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
