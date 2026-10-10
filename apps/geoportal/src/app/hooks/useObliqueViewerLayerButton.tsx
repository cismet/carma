import { useAdHocObliqueDatasets } from "@carma-mapping/oblique-viewer";
import { useDispatch, useSelector } from "react-redux";

import {
  OBLIQUE_LAYER_ID,
  OBLIQUE_TOOLS_INTERACTION_ID,
  useObliqueLayerRow,
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

export { OBLIQUE_LAYER_ID };

export function useObliqueViewerLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);

  const rowLayer = layers.find((layer) => layer.id === OBLIQUE_LAYER_ID);
  // this hook runs on every route, the addon that runs the viewer does not;
  // a row that arrives without it is dropped rather than shown dead
  const adHocDatasets = useAdHocObliqueDatasets();
  const hasEngine =
    useHasAddonStateProducer("obliqueViewer") || adHocDatasets.length > 0;

  useObliqueLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    // the row's icon is blue while the ribbon is up and black while it is
    // not, so the row needs to know it is on screen
    panelOpen:
      activeInteractionLayerID === OBLIQUE_LAYER_ID &&
      activeInteractionButtonID === OBLIQUE_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      // open the ribbon right away, the way the flood does
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(setActiveInteractionButtonID(OBLIQUE_TOOLS_INTERACTION_ID));
    },
    // the row carries the readout, so it goes stale on every move
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      // the ribbon hangs off the row that just went away
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
