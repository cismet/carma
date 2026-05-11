import {
  getEquivalentZoomForConvention,
  getEquivalentZoomRangeForConvention,
  WEB_MERCATOR_TILE_SIZE_256,
} from "@carma-geo/utils";
import type { ZoomConvention, ZoomRange } from "@carma-geo/utils";

export type MaplibreZoomAdapterConfig = ZoomConvention & {
  maplibreZoom?: ZoomConvention;
};

export type MaplibreSelectionZoomControlsConfig = {
  selectionSourceZoom?: ZoomConvention;
  maplibreZoom?: ZoomConvention;
};

export type CarmaZoomDefaults = MaplibreZoomAdapterConfig & {
  zoomMin: number;
  zoomMax: number;
  zoomDefault: number;
  featureInfoZoomDefault: number;
  defaultMaxNativeZoom: number;
  shareZoomDefault: number;
  selectionFitBoundsMaxZoom: number;
};

export type ZoomSettableMap = {
  setZoom: (zoom: number) => unknown;
  getZoom: () => number;
};

export type MaplibreZoomAdapter<TMap extends ZoomSettableMap> = {
  toMaplibreZoom: (sourceZoom: number) => number;
  toSourceZoom: (maplibreZoom: number) => number;
  getSourceZoom: (map: TMap) => number;
  setZoomFromSourceZoom: (map: TMap, sourceZoom: number) => void;
};

export type MaplibreZoomControls<TMap extends ZoomSettableMap> = {
  setZoomFromSourceZoom: (sourceZoom: number) => void;
  getSourceZoom: () => number | undefined;
};

export type MaplibreSelectionZoomControls = {
  setZoomFromSelectionSourceZoom: (selectionSourceZoom: number) => void;
  getSelectionSourceZoom: () => number | undefined;
};

export const DEFAULT_MAPLIBRE_TILE_SIZE = 512;

export const CARMA_ZOOM_DEFAULTS = {
  tileSize: WEB_MERCATOR_TILE_SIZE_256,
  maplibreZoom: { tileSize: DEFAULT_MAPLIBRE_TILE_SIZE },
  zoomMin: 10,
  zoomMax: 22,
  zoomDefault: 16,
  featureInfoZoomDefault: 20,
  defaultMaxNativeZoom: 20,
  shareZoomDefault: 18,
  selectionFitBoundsMaxZoom: 18,
} as const satisfies CarmaZoomDefaults;

const getMaplibreZoomConvention = (
  config: MaplibreZoomAdapterConfig = CARMA_ZOOM_DEFAULTS
): ZoomConvention => config.maplibreZoom ?? CARMA_ZOOM_DEFAULTS.maplibreZoom;

export const getMaplibreZoomFromSourceZoom = (
  zoom: number,
  config: MaplibreZoomAdapterConfig = CARMA_ZOOM_DEFAULTS
): number =>
  getEquivalentZoomForConvention(
    { zoom, tileSize: config.tileSize },
    getMaplibreZoomConvention(config)
  );

export const getSourceZoomFromMaplibreZoom = (
  zoom: number,
  config: MaplibreZoomAdapterConfig = CARMA_ZOOM_DEFAULTS
): number =>
  getEquivalentZoomForConvention(
    { zoom, tileSize: getMaplibreZoomConvention(config).tileSize },
    config
  );

export const getMaplibreZoomRangeFromSourceZoomRange = (
  range: ZoomRange,
  config: MaplibreZoomAdapterConfig = CARMA_ZOOM_DEFAULTS
): ZoomRange =>
  getEquivalentZoomRangeForConvention(
    { ...range, tileSize: range.tileSize ?? config.tileSize },
    getMaplibreZoomConvention(config)
  );

export const createMaplibreZoomAdapter = <
  TMap extends ZoomSettableMap = ZoomSettableMap
>(
  config: MaplibreZoomAdapterConfig = CARMA_ZOOM_DEFAULTS
): MaplibreZoomAdapter<TMap> => {
  const toMaplibreZoom = (sourceZoom: number): number =>
    getMaplibreZoomFromSourceZoom(sourceZoom, config);

  const toSourceZoom = (maplibreZoom: number): number =>
    getSourceZoomFromMaplibreZoom(maplibreZoom, config);

  return {
    toMaplibreZoom,
    toSourceZoom,
    getSourceZoom: (map: TMap): number => toSourceZoom(map.getZoom()),
    setZoomFromSourceZoom: (map: TMap, sourceZoom: number): void => {
      map.setZoom(toMaplibreZoom(sourceZoom));
    },
  };
};

export const createMaplibreZoomControls = <
  TMap extends ZoomSettableMap = ZoomSettableMap
>({
  getMap,
  config = CARMA_ZOOM_DEFAULTS,
}: {
  getMap: () => TMap | null | undefined;
  config?: MaplibreZoomAdapterConfig;
}): MaplibreZoomControls<TMap> => {
  const adapter = createMaplibreZoomAdapter<TMap>(config);

  return {
    setZoomFromSourceZoom: (sourceZoom: number): void => {
      const map = getMap();
      if (map) {
        adapter.setZoomFromSourceZoom(map, sourceZoom);
      }
    },
    getSourceZoom: (): number | undefined => {
      const map = getMap();
      return map ? adapter.getSourceZoom(map) : undefined;
    },
  };
};

export const createMaplibreSelectionZoomControls = <
  TMap extends ZoomSettableMap = ZoomSettableMap
>({
  getMap,
  config = {
    selectionSourceZoom: CARMA_ZOOM_DEFAULTS,
    maplibreZoom: CARMA_ZOOM_DEFAULTS.maplibreZoom,
  },
}: {
  getMap: () => TMap | null | undefined;
  config?: MaplibreSelectionZoomControlsConfig;
}): MaplibreSelectionZoomControls => {
  const controls = createMaplibreZoomControls<TMap>({
    getMap,
    config: {
      ...(config.selectionSourceZoom ?? {}),
      maplibreZoom: config.maplibreZoom ?? CARMA_ZOOM_DEFAULTS.maplibreZoom,
    },
  });

  return {
    setZoomFromSelectionSourceZoom: controls.setZoomFromSourceZoom,
    getSelectionSourceZoom: controls.getSourceZoom,
  };
};
