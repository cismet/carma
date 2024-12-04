import { LibModal } from "../components/LibModal";
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
  const urlParams = new URLSearchParams(window.location.hash);
  const showNewStyleParam = urlParams.get("featurePreview");
  if (showNewStyleParam !== null) {
    return (
      <NewLibModal
        open={open}
        setOpen={setOpen}
        setAdditionalLayers={setAdditionalLayers}
        thumbnails={thumbnails}
        setThumbnail={setThumbnail}
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
  return (
    <LibModal
      open={open}
      setOpen={setOpen}
      setAdditionalLayers={setAdditionalLayers}
      thumbnails={thumbnails}
      setThumbnail={setThumbnail}
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
