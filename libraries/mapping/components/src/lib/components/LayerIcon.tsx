import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import { FontAwesomeLikeIcon } from "./FontAwesomeLikeIcon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { faLayerGroup, faMap } from "@fortawesome/free-solid-svg-icons";
import { iconColorMap, iconMap } from "./iconMapping";
import {
  DEFAULT_ICON_PREFIX,
  mapIconPath,
  resolveLayerIconUrl,
  twemojiUrl,
} from "@carma-mapping/utils";
import { useImageFallback } from "@carma-commons/utils";

interface LayerIconProps {
  layer: Layer | BackgroundLayer;
  iconPrefix?: string;
  fallbackIcon?: string;
  isBaseLayer?: boolean;
  id?: string;
  className?: string;
  /** Overrides the colour `iconColorMap` would give the icon. */
  color?: string;
  /** CSS length for the icon; FontAwesome scales with the font size. */
  size?: string;
  displayUrl?: boolean;
  /** Try our mirror when the original icon host fails, defaults to true */
  fallback?: boolean;
  onError?: (title: string, url: string) => void;
}

function resolveIconKey(
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const key of candidates) {
    if (key && key in iconMap) return key;
  }
  return undefined;
}

const EMOJI_PREFIX = "emoji:";

export const LayerIcon = ({
  layer,
  iconPrefix = DEFAULT_ICON_PREFIX,
  fallbackIcon,
  isBaseLayer,
  id,
  className,
  color,
  size,
  displayUrl = false,
  fallback = true,
  onError,
}: LayerIconProps) => {
  const icon = (layer.layerInfo?.icon as string) || layer.other?.icon;
  const emoji =
    typeof icon === "string" && icon.startsWith(EMOJI_PREFIX)
      ? icon.slice(EMOJI_PREFIX.length)
      : null;

  const [imgError, setImgError] = useState(!icon);

  const confIcon = layer.conf?.icon;
  const iconName =
    icon ||
    (typeof confIcon === "string" ? confIcon : undefined) ||
    (layer.other?.path && layer.other?.name
      ? mapIconPath(layer.other?.originalPath ?? layer.other.path) +
        "/" +
        layer.other.name
      : undefined);

  const iconFallback = useImageFallback(resolveLayerIconUrl(layer, iconPrefix), {
    enabled: fallback,
  });
  const iconSrc = iconFallback.src;

  useEffect(() => {
    if (!iconSrc) {
      return;
    }
    const img = new Image();
    img.onload = () => {
      iconFallback.onLoad();
      setImgError(false);
    };
    img.onerror = () => {
      if (iconFallback.isLastCandidate) {
        setImgError(true);
        if (onError) {
          onError(layer.title, iconSrc);
        }
      }
      iconFallback.onError();
    };
    img.src = iconSrc;
    return () => {
      // a timed out candidate may still settle later
      img.onload = null;
      img.onerror = null;
    };
  }, [iconSrc]);

  const mappedKey = resolveIconKey(fallbackIcon, iconName);
  const faIcon = mappedKey
    ? iconMap[mappedKey as keyof typeof iconMap]
    : isBaseLayer
    ? faLayerGroup
    : faMap;
  const faColor =
    layer.iconColor ??
    color ??
    (mappedKey
      ? iconColorMap[mappedKey as keyof typeof iconColorMap]
      : undefined);
  const fontSize = layer.iconSize ?? size;

  if (emoji) {
    return (
      <FontAwesomeLikeIcon
        src={twemojiUrl(emoji)}
        alt="Layer Icon"
        className={(className ?? "") + " text-base"}
        blendMode="normal"
        id={id}
      />
    );
  }

  return (
    <>
      {iconSrc && !imgError ? (
        <FontAwesomeLikeIcon
          src={iconSrc}
          alt="Layer Icon"
          className={className + " text-base"}
          style={fontSize ? { fontSize } : undefined}
          id={id}
        />
      ) : (
        <FontAwesomeIcon
          icon={faIcon}
          className={className + " text-base"}
          style={{ color: faColor || "", ...(fontSize ? { fontSize } : {}) }}
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
