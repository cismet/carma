import LibModal, { LibModalProps } from '../components/LibModal';

/* eslint-disable-next-line */

export function LayerLib({
  open,
  setOpen,
  setAdditionalLayers,
  thumbnails,
  setThumbnail,
}: LibModalProps) {
  return (
    <LibModal
      open={open}
      setOpen={setOpen}
      setAdditionalLayers={setAdditionalLayers}
      thumbnails={thumbnails}
      setThumbnail={setThumbnail}
    />
  );
}

export default LayerLib;
