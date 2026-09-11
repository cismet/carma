import { useDispatch, useSelector } from "react-redux";

import {
  VEHICLE_ANIMATION_FOCUS_ID,
  VEHICLE_ANIMATION_LAYER_ID,
  VEHICLE_ANIMATION_PLAY_ID,
  VEHICLE_ANIMATION_STATUS_ID,
  getAddonKind,
  getLayerLaunchedAddons,
  getVehicleAnimationRowSeed,
  useHasAddonStateProducer,
  useVehicleAnimationLayerRow,
} from "@carma-mapping/addons";
import {
  getInteractionButtons,
  type InteractionButton,
  type Layer,
} from "@carma-mapping/layers";

import {
  appendLayer,
  getHiddenPermanentLayers,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";

export { VEHICLE_ANIMATION_LAYER_ID };

const VEHICLE_BUTTON_IDS = new Set([
  VEHICLE_ANIMATION_PLAY_ID,
  VEHICLE_ANIMATION_STATUS_ID,
  VEHICLE_ANIMATION_FOCUS_ID,
]);

const isVehicleButton = (button: InteractionButton) =>
  VEHICLE_BUTTON_IDS.has(button.id);

/** a layer's own buttons, without the fleet's controls it may be carrying */
const ownButtons = (layer: Layer) =>
  getInteractionButtons(layer.interactionButtons).filter(
    (button) => !isVehicleButton(button)
  );

// `getLayers` masks group members with their group, so a whole layer handed
// back would write the group's eye onto the member; `updateLayer` merges, and
// only the named fields go in
const patchLayer = (patch: Pick<Layer, "id"> & Partial<Layer>) =>
  updateLayer(patch as Layer);

export function useVehicleAnimationLayerButton() {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  const rowLayer = layers.find(
    (layer) => layer.id === VEHICLE_ANIMATION_LAYER_ID
  );
  // this hook runs on every route, the addon that draws the animation does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("vehicleAnimation");

  const launched = getLayerLaunchedAddons(layers).find(
    ({ entry }) => getAddonKind(entry) === "vehicleAnimation"
  );
  const launcher = launched
    ? layers.find((layer) => layer.id === launched.layerId)
    : undefined;
  /** the layers whose button currently shows the fleet's controls */
  const carriers = layers.filter(
    (layer) =>
      layer.id !== VEHICLE_ANIMATION_LAYER_ID &&
      getInteractionButtons(layer.interactionButtons).some(isVehicleButton)
  );
  const onLauncher =
    launcher !== undefined &&
    carriers.some((carrier) => carrier.id === launcher.id);

  // the visitor's choice for this row, kept next to the stack because the row
  // itself is rebuilt from config on every boot. Once the controls sit on the
  // launching layer there is no row left to show it again, so a choice made on
  // an earlier row no longer counts.
  const rowHidden =
    useSelector(getHiddenPermanentLayers).includes(
      VEHICLE_ANIMATION_LAYER_ID
    ) && !onLauncher;
  // a layer that launches the fleet takes it off the map with its own eye
  const launcherHidden = launched !== undefined && !launched.visible;
  const hidden = rowHidden || launcherHidden;

  const stripCarriers = (keepId?: string) => {
    for (const carrier of carriers) {
      if (carrier.id === keepId) continue;
      const rest = ownButtons(carrier);
      dispatch(
        patchLayer({
          id: carrier.id,
          interactionButtons: rest.length ? rest : undefined,
        })
      );
    }
  };

  /**
   * Put the row where the visitor finds it. The service a layer launched is
   * that layer's own: its controls go on the layer's button, so the button
   * reads like a workflow card and its ✕ takes track, stations and cars off
   * together. A service a workflow card switched in keeps a row of its own.
   */
  const show = (layer: Layer) => {
    const target = layer.permanent ? launcher : undefined;
    stripCarriers(target?.id);
    if (!target) {
      dispatch(rowLayer ? updateLayer(layer) : appendLayer(layer));
      return;
    }
    if (rowLayer) {
      dispatch(removeLayer({ id: VEHICLE_ANIMATION_LAYER_ID, force: true }));
    }
    dispatch(
      patchLayer({
        id: target.id,
        interactionButtons: [
          ...ownButtons(target),
          ...getInteractionButtons(layer.interactionButtons),
        ],
        // a button with controls on it opens nothing on a click; this one
        // still opens the layer's settings, like before it carried them
        hasInfoView: true,
      })
    );
  };

  useVehicleAnimationLayerRow({
    hasRow: Boolean(rowLayer) || onLauncher,
    hasEngine,
    hidden,
    // a row that came back out of the persisted layer stack carries its
    // service in its tools; the lib hook relaunches it at boot. A launching
    // layer starts its own service at mount, and two launches would race.
    restoredSeed: launched ? undefined : getVehicleAnimationRowSeed(rowLayer),
    onAdd: show,
    // the readout carries the speed and the pause state, so the row goes stale
    // without the animation itself changing
    onUpdate: show,
    // the addon owns this row, so it takes down a permanent one as well, e.g.
    // when its engine is suspended in the addon manager
    onRemove: (id) => {
      stripCarriers();
      if (rowLayer) {
        dispatch(removeLayer({ id, force: true }));
      }
    },
  });
}
