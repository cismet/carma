import { useDispatch, useSelector } from "react-redux";

import { COMPARING_LAYER_ID, useComparingLayerRow } from "@carma-mapping/addons";

import {
  appendLayer,
  getLayers,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";

export { COMPARING_LAYER_ID };

export function useComparingLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  useComparingLayerRow({
    hasRow: layers.some((layer) => layer.id === COMPARING_LAYER_ID),
    onAdd: (layer) => dispatch(appendLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the control pane hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
