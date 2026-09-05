import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * The maximum-values raster a flow animation can be shown against.
 *
 * A plain tiled WMS layer and nothing more. It is here rather than in cage
 * because it is not part of the animation: it is the same standing-water raster
 * the rain hazard map has always drawn, and showing it is ordinary WMS
 * plumbing. Only the particles are caged.
 *
 * Unlike the time series' snap layer there is no stepping and therefore no
 * source swapping, so this is one source, one layer, and a re-attach after a
 * basemap change.
 */

export type BackdropLayerOptions = {
  map: MapLibreMap;
  /** base url, everything up to and including `?SERVICE=WMS` */
  wmsUrl: string;
  layers: string;
  styles?: string;
  opacity?: number;
  format?: string;
  version?: string;
  transparent?: boolean;
  beforeId?: string;
  id?: string;
};

export type BackdropLayerHandle = {
  setOpacity: (opacity: number) => void;
  destroy: () => void;
};

const DEFAULT_ID = "flow-field-backdrop";
const DEFAULT_OPACITY = 0.85;

const tileUrl = (
  wmsUrl: string,
  layers: string,
  styles: string,
  format: string,
  version: string,
  transparent: boolean
): string => {
  const separator = wmsUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    request: "GetMap",
    service: "WMS",
    version,
    srs: "EPSG:3857",
    width: "256",
    height: "256",
    layers,
    styles,
    format,
    transparent: String(transparent),
  });
  // MapLibre substitutes the tile extent, so the placeholder has to stay
  // unencoded and is appended rather than passed through URLSearchParams.
  return `${wmsUrl}${separator}${params.toString()}&bbox={bbox-epsg-3857}`;
};

export const createBackdropLayer = (
  options: BackdropLayerOptions
): BackdropLayerHandle => {
  const {
    map,
    wmsUrl,
    layers,
    styles = "",
    format = "image/png",
    version = "1.1.1",
    transparent = true,
    beforeId,
    id = DEFAULT_ID,
  } = options;

  const sourceId = `${id}-source`;
  let opacity = options.opacity ?? DEFAULT_OPACITY;
  let destroyed = false;

  const attach = (): void => {
    if (destroyed || !map.getStyle()) return;
    if (map.getLayer(id)) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [tileUrl(wmsUrl, layers, styles, format, version, transparent)],
        tileSize: 256,
      });
    }
    map.addLayer(
      {
        id,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": opacity,
          "raster-fade-duration": 0,
        },
      },
      beforeId && map.getLayer(beforeId) ? beforeId : undefined
    );
  };

  const detach = (): void => {
    if (!map.getStyle()) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  };

  // a basemap swap throws every layer away, so it has to go back on afterwards
  const onStyleData = (): void => attach();
  map.on("styledata", onStyleData);
  attach();

  return {
    setOpacity: (next) => {
      opacity = Math.max(0, Math.min(1, next));
      if (map.getLayer(id)) {
        map.setPaintProperty(id, "raster-opacity", opacity);
      }
    },
    destroy: () => {
      destroyed = true;
      map.off("styledata", onStyleData);
      detach();
    },
  };
};
