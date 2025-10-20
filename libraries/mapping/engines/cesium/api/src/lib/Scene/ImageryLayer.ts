import { ImageryLayer } from "cesium";

export { ImageryLayer };

export const isValidImageryLayer = (
  imageryLayer: unknown
): imageryLayer is ImageryLayer => {
  return (
    imageryLayer instanceof ImageryLayer &&
    imageryLayer.isDestroyed() === false &&
    imageryLayer.ready === true
  );
};
