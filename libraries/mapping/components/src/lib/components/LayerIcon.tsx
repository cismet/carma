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
  displayUrl?: boolean;
  onError?: (title: string, url: string) => void;
}

const isUrl = (str: string | undefined): boolean => {
  if (!str) return false;
  return str.startsWith("http://") || str.startsWith("https://");
};

const iconPathAliases: Record<string, string> = {
  verkehr: "mobi",
};

const mapIconPath = (path: string): string => {
  const lower = path.toLowerCase();
  return iconPathAliases[lower] ?? lower;
};

export const LayerIcon = ({
  layer,
  iconPrefix = ICON_PREFIX,
  fallbackIcon,
  isBaseLayer,
  id,
  className,
  displayUrl = false,
  onError,
}: LayerIconProps) => {
  const [imgError, setImgError] = useState(!layer.other?.icon);

  const iconName =
    layer.other?.icon ||
    layer.conf?.icon ||
    (layer.other?.path && layer.other?.name
      ? mapIconPath(layer.other.path) + "/" + layer.other.name
      : undefined);

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
      img.onerror = () => {
        setImgError(true);
        if (onError) {
          onError(layer.title, iconSrc);
        }
      };
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
      {displayUrl && iconSrc && (
        <div
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "#718096",
            wordBreak: "break-all",
            marginTop: 8,
            padding: "2px 6px",
            backgroundColor: "#f0f2f5",
            borderRadius: 4,
          }}
        >
          {iconSrc}
        </div>
      )}
    </>
  );
};
