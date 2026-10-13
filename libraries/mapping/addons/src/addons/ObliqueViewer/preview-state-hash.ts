import type { Ratio } from "@carma-units";
import type { ObliquePreviewState } from "@carma-mapping/oblique-viewer";

/** Domain keys remain separate from the map's normal lat/lng/zoom/FOV state. */
export const parseObliquePreviewHash = (
  params: Record<string, string>
): ObliquePreviewState | null => {
  if (
    !params.obs ||
    !params.obi ||
    params.obs.length > 256 ||
    params.obi.length > 2048
  )
    return null;
  const panX = params.obx === undefined ? 0 : Number(params.obx);
  const panY = params.oby === undefined ? 0 : Number(params.oby);
  const zoom = params.obz === undefined ? 0.9 : Number(params.obz);
  if (
    ![panX, panY, zoom].every(Number.isFinite) ||
    Math.abs(panX) > 2 ||
    Math.abs(panY) > 2 ||
    zoom <= 0 ||
    zoom > 1024
  )
    return null;
  return {
    seriesId: params.obs,
    imageId: params.obi,
    panX: panX as Ratio,
    panY: panY as Ratio,
    zoom: zoom as Ratio,
  };
};

export const obliquePreviewHashParams = (
  state: ObliquePreviewState | null
): Record<string, string | undefined> => ({
  obs: state?.seriesId,
  obi: state?.imageId,
  obx: state ? String(Number(state.panX.toFixed(8))) : undefined,
  oby: state ? String(Number(state.panY.toFixed(8))) : undefined,
  obz: state ? String(Number(state.zoom.toFixed(8))) : undefined,
});
