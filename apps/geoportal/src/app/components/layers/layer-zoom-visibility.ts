export const isLayerVisibleAtZoom = (
  zoom: number | undefined,
  bounds?: { minZoom?: number; maxZoom?: number }
) => {
  if (zoom === undefined) {
    return true;
  }
  if (bounds?.maxZoom !== undefined && zoom >= bounds.maxZoom) {
    return false;
  }
  if (bounds?.minZoom !== undefined && zoom <= bounds.minZoom) {
    return false;
  }
  return true;
};
