import LibModal, { LibModalProps } from '../components/LibModal';

/* eslint-disable-next-line */

export function LayerLib({
  open,
  setOpen,
  setAdditionalLayers,
  thumbnails,
  setThumbnail,
  activeLayers,
  customCategories,
}: LibModalProps) {
  return (
    <LibModal
      open={open}
      setOpen={setOpen}
      setAdditionalLayers={setAdditionalLayers}
      thumbnails={thumbnails}
      setThumbnail={setThumbnail}
      activeLayers={activeLayers}
      customCategories={customCategories}
    />
  );
}

export default LayerLib;
