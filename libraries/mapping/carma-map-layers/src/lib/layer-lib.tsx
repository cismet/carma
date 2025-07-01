import type { LibModalProps } from "../components/NewLibModal";
import NewLibModal from "../components/NewLibModal";

/* eslint-disable-next-line */

export function LayerLib({
  open,
  setOpen,
  setAdditionalLayers,
  activeLayers,
  customCategories,
  addFavorite,
  removeFavorite,
  favorites,
  updateActiveLayer,
  removeLastLayer,
  updateFavorite,
  discoverProps,
  setFeatureFlags,
}: LibModalProps) {
  return (
    <NewLibModal
      open={open}
      setOpen={setOpen}
      setAdditionalLayers={setAdditionalLayers}
      activeLayers={activeLayers}
      customCategories={customCategories}
      addFavorite={addFavorite}
      removeFavorite={removeFavorite}
      favorites={favorites}
      updateActiveLayer={updateActiveLayer}
      removeLastLayer={removeLastLayer}
      updateFavorite={updateFavorite}
      discoverProps={discoverProps}
      setFeatureFlags={setFeatureFlags}
    />
  );
}

export default LayerLib;
