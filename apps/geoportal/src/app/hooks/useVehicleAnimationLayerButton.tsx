import { useDispatch, useSelector } from "react-redux";

import {
  VEHICLE_ANIMATION_LAYER_ID,
  getVehicleAnimationRowSeed,
  useHasAddonStateProducer,
  useVehicleAnimationLayerRow,
} from "@carma-mapping/addons";

import {
  appendLayer,
  getHiddenPermanentLayers,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";

export { VEHICLE_ANIMATION_LAYER_ID };

export function useVehicleAnimationLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  const rowLayer = layers.find(
    (layer) => layer.id === VEHICLE_ANIMATION_LAYER_ID
  );
  // this hook runs on every route, the addon that draws the animation does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("vehicleAnimation");
  // the visitor's choice for this row, kept next to the stack because the row
  // itself is rebuilt from config on every boot
  const hidden = useSelector(getHiddenPermanentLayers).includes(
    VEHICLE_ANIMATION_LAYER_ID
  );

  useVehicleAnimationLayerRow({
    hasRow: Boolean(rowLayer),
    hasEngine,
    hidden,
    // a row that came back out of the persisted layer stack carries its
    // service in its tools; the lib hook relaunches it at boot
    restoredSeed: getVehicleAnimationRowSeed(rowLayer),
    onAdd: (layer) => dispatch(appendLayer(layer)),
    // the readout carries the speed and the pause state, so the row goes stale
    // without the animation itself changing
    onUpdate: (layer) => dispatch(updateLayer(layer)),
    // the addon owns this row, so it takes down a permanent one as well, e.g.
    // when its engine is suspended in the addon manager
    onRemove: (id) => dispatch(removeLayer({ id, force: true })),
  });
}
