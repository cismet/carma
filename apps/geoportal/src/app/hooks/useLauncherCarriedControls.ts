import { useDispatch, useSelector } from "react-redux";

import {
  getAddonKind,
  getLayerLaunchedAddons,
  type AddonKind,
} from "@carma-mapping/addons";
import {
  getInteractionButtons,
  type InteractionButton,
  type Layer,
} from "@carma-mapping/layers";

import {
  appendLayer,
  getLayers,
  removeLayer,
  updateLayer,
} from "../store/slices/mapping";

// `getLayers` masks group members with their group, so a whole layer handed
// back would write the group's eye onto the member; `updateLayer` merges, and
// only the named fields go in
const patchLayer = (patch: Pick<Layer, "id"> & Partial<Layer>) =>
  updateLayer(patch as Layer);

export type UseLauncherCarriedControlsOptions = {
  /** the engine whose controls these are */
  kind: AddonKind;
  /** the engine's own row, used when no layer launched it */
  rowId: string;
  /** the ids of the buttons the engine puts on its row */
  buttonIds: ReadonlySet<string>;
};

/**
 * Where an engine's controls sit in the layer bar.
 *
 * An engine a layer launched is that layer's own (`getLayerLaunchedAddons`):
 * its controls go on the layer's button, so the button reads like a workflow
 * card, its ✕ takes the engine off with the layer and its eye hides it. An
 * engine a workflow card switched in keeps a row of its own.
 *
 * The row hook of the engine decides what the controls are; this puts them
 * where they belong and takes them off every other layer, which is what
 * `onAdd`, `onUpdate` and `onRemove` of the row hook are wired to.
 *
 * The Schwebebahn's `useVehicleAnimationLayerButton` does the same by hand and
 * moves onto this once its fleet follows a style's slot too.
 */
export function useLauncherCarriedControls({
  kind,
  rowId,
  buttonIds,
}: UseLauncherCarriedControlsOptions) {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);

  const isEngineButton = (button: InteractionButton) =>
    buttonIds.has(button.id);
  /** a layer's own buttons, without the engine's it may be carrying */
  const ownButtons = (layer: Layer) =>
    getInteractionButtons(layer.interactionButtons).filter(
      (button) => !isEngineButton(button)
    );

  const rowLayer = layers.find((layer) => layer.id === rowId);

  const launched = getLayerLaunchedAddons(layers).find(
    ({ entry }) => getAddonKind(entry) === kind
  );
  const launcher = launched
    ? layers.find((layer) => layer.id === launched.layerId)
    : undefined;
  /** the layers whose button currently shows the engine's controls */
  const carriers = layers.filter(
    (layer) =>
      layer.id !== rowId &&
      getInteractionButtons(layer.interactionButtons).some(isEngineButton)
  );
  const onLauncher =
    launcher !== undefined &&
    carriers.some((carrier) => carrier.id === launcher.id);

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

  /** put the engine's controls where the visitor finds them */
  const show = (layer: Layer) => {
    const target = layer.permanent ? launcher : undefined;
    stripCarriers(target?.id);
    if (!target) {
      dispatch(rowLayer ? updateLayer(layer) : appendLayer(layer));
      return;
    }
    if (rowLayer) {
      dispatch(removeLayer({ id: rowId, force: true }));
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

  /** take the controls off every layer and the row off the bar */
  const remove = (id: string) => {
    stripCarriers();
    if (rowLayer) {
      dispatch(removeLayer({ id, force: true }));
    }
  };

  return {
    rowLayer,
    /** whether the controls currently sit on the layer that launched the engine */
    onLauncher,
    /** the launching layer's eye is off; the engine hides with it */
    launcherHidden: launched !== undefined && !launched.visible,
    show,
    remove,
  };
}
