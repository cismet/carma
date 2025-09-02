import type { Layer } from "@carma-commons/types";
import { FontAwesomeLikeIcon } from "@carma-appframeworks/portals";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { faLayerGroup, faMap } from "@fortawesome/free-solid-svg-icons";
import { iconColorMap, iconMap } from "./iconMapping";

const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";

interface LayerIconProps {
  layer: Layer;
  iconPrefix?: string;
  fallbackIcon?: string;
  isBaseLayer?: boolean;
  id?: string;
}

export const LayerIcon = ({
  layer,
  iconPrefix = ICON_PREFIX,
  fallbackIcon,
  isBaseLayer,
  id,
}: LayerIconProps) => {
  const [imgError, setImgError] = useState(!layer.other?.icon);

  const iconName =
    layer.other?.icon ||
    layer.other?.path?.toLowerCase() + "/" + layer.other?.name;

  useEffect(() => {
    if (iconName) {
      const img = new Image();
      img.onload = () => setImgError(false);
      img.onerror = () => setImgError(true);
      img.src = iconPrefix + `${iconName}.png`;
    }
  }, [iconName]);

  return (
    <>
      {iconName && !imgError ? (
        <FontAwesomeLikeIcon
          src={iconPrefix + `${iconName}.png`}
          alt="Layer Icon"
          className="text-base"
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
          className="text-base"
          style={{ color: fallbackIcon ? iconColorMap[fallbackIcon] : "" }}
          id={id}
        />
      )}
    </>
  );
};
