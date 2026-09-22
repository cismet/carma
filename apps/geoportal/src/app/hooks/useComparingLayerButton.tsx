import { useDispatch, useSelector } from "react-redux";

import {
  COMPARING_LAYER_ID,
  useComparingLayerRow,
  useHasAddonStateProducer,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getLayers,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";

export { COMPARING_LAYER_ID };

/**
 * The transient comparison row. It carries no definition: a comparison the
 * user wants to keep is saved as a workflow group from the pane, and that
 * group's engine is bound by `WorkflowGroupHost` in the addons library.
 */
export function useComparingLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  const rowLayer = layers.find((layer) => layer.id === COMPARING_LAYER_ID);
  // this hook runs on every route, the addons that draw the panels do not; a
  // row that arrives without them is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("compareState");

  useComparingLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    onAdd: (layer) => dispatch(appendLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the control pane hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
