import type { Layer } from "@carma-mapping/layers";

const TWEMOJI_BASE =
  "https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.1.2/img/twitter/64";

export const twemojiUrl = (unified: string): string =>
  `${TWEMOJI_BASE}/${unified.toLowerCase()}.png`;

const iconPathAliases: Record<string, string> = {
  verkehr: "mobi",
};

const mapIconPath = (path: string): string => {
  const lower = path.toLowerCase();
  return iconPathAliases[lower] ?? lower;
};

const isUrl = (str: string | undefined): boolean => {
  if (!str) return false;
  return str.startsWith("http://") || str.startsWith("https://");
};

/**
 * Resolves the icon URL for a given layer.
 * Returns `undefined` if no icon can be determined.
 */
export const resolveLayerIconUrl = (
  layer: Layer,
  iconPrefix: string
): string | undefined => {
  const icon =
    (layer.layerInfo?.icon as string | undefined) || layer.other?.icon;
  if (typeof icon === "string" && icon.startsWith("emoji:")) {
    return undefined;
  }

  const iconName =
    icon ||
    layer.other?.icon ||
    layer.conf?.icon ||
    (layer.other?.path && layer.other?.name
      ? mapIconPath(layer.other.path) + "/" + layer.other.name
      : undefined);

  if (!iconName) return undefined;

  return isUrl(icon) ? icon : iconPrefix + `${iconName}.png`;
};
