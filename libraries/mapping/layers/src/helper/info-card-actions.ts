import type { Item } from "../lib/contracts/carma-layers.d";

const GEOPORTAL_PUBLISHING_GROUP = "_Geoportal_Publizieren";

export type InfoCardActionState = {
  allowPublishing: boolean;
  canFavoriteItem: boolean;
  isDiscoverItem: boolean;
};

export const isDiscoverLayerItem = (layer: Item): boolean =>
  layer.serviceName.includes("discover");

export const canFavoriteLayerItem = (layer: Item): boolean =>
  layer.type !== "collection" ||
  (layer.type === "collection" && isDiscoverLayerItem(layer));

export const resolveInfoCardActionState = ({
  jwt,
  layer,
  userGroups,
}: {
  jwt?: string | null;
  layer: Item;
  userGroups: readonly string[];
}): InfoCardActionState => {
  const isDiscoverItem = isDiscoverLayerItem(layer);

  return {
    allowPublishing: userGroups.includes(GEOPORTAL_PUBLISHING_GROUP) && !!jwt,
    canFavoriteItem: canFavoriteLayerItem(layer),
    isDiscoverItem,
  };
};
