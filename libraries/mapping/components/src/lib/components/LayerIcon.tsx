import type { Layer } from "@carma/types";
import { FontAwesomeLikeIcon } from "./FontAwesomeLikeIcon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { faLayerGroup, faMap } from "@fortawesome/free-solid-svg-icons";
import { iconColorMap, iconMap } from "./iconMapping";

const ICON_PREFIX =
  import.meta.env.VITE_WUPP_ASSET_BASEURL +
  "/geoportal/geoportal_icon_legends/";

interface LayerIconProps {
  layer: Layer;
  iconPrefix?: string;
  fallbackIcon?: string;
  isBaseLayer?: boolean;
  id?: string;
  className?: string;
}

const isUrl = (str: string | undefined): boolean => {
  if (!str) return false;
  return str.startsWith("http://") || str.startsWith("https://");
};

export const LayerIcon = ({
  layer,
  iconPrefix = ICON_PREFIX,
  fallbackIcon,
  isBaseLayer,
  id,
  className,
}: LayerIconProps) => {
  const [imgError, setImgError] = useState(!layer.other?.icon);

  const iconName =
    layer.other?.icon ||
    layer.other?.path?.toLowerCase() + "/" + layer.other?.name;

  const isIconUrl = isUrl(layer.other?.icon);
  const iconSrc = isIconUrl
    ? layer.other?.icon
    : iconName
    ? iconPrefix + `${iconName}.png`
    : undefined;

  useEffect(() => {
    if (iconSrc) {
      const img = new Image();
      img.onload = () => setImgError(false);
      img.onerror = () => setImgError(true);
      img.src = iconSrc;
    }
  }, [iconSrc]);

  return (
    <>
      {iconSrc && !imgError ? (
        <FontAwesomeLikeIcon
          src={iconSrc}
          alt="Layer Icon"
          className={className + " text-base"}
          id={id}
        />
      ) : (
        <FontAwesomeIcon
          icon={
            fallbackIcon
              ? iconMap[fallbackIcon]
              : isBaseLayer
              ? faLayerGroup
              : faMap
          }
          className={className + " text-base"}
          style={{ color: fallbackIcon ? iconColorMap[fallbackIcon] : "" }}
          id={id}
        />
      )}
    </>
  );
};
