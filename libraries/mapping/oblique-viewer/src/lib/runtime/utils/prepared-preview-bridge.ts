import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix3 } from "three";
import { ThreeImageLevels, type ImageView } from "@carma-commons/image-pyramid";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import type { DevicePixels } from "@carma-units";
import { getCameraCalibration } from "../../core/utils/calibration";
import {
  handoffNativePreviewComposer,
  nativePixelPool,
  nativePreviewSource,
} from "./native-preview-pool";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "./oblique-viewport-source";
import type { PhotoRotationDrapeTransition } from "./photo-rotation-drape";
import { residentPreviewLevel } from "./preview-region-ready";

let nextId = 0;
/** Prepared target pixels follow the shared camera until NativePixels takes the same GPU composer. */
export const createPreparedPreviewBridge = (
  map: MaplibreMap,
  photo: ObliqueViewportPhoto,
  viewportToImage: Matrix3,
  showBasemapLabels: boolean,
  preparedView: ImageView,
  currentProjection?: () => Matrix3
): PhotoRotationDrapeTransition => {
  const scene = acquireSharedThreeScene(map);
  const id = `oblique-prepared-preview-${++nextId}`;
  let composer: ThreeImageLevels | undefined;
  let releaseComposer: (() => void) | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.layer.setMapStyleScreenOverlay?.(id, null);
    if (releaseComposer) releaseComposer();
    else composer?.dispose();
    scene.release();
    map.triggerRepaint();
  };
  try {
    const renderer = scene.layer.getRenderer?.();
    if (!renderer || !scene.layer.setMapStyleScreenOverlay)
      throw Error("Die Zielvorschau kann noch nicht zusammengesetzt werden.");
    const calibration = getCameraCalibration(
      photo.dataset,
      photo.record.cameraId
    );
    const nativeSize = {
      width: calibration.widthPx as DevicePixels,
      height: calibration.heightPx as DevicePixels,
    };
    const source = nativePreviewSource({
      imageId: photo.record.sourceId,
      path: photo.dataset.previewPath,
      sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
      ...pyramidOptionsOf(photo),
      avifOnly: photo.dataset.avifOnly,
      nativeSize,
      minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
    });
    const stack = nativePixelPool.peek(source);
    if (!stack || residentPreviewLevel(stack, preparedView) === undefined)
      throw Error("Der Zielausschnitt ist noch nicht vollständig geladen.");
    composer = new ThreeImageLevels();
    composer.attach(stack);
    const { visible, density } = preparedView;
    const result = composer.renderToTarget(renderer, visible, {
      width: Math.ceil(visible.width * density),
      height: Math.ceil(visible.height * density),
    });
    if (!result) throw Error("Die Zielvorschau ist noch nicht darstellbar.");
    releaseComposer = handoffNativePreviewComposer(
      map,
      source,
      renderer,
      composer
    );
    const crop = result.rect;
    const cropTransform = new Matrix3().set(
      nativeSize.width / crop.width,
      0,
      -crop.x / crop.width,
      0,
      nativeSize.height / crop.height,
      1 - (nativeSize.height - crop.y) / crop.height,
      0,
      0,
      1
    );
    const matrix = cropTransform.clone().multiply(viewportToImage);
    const show = () => {
      if (disposed) return;
      if (currentProjection)
        matrix.copy(cropTransform).multiply(currentProjection());
      scene.layer.setMapStyleScreenOverlay?.(id, {
        texture: result.texture,
        viewportToTexture: matrix,
        opacity: 1,
        priority: 120,
        showBasemapLabels,
      });
      map.triggerRepaint();
    };
    return {
      targetImageId: photo.record.id,
      update: (progress) => {
        if (currentProjection || progress >= 1) show();
      },
      finish: show,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
