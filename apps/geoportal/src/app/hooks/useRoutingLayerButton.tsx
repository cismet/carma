import { useDispatch, useSelector } from "react-redux";

import {
  ROUTING_LAYER_ID,
  ROUTING_TOOLS_INTERACTION_ID,
  useHasAddonStateProducer,
  useRoutingLayerRow,
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

export { ROUTING_LAYER_ID };

export function useRoutingLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const rowLayer = layers.find((layer) => layer.id === ROUTING_LAYER_ID);
  // this hook runs on every route, the addon that navigates does not; a row
  // that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("routeNavigation");

  useRoutingLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    // the row's icon is blue while the ribbon is up and black while it is
    // not, so the row needs to know it is on screen
    panelOpen:
      activeInteractionLayerID === ROUTING_LAYER_ID &&
      activeInteractionButtonID === ROUTING_TOOLS_INTERACTION_ID,
    // the ribbon stays closed: the navigation is started from the info box,
    // and the map is what the user wants to see then, not a slider
    onAdd: (layer) => dispatch(appendLayer(layer)),
    // the row carries the countdown, so it goes stale on every fix
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the ribbon hangs off the row that just went away
      if (activeInteractionLayerID === ROUTING_LAYER_ID) {
        dispatch(setActiveInteractionLayerID(null));
        dispatch(setActiveInteractionButtonID(null));
      }
    },
  });
}
