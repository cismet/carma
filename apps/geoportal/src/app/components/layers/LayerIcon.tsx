import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faMap } from "@fortawesome/free-solid-svg-icons";

import type { Layer } from "@carma-commons/types";

import { ICON_PREFIX } from "../../config/app.config";
import { iconColorMap, iconMap } from "./items";
import { FontAwesomeLikeIcon } from "@carma-apps/portals";

interface LayerIconProps {
  layer: Layer;
  fallbackIcon?: string;
  isBaseLayer?: boolean;
  id?: string;
}

const LayerIcon = ({
  layer,
  fallbackIcon,
  isBaseLayer,
  id,
}: LayerIconProps) => {
  const [imgError, setImgError] = useState(!layer.other?.icon);

  const iconName =
    layer.other?.icon ||
    layer.other?.path.toLowerCase() + "/" + layer.other?.name;

  useEffect(() => {
    if (iconName) {
      const img = new Image();
      img.onload = () => setImgError(false);
      img.onerror = () => setImgError(true);
      img.src = ICON_PREFIX + `${iconName}.png`;
    }
  }, [iconName]);

  return (
    <>
      {iconName && !imgError ? (
        <FontAwesomeLikeIcon
          src={ICON_PREFIX + `${iconName}.png`}
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
          style={{ color: iconColorMap[fallbackIcon] }}
          id={id}
        />
      )}
    </>
  );
};

export default LayerIcon;
