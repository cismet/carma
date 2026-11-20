import { useDispatch, useSelector } from "react-redux";

import {
  CARMA_PLAN_LAYER_ID,
  CARMA_PLAN_TOOLS_INTERACTION_ID,
  useCarmaPlanLayerRow,
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

export { CARMA_PLAN_LAYER_ID };

export function useCarmaPlanLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const rowLayer = layers.find((layer) => layer.id === CARMA_PLAN_LAYER_ID);
  // this hook runs on every route, the addon that cuts the site does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("carmaPlan");

  useCarmaPlanLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    // the row's icon and the control button are blue while the scenario
    // picker is up and black while it is not
    panelOpen:
      activeInteractionLayerID === CARMA_PLAN_LAYER_ID &&
      activeInteractionButtonID === CARMA_PLAN_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      // open the scenario picker right away
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(CARMA_PLAN_TOOLS_INTERACTION_ID));
    },
    // the row carries the site and the scenario as its readout
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the panel hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
