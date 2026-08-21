import { useDispatch, useSelector } from "react-redux";

import {
  HIGHLIGHT_TOOLS_INTERACTION_ID,
  HIGHLIGHT_LAYER_ID,
  useHighlightLayerRow,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getLayers,
  removeLayer,
  updateLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";

export { HIGHLIGHT_LAYER_ID };

export function useHighlightLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  useHighlightLayerRow({
    hasRow: layers.some((layer) => layer.id === HIGHLIGHT_LAYER_ID),
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      // open the panel right away, the way the measurement row does
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(HIGHLIGHT_TOOLS_INTERACTION_ID));
    },
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onOpenPanel: (layer) => {
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(HIGHLIGHT_TOOLS_INTERACTION_ID));
    },
    onRemove: (id) => {
      dispatch(removeLayer(id));
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
