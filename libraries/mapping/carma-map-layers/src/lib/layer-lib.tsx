import type { LibModalProps } from "../components/LibModal";
import NewLibModal from "../components/NewLibModal";

/* eslint-disable-next-line */

export function LayerLib({
  open,
  setOpen,
  setAdditionalLayers,
  thumbnails,
  setThumbnail,
  activeLayers,
  customCategories,
  addFavorite,
  removeFavorite,
  favorites,
  updateActiveLayer,
  removeLastLayer,
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
    />
  );
}

export default LayerLib;
