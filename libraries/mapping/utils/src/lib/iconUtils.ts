import type { Layer } from "@carma/types";

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
  const iconName =
    layer.other?.icon ||
    layer.conf?.icon ||
    (layer.other?.path && layer.other?.name
      ? mapIconPath(layer.other.path) + "/" + layer.other.name
      : undefined);

  if (!iconName) return undefined;

  return isUrl(layer.other?.icon)
    ? layer.other?.icon
    : iconPrefix + `${iconName}.png`;
};
