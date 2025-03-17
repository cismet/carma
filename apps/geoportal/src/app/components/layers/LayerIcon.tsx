import { Layer } from "@carma-mapping/layers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { ICON_PREFIX } from "../../config/app.config";
import { iconColorMap, iconMap } from "./items";
import { faLayerGroup, faMap } from "@fortawesome/free-solid-svg-icons";

interface LayerIconProps {
  layer: Layer;
  fallbackIcon?: string;
  isBaseLayer?: boolean;
}

const LayerIcon = ({ layer, fallbackIcon, isBaseLayer }: LayerIconProps) => {
  const [imgError, setImgError] = useState(!layer.other?.icon);

  const iconName =
    layer.other?.icon || layer.other?.path + "/" + layer.other?.name;

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
        <div style={{ height: 14, width: 14 }}>
          <img
            src={ICON_PREFIX + `${iconName}.png`}
            alt="Icon"
            className="h-full"
          />
        </div>
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
          id="icon"
        />
      )}
    </>
  );
};

export default LayerIcon;
