export type LayerFavoriteToggleLabels = {
  add: string;
  remove: string;
};

export type LayerFavoriteToggleTestIds = {
  add: string;
  remove: string;
};

export type LayerFavoriteToggleProps = {
  favoriteToggleLabels: LayerFavoriteToggleLabels;
  favoriteToggleTestIds?: LayerFavoriteToggleTestIds;
  isFavorite: boolean;
  onToggleFavorite: () => void;
};

export const DEFAULT_LAYER_FAVORITE_TOGGLE_LABELS: LayerFavoriteToggleLabels = {
  add: "Favorisieren",
  remove: "Favorit entfernen",
};
