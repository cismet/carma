import type { BackgroundLayer, Item, Layer } from "@carma-mapping/layers";

export type FavoriteLayer = BackgroundLayer | Layer;

export const canFavoriteLayer = ({
  isBaseLayer,
  layer,
}: {
  isBaseLayer: boolean;
  layer: FavoriteLayer;
}): boolean =>
  !isBaseLayer && (layer.type === "layer" || layer.type === "object");

export const isFavoriteLayer = ({
  favorites,
  layer,
}: {
  favorites: readonly Item[];
  layer: FavoriteLayer;
}): boolean =>
  favorites.some(
    (favorite) => favorite.id === `fav_${layer.id}` || favorite.id === layer.id
  );

export const buildLayerFavoriteItem = (layer: FavoriteLayer): Item => {
  const other = layer.other ?? {};
  const layerInfo = layer.layerInfo ?? {};

  return {
    title: layer.title,
    description: layer.description ?? "",
    id: layer.id,
    serviceName: other.serviceName ?? "custom",
    type: layer.type,
    tags: other.tags ?? layerInfo.tags,
    thumbnail: other.thumbnail ?? layerInfo.thumbnail,
    keywords: other.keywords ?? layerInfo.keywords,
    icon: other.icon ?? layer.icon,
    alternativeIcon: other.alternativeIcon,
    service: other.service,
    name: other.name,
    path: other.path,
    originalPath: other.originalPath,
    vectorLegend: other.vectorLegend ?? (layerInfo.vectorLegend as string),
    vectorStyle:
      (layerInfo.vectorStyle as string) ?? (layer.props?.style as string),
    props: {
      Style: layer.props?.legend
        ? [{ LegendURL: layer.props.legend }]
        : undefined,
      MetadataURL: layer.props?.metaData,
    },
  } as Item;
};
