import { useDispatch, useSelector } from "react-redux";

import {
  FLOW_FIELD_LAYER_ID,
  useFlowFieldLayerRow,
  useHasAddonStateProducer,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";

export { FLOW_FIELD_LAYER_ID };

export function useFlowFieldLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  const rowLayer = layers.find((layer) => layer.id === FLOW_FIELD_LAYER_ID);
  // this hook runs on every route, the addon that draws the animation does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("flowField");

  useFlowFieldLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    onAdd: (layer) => dispatch(appendLayer(layer)),
    // the readout changes as the map crosses the zoom gate, so the row goes
    // stale without the animation itself changing
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    onRemove: (id) => dispatch(removeLayer(id)),
  });
}
