import { useDispatch, useSelector } from "react-redux";

import {
  SPOT_HIGHLIGHTS_LAYER_ID,
  SPOT_HIGHLIGHTS_TOOLS_INTERACTION_ID,
  useHasAddonStateProducer,
  useSpotHighlightsLayerRow,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getActiveInteractionButtonID,
  getActiveInteractionLayerID,
  getLayers,
  removeLayer,
  setActiveInteractionButtonID,
  setActiveInteractionLayerID,
  updateLayer,
} from "../store/slices/mapping";

export { SPOT_HIGHLIGHTS_LAYER_ID };

/**
 * The spot layer's row. The row carries the spots, so a pm-show scene saved
 * with it keeps them; see `useSpotHighlightsLayerRow` for how the row and the
 * addon stay in step.
 */
export function useSpotHighlightsLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  const hasEngine = useHasAddonStateProducer("spotHighlights");

  useSpotHighlightsLayerRow({
    rowLayer: layers.find((layer) => layer.id === SPOT_HIGHLIGHTS_LAYER_ID),
    hasEngine,
    // the spots edit on the map while the ribbon is up
    panelOpen:
      activeInteractionLayerID === SPOT_HIGHLIGHTS_LAYER_ID &&
      activeInteractionButtonID === SPOT_HIGHLIGHTS_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(
        setActiveInteractionButtonID(SPOT_HIGHLIGHTS_TOOLS_INTERACTION_ID)
      );
    },
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // only the row's own ribbon closes, another layer's stays up
      if (activeInteractionLayerID === id) {
        dispatch(setActiveInteractionLayerID(null));
        dispatch(setActiveInteractionButtonID(null));
      }
    },
  });
}
