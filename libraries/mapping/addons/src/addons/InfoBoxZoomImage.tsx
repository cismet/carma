import { useEffect } from "react";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";

/**
 * Swaps the photo of the feature info box for a configured image, depending on
 * the layer the selected feature comes from and on the MapLibre zoom.
 *
 * Headless: it only watches the map zoom and publishes, for the current zoom,
 * which layer shows which image (`infoBoxImage` channel). The info box of the
 * host app reads that channel through `resolveInfoBoxImageUrl`, which looks up
 * the selected feature's layer — so the addon needs neither the selection nor
 * the store.
 *
 * By default it replaces a photo and does not add one: a feature without a photo
 * of its own keeps its info box without image. `showOnFeaturesWithoutPhoto`
 * lifts that restriction for demos.
 *
 * Zooms are maplibre zoom levels (`map.getZoom()`), which are one level lower
 * than the leaflet zooms used elsewhere in the geoportal.
 */

/** one image with the zoom range it is shown in */
export type InfoBoxImageStep = {
  /** shown instead of the feature's own photo while this step matches */
  imageUrl: string;
  /** lowest zoom this step covers; omitted means no lower bound */
  minZoom?: number;
  /** highest zoom this step covers; omitted means no upper bound */
  maxZoom?: number;
};

export type InfoBoxZoomImageConfig = {
  /**
   * The zoom steps per layer:
   *
   * ```ts
   * rules: {
   *   poi_trinkwasser: [
   *     { maxZoom: 13, imageUrl: far },
   *     { maxZoom: 16, imageUrl: mid },
   *   ],
   *   poi_gebaeude: [{ maxZoom: 13, imageUrl: far }],
   * }
   * ```
   *
   * A key is either the layer name as in the layer catalog, e.g.
   * `"poi_trinkwasser"` (`config.ts`), or the full layer id
   * `"<serviceName>:<layerName>"`, e.g. `"wuppPOI:poi_trinkwasser"`, needed only
   * when two services carry the same layer name. Keys are compared as a whole
   * (only upper/lower case is ignored), so a part of a name such as
   * `"trinkwasser"` or `"poi"` matches nothing.
   *
   * Within a layer the first step whose zoom range contains the current zoom
   * wins; when no step matches, the feature keeps its own photo. Layers that are
   * not listed are never touched.
   */
  rules: Record<string, readonly InfoBoxImageStep[]>;
  /**
   * Demo switch: also give features that have no photo of their own an image.
   * Off (the default) the addon only replaces an existing photo, so an info box
   * that showed no image before never gains one.
   */
  showOnFeaturesWithoutPhoto?: boolean;
};

/**
 * payload of the `infoBoxImage` channel: the image every configured layer shows
 * at the current zoom, keyed by the lower-cased config key
 */
export type InfoBoxImageState = {
  urlByLayer: Record<string, string>;
  /** see `showOnFeaturesWithoutPhoto` */
  allowWithoutPhoto: boolean;
};

/** nothing is replaced: published when the addon unmounts */
const IDLE: InfoBoxImageState = { urlByLayer: {}, allowWithoutPhoto: false };

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
 * own photo applies — because no step covers the current zoom, the feature's
 * layer is not configured, or the addon is not part of the route at all.
 *
 * `hasOwnPhoto` says whether the feature shows a photo without this addon; a
 * feature without one is only given an image when the route asked for it with
 * `showOnFeaturesWithoutPhoto`.
 */
export const resolveInfoBoxImageUrl = (
  state: InfoBoxImageState | undefined,
  feature: SelectedFeatureLike,
  hasOwnPhoto: boolean
): string | null => {
  const layerId = getFeatureLayerId(feature)?.toLowerCase();
  if (!state || !layerId) {
    return null;
  }
  if (!hasOwnPhoto && !state.allowWithoutPhoto) {
    return null;
  }
  // a key given as a full id matches the first, one given as a name the second
  return (
    state.urlByLayer[layerId] ?? state.urlByLayer[getLayerName(layerId)] ?? null
  );
};

/** what every configured layer shows at this zoom; layers without a step drop out */
const urlByLayerAtZoom = (
  rules: Record<string, readonly InfoBoxImageStep[]>,
  zoom: number
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [layer, steps] of Object.entries(rules)) {
    const step = steps.find(
      (candidate) =>
        zoom >= (candidate.minZoom ?? Number.NEGATIVE_INFINITY) &&
        zoom <= (candidate.maxZoom ?? Number.POSITIVE_INFINITY)
    );
    if (step) {
      result[layer.trim().toLowerCase()] = step.imageUrl;
    }
  }
  return result;
};

export const InfoBoxZoomImage = ({
  config,
  libreMap,
}: AddonComponentProps<"infoBoxZoomImage">) => {
  const [, setImage] = useAddonState("infoBoxImage");

  const rules = config?.rules;
  const allowWithoutPhoto = config?.showOnFeaturesWithoutPhoto === true;
  // a stable dependency for the configured rules, which are new objects per render
  const rulesKey = JSON.stringify(rules ?? {});

  useEffect(() => {
    if (!libreMap || !rules || !Object.keys(rules).length) {
      return;
    }
    // the steps are known upfront, so the images are in the browser cache
    // before a zoom step makes one of them visible
    for (const steps of Object.values(rules)) {
      for (const step of steps) {
        new Image().src = step.imageUrl;
      }
    }

    // only publish when the outcome changes, so zooming does not re-render the
    // info box on every frame
    let published: string | null = null;
    const publish = () => {
      const urlByLayer = urlByLayerAtZoom(rules, libreMap.getZoom());
      const signature = JSON.stringify(urlByLayer);
      if (signature === published) {
        return;
      }
      published = signature;
      setImage({ urlByLayer, allowWithoutPhoto });
    };
    publish();
    libreMap.on("zoom", publish);
    return () => {
      libreMap.off("zoom", publish);
      setImage(IDLE);
    };
    // rulesKey stands for rules: the object identity changes on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libreMap, rulesKey, allowWithoutPhoto, setImage]);

  return null;
};
