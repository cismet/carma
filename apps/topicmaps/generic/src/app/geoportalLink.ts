import { serviceConfig } from "@carma-mapping/layers";
import { storeMappingConfig } from "@carma-appframeworks/portals";
import { getHashParams } from "@carma-commons/utils";

const LIVE_GEOPORTAL_URL =
  "https://digital-twin-wuppertal-live.github.io/geoportal/";
const DEV_GEOPORTAL_URL = "https://carma-dev-deployments.github.io/geoportal/";

/** The parts of a `tm.vectorLayers` entry that name its geoportal layer. */
type GtmVectorLayer = {
  /** the layer's geoportal catalog id, for layers the id cannot be derived for */
  geoportalId?: string;
  capabilities?: string;
  capabilitiesLayer?: string;
};

/** origin and path of a service url, `undefined` for one that is no absolute url */
const serviceUrlKey = (url: string | undefined) => {
  if (!url || !URL.canParse(url)) {
    return undefined;
  }
  const { origin, pathname } = new URL(url);
  return origin + pathname.replace(/\/+$/, "");
};

const serviceNameByUrl = new Map<string, string>();
for (const service of Object.values(serviceConfig)) {
  const key = serviceUrlKey(service.url);
  if (key) {
    serviceNameByUrl.set(key, service.name);
  }
}

/**
 * The geoportal catalog id of a topicmap layer: its `geoportalId`, else
 * `<serviceName>:<layerName>` for a layer from a service the catalog knows.
 */
const toCatalogId = (layer: GtmVectorLayer): string | undefined => {
  if (layer.geoportalId) {
    return layer.geoportalId;
  }
  if (!layer.capabilities || !layer.capabilitiesLayer) {
    return undefined;
  }
  const key = serviceUrlKey(layer.capabilities);
  const serviceName = key ? serviceNameByUrl.get(key) : undefined;
  return serviceName ? `${serviceName}:${layer.capabilitiesLayer}` : undefined;
};

/**
 * Stores the topicmap's layers as catalog ids and returns the geoportal url
 * that opens them at the topicmap's current view. The geoportal resolves the
 * ids in its catalog, so the layers arrive as if picked there. The live
 * topicmap links the live geoportal, every other deployment the dev one.
 */
export const createGeoportalLink = async (
  vectorLayers: GtmVectorLayer[],
  isLive: boolean
): Promise<string> => {
  const catalogLayerIds: string[] = [];
  for (const layer of vectorLayers) {
    const id = toCatalogId(layer);
    if (id) {
      catalogLayerIds.push(id);
    } else {
      console.warn("[GTM→GEOPORTAL] layer skipped, no catalog id", { layer });
    }
  }
  if (catalogLayerIds.length === 0) {
    throw new Error("no layer has a geoportal catalog id");
  }
  const key = await storeMappingConfig({ layers: [], catalogLayerIds });
  if (!key) {
    throw new Error("storing the configuration returned no key");
  }

  const { lat, lng, zoom } = getHashParams();
  const params = new URLSearchParams();
  if (lat && lng && zoom) {
    params.set("lat", lat);
    params.set("lng", lng);
    params.set("zoom", zoom);
  }
  params.set("config", key);
  params.set("appKey", "sharedurl");

  const baseUrl = isLive ? LIVE_GEOPORTAL_URL : DEV_GEOPORTAL_URL;
  return `${baseUrl}#/?${params.toString()}`;
};
