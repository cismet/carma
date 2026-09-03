import { useDispatch, useSelector } from "react-redux";

import {
  TIME_SLIDER_LAYER_ID,
  TIME_SLIDER_TOOLS_INTERACTION_ID,
  getTimeSliderRowSeed,
  useTimeSliderLayerRow,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getLayers,
  removeLayer,
  updateLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";

export { TIME_SLIDER_LAYER_ID };

export function useTimeSliderLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const rowLayer = layers.find((layer) => layer.id === TIME_SLIDER_LAYER_ID);

  useTimeSliderLayerRow({
    hasRow: Boolean(rowLayer),
    // a row that came back out of the persisted layer stack carries its
    // series in its tools; the lib hook relaunches it at boot
    restoredSeed: getTimeSliderRowSeed(rowLayer),
    // the row's icon and the control-column button are blue while the ribbon is
    // up and black while it is not, so both need to know it is on screen
    panelOpen:
      activeInteractionLayerID === TIME_SLIDER_LAYER_ID &&
      activeInteractionButtonID === TIME_SLIDER_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      // open the ribbon right away, the way the measurement row does
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(TIME_SLIDER_TOOLS_INTERACTION_ID));
    },
    // the row carries the current step, so it goes stale on every slider move
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the ribbon hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
