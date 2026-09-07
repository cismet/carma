import { useDispatch, useSelector } from "react-redux";

import {
  FLOOD_LAYER_ID,
  FLOOD_TOOLS_INTERACTION_ID,
  useFloodLayerRow,
  useHasAddonStateProducer,
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

export { FLOOD_LAYER_ID };

export function useFloodLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const rowLayer = layers.find((layer) => layer.id === FLOOD_LAYER_ID);
  // this hook runs on every route, the addon that draws the water does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("floodSimulation");

  useFloodLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    // the row's icon is blue while the slider panel is up and black while it
    // is not, so the row needs to know it is on screen
    panelOpen:
      activeInteractionLayerID === FLOOD_LAYER_ID &&
      activeInteractionButtonID === FLOOD_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      // open the slider right away, the way the time series does
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(FLOOD_TOOLS_INTERACTION_ID));
    },
    // the row carries the level, so it goes stale on every slider move
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the panel hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
