import { useDispatch, useSelector } from "react-redux";

import {
  EXCALIDRAW_LAYER_ID,
  EXCALIDRAW_TOOLS_INTERACTION_ID,
  useExcalidrawLayerRow,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getLayers,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";

export { EXCALIDRAW_LAYER_ID };

export function useExcalidrawLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  useExcalidrawLayerRow({
    hasRow: layers.some((layer) => layer.id === EXCALIDRAW_LAYER_ID),
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(EXCALIDRAW_TOOLS_INTERACTION_ID));
    },
    onRemove: (id) => {
      dispatch(removeLayer(id));
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
