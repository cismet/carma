import { useEffect } from "react";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";

/**
 * Swaps the photo of the feature info box for a configured image while the
 * MapLibre map is inside a zoom range.
 *
 * Headless: it only watches the map zoom and publishes the url that applies on
 * the `infoBoxImage` channel. The info box of the host app reads that channel
 * through `resolveInfoBoxImageUrl`, which decides whether the selected feature
 * belongs to one of the configured layers — so the addon needs neither the
 * selection nor the store.
 *
 * Zooms are maplibre zoom levels (`map.getZoom()`), which are one level lower
 * than the leaflet zooms used elsewhere in the geoportal.
 */

export type InfoBoxZoomImageConfig = {
  /**
   * The layers the replacement applies to, one entry per layer. An entry is
   * either
   * - the layer name as in the layer catalog, e.g. `"poi_trinkwasser"`
   *   (`config.ts`), or
   * - the full layer id `"<serviceName>:<layerName>"`, e.g.
   *   `"wuppPOI:poi_trinkwasser"`, needed only when two services carry the same
   *   layer name.
   *
   * Both are compared exactly (only upper/lower case is ignored), so a part of
   * a name such as `"trinkwasser"` or `"poi"` matches nothing.
   *
   * An empty list replaces nothing.
   */
  layerIds: readonly string[];
  /** shown instead of the feature's own photo while the zoom range matches */
  imageUrl: string;
  /** lowest zoom the replacement is shown at; omitted means no lower bound */
  minZoom?: number;
  /** highest zoom the replacement is shown at; omitted means no upper bound */
  maxZoom?: number;
};

/** payload of the `infoBoxImage` channel */
export type InfoBoxImageState = {
  /** the replacement url, or null while the feature's own photo applies */
  url: string | null;
  /** the layer ids the url applies to; see `InfoBoxZoomImageConfig` */
  layerIds: readonly string[];
};

/** nothing is replaced: published when the addon unmounts */
const IDLE: InfoBoxImageState = { url: null, layerIds: [] };

/** the feature fields the layer id is read from */
export type SelectedFeatureLike = {
  id?: unknown;
  sourceFeature?: {
    layer?: { metadata?: unknown };
  } | null;
} | null;

/**
 * The catalog layer id of a selected feature, e.g. `"wuppPOI:poi_trinkwasser"`.
 * Primary source is the `metadata["layer-id"]` stamp `styleComposer` writes on
 * every style layer; for features built by the geoportal's feature-info flow the
 * feature id is that same layer id.
 */
const getFeatureLayerId = (feature: SelectedFeatureLike): string | null => {
  const metadata = feature?.sourceFeature?.layer?.metadata as
    | Record<string, unknown>
    | undefined;
  const stamped = metadata?.["layer-id"];
  if (typeof stamped === "string" && stamped) {
    return stamped;
  }
  return typeof feature?.id === "string" && feature.id ? feature.id : null;
};

/**
 * The layer name of a layer id: `"wuppPOI:poi_trinkwasser"` -> `"poi_trinkwasser"`.
 * Ids without a service prefix are returned unchanged.
 */
const getLayerName = (layerId: string): string =>
  layerId.slice(layerId.indexOf(":") + 1);

/**
 * The url the info box should show for this feature, or null when the feature's
 * own photo applies — because the zoom is outside the range, the feature is not
 * from a configured layer, or the addon is not part of the route at all.
 */
export const resolveInfoBoxImageUrl = (
  state: InfoBoxImageState | undefined,
  feature: SelectedFeatureLike
): string | null => {
  if (!state?.url || !state.layerIds.length) {
    return null;
  }
  const layerId = getFeatureLayerId(feature)?.toLowerCase();
  if (!layerId) {
    return null;
  }
  const layerName = getLayerName(layerId);
  const matches = state.layerIds.some((entry) => {
    const configured = entry.trim().toLowerCase();
    // a configured full id must equal the id, a configured name the name
    return configured.includes(":")
      ? configured === layerId
      : configured === layerName;
  });
  return matches ? state.url : null;
};

export const InfoBoxZoomImage = ({
  config,
  libreMap,
}: AddonComponentProps<"infoBoxZoomImage">) => {
  const [, setImage] = useAddonState("infoBoxImage");

  const imageUrl = config?.imageUrl;
  const minZoom = config?.minZoom ?? Number.NEGATIVE_INFINITY;
  const maxZoom = config?.maxZoom ?? Number.POSITIVE_INFINITY;
  // a stable dependency for the configured list, which is a new array per render
  const layerKey = (config?.layerIds ?? []).join("|");

  useEffect(() => {
    if (!libreMap || !imageUrl) {
      return;
    }
    const layerIds = layerKey ? layerKey.split("|") : [];
    // only publish when the rule flips, so zooming does not re-render the
    // info box on every frame
    let inRange: boolean | null = null;
    const publish = () => {
      const zoom = libreMap.getZoom();
      const next = zoom >= minZoom && zoom <= maxZoom;
      if (next === inRange) {
        return;
      }
      inRange = next;
      setImage({ url: next ? imageUrl : null, layerIds });
    };
    publish();
    libreMap.on("zoom", publish);
    return () => {
      libreMap.off("zoom", publish);
      setImage(IDLE);
    };
  }, [libreMap, imageUrl, layerKey, minZoom, maxZoom, setImage]);

  return null;
};
