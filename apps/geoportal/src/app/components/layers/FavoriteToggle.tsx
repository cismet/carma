import { faStar as regularFaStar } from "@fortawesome/free-regular-svg-icons";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, type MouseEvent } from "react";

import type { LayerFavoriteToggleProps } from "./layer-favorite-toggle-props";

const FavoriteToggle = ({
  favoriteToggleLabels,
  favoriteToggleTestIds,
  isFavorite,
  onToggleFavorite,
}: LayerFavoriteToggleProps) => {
  const label = isFavorite
    ? favoriteToggleLabels.remove
    : favoriteToggleLabels.add;
  const handleToggleFavorite = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggleFavorite();
    },
    [onToggleFavorite]
  );

  return (
    <button
      className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
      onClick={handleToggleFavorite}
      title={label}
      aria-label={label}
      data-test-id={
        isFavorite ? favoriteToggleTestIds?.remove : favoriteToggleTestIds?.add
      }
    >
      <FontAwesomeIcon
        icon={isFavorite ? faStar : regularFaStar}
        className={isFavorite ? "text-yellow-400" : ""}
      />
    </button>
  );
};

export default FavoriteToggle;
