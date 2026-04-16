import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import { FontAwesomeLikeIcon } from "./FontAwesomeLikeIcon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { faLayerGroup, faMap } from "@fortawesome/free-solid-svg-icons";
import { iconColorMap, iconMap } from "./iconMapping";
import { resolveLayerIconUrl } from "@carma-mapping/utils";

const ICON_PREFIX =
  "https://geo.wuppertal.de/geoportal/geoportal_icon_legends/";

interface LayerIconProps {
  layer: Layer | BackgroundLayer;
  iconPrefix?: string;
  fallbackIcon?: string;
  isBaseLayer?: boolean;
  id?: string;
  className?: string;
  displayUrl?: boolean;
  onError?: (title: string, url: string) => void;
}

const iconPathAliases: Record<string, string> = {
  verkehr: "mobi",
};

const mapIconPath = (path: string): string => {
  const lower = path.toLowerCase();
  return iconPathAliases[lower] ?? lower;
};

function resolveIconKey(
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const key of candidates) {
    if (key && key in iconMap) return key;
  }
  return undefined;
}

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

  const confIcon = layer.conf?.icon;
  const iconName =
    layer.other?.icon ||
    (typeof confIcon === "string" ? confIcon : undefined) ||
    (layer.other?.path && layer.other?.name
      ? mapIconPath(layer.other?.originalPath ?? layer.other.path) +
        "/" +
        layer.other.name
      : undefined);

  const iconSrc = resolveLayerIconUrl(layer, iconPrefix);

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

  const mappedKey = resolveIconKey(fallbackIcon, iconName);
  const faIcon = mappedKey
    ? iconMap[mappedKey as keyof typeof iconMap]
    : isBaseLayer
    ? faLayerGroup
    : faMap;
  const faColor = mappedKey
    ? iconColorMap[mappedKey as keyof typeof iconColorMap]
    : undefined;

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
          icon={faIcon}
          className={className + " text-base"}
          style={{ color: faColor || "" }}
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
