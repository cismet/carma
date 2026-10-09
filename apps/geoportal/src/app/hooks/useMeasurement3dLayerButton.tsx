import { useDispatch, useSelector } from "react-redux";
import {
  MEASUREMENT3D_LAYER_ID,
  MEASUREMENT3D_TOOLS_INTERACTION_ID,
  useMeasurement3dLayerRow,
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

export { MEASUREMENT3D_LAYER_ID };

/** App half of the 3D measurement row: the dispatches the library half asks for. */
export function useMeasurement3dLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const activeInteractionLayerID = useSelector(getActiveInteractionLayerID);
  const activeInteractionButtonID = useSelector(getActiveInteractionButtonID);
  useMeasurement3dLayerRow({
    hasRow: layers.some((layer) => layer.id === MEASUREMENT3D_LAYER_ID),
    panelOpen:
      activeInteractionLayerID === MEASUREMENT3D_LAYER_ID &&
      activeInteractionButtonID === MEASUREMENT3D_TOOLS_INTERACTION_ID,
    onAdd: (layer) => {
      dispatch(appendLayer(layer));
      dispatch(setActiveInteractionLayerID(layer.id));
      dispatch(
        setActiveInteractionButtonID(MEASUREMENT3D_TOOLS_INTERACTION_ID)
      );
    },
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => {
      dispatch(removeLayer(id));
      dispatch(setActiveInteractionLayerID(null));
      dispatch(setActiveInteractionButtonID(null));
    },
  });
}
