import { useEffect } from "react";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";

/**
 * Swaps the photo of the feature info box for a configured image while the
 * MapLibre map is inside a zoom range.
 *
 * Headless: it only watches the map zoom and publishes the url that applies on
 * the `infoBoxImage` channel. The info box of the host app reads that channel
 * through `resolveInfoBoxImageUrl`, which decides whether the currently
 * selected feature belongs to one of the configured layers — so the addon needs
 * neither the selection nor the store.
 *
 * Zooms are maplibre zoom levels (`map.getZoom()`), which are one level lower
 * than the leaflet zooms used elsewhere in the geoportal.
 */

export type InfoBoxZoomImageConfig = {
  /**
   * Layers the replacement applies to. Each entry is matched
   * case-insensitively as a substring against the catalog layer id, the vector
   * source, the vector tile's source layer and the style layer id of the
   * selected feature, so `"trinkwasser"` covers `poi:poi_trinkwasser` as well
   * as a `trinkwasserbrunnen` source layer. Without an entry nothing is
   * replaced.
   */
  layers: readonly string[];
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
  /** the layer patterns the url applies to; see `InfoBoxZoomImageConfig` */
  layers: readonly string[];
};

/** nothing is replaced: published when the addon unmounts */
const IDLE: InfoBoxImageState = { url: null, layers: [] };

/** the feature fields a layer pattern is matched against */
export type SelectedFeatureLike = {
  id?: unknown;
  sourceFeature?: {
    source?: unknown;
    sourceLayer?: unknown;
    layer?: { id?: unknown; metadata?: unknown };
  } | null;
} | null;

const layerNamesOf = (feature: SelectedFeatureLike): string[] => {
  const source = feature?.sourceFeature;
  const metadata = source?.layer?.metadata as
    | Record<string, unknown>
    | undefined;
  return [
    feature?.id,
    source?.source,
    source?.sourceLayer,
    source?.layer?.id,
    metadata?.["layer-id"],
  ]
    .filter((value): value is string => typeof value === "string" && !!value)
    .map((value) => value.toLowerCase());
};

/**
 * The url the info box should show for this feature, or null when the feature's
 * own photo applies — because the zoom is outside the range, the feature is not
 * from a configured layer, or the addon is not part of the route at all.
 */
export const resolveInfoBoxImageUrl = (
  state: InfoBoxImageState | undefined,
  feature: SelectedFeatureLike
): string | null => {
  if (!state?.url || !state.layers.length || !feature) {
    return null;
  }
  const names = layerNamesOf(feature);
  const matches = state.layers.some((pattern) => {
    const needle = pattern.toLowerCase();
    return !!needle && names.some((name) => name.includes(needle));
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
  const layerKey = (config?.layers ?? []).join("|");

  useEffect(() => {
    if (!libreMap || !imageUrl) {
      return;
    }
    const layers = layerKey ? layerKey.split("|") : [];
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
      setImage({ url: next ? imageUrl : null, layers });
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
