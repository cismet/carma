import { useDispatch, useSelector } from "react-redux";

import {
  ANNOTATION_LAYER_ID,
  ANNOTATION_TOOLS_INTERACTION_ID,
  useAnnotationLayerRow,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getLayers,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";

export { ANNOTATION_LAYER_ID };

export function useAnnotationLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  useAnnotationLayerRow({
    hasRow: layers.some((layer) => layer.id === ANNOTATION_LAYER_ID),
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(ANNOTATION_TOOLS_INTERACTION_ID));
    },
    onRemove: (id) => {
      dispatch(removeLayer(id));
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
