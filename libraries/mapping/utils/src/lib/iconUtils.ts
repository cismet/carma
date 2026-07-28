import type { Layer } from "@carma-mapping/layers";

const TWEMOJI_BASE =
  "https://cdn.jsdelivr.net/npm/emoji-datasource-twitter@15.1.2/img/twitter/64";

export const twemojiUrl = (unified: string): string =>
  `${TWEMOJI_BASE}/${unified.toLowerCase()}.png`;

export const DEFAULT_ICON_PREFIX =
  "https://geo.wuppertal.de/geoportal/geoportal_icon_legends/";

const iconPathAliases: Record<string, string> = {
  verkehr: "mobi",
};

export const mapIconPath = (path: string): string => {
  const lower = path.toLowerCase();
  return iconPathAliases[lower] ?? lower;
};

const isAbsoluteUrl = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  return value.startsWith("http://") || value.startsWith("https://");
};

/**
 * Resolves a raw icon name (or absolute URL) to a usable image URL.
 * Absolute URLs are returned unchanged; bare names get `iconPrefix` + `.png`
 * appended. Returns `undefined` for empty input.
 */
export const resolveIconUrl = (
  iconName: string | undefined,
  iconPrefix: string = DEFAULT_ICON_PREFIX
): string | undefined => {
  if (!iconName) {
    return undefined;
  }
  if (isAbsoluteUrl(iconName)) {
    return iconName;
  }
  return `${iconPrefix}${iconName}.png`;
};

/**
 * Resolves the icon URL for a given layer by digging through layerInfo, other,
 * and conf in priority order. Returns `undefined` if no icon can be determined.
 */
const pickFirstString = (
  ...candidates: unknown[]
): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
};

export const resolveLayerIconUrl = (
  layer: Layer,
  iconPrefix: string = DEFAULT_ICON_PREFIX
): string | undefined => {
  const layerInfoIcon = layer.layerInfo?.icon;
  const otherIcon = layer.other?.icon;
  const confIcon = layer.conf?.icon;

  const primaryIcon = pickFirstString(layerInfoIcon, otherIcon);
  if (primaryIcon?.startsWith("emoji:")) {
    return undefined;
  }

  const otherPath = layer.other?.path;
  const otherName = layer.other?.name;
  const pathBasedIconName =
    typeof otherPath === "string" && typeof otherName === "string"
      ? mapIconPath(otherPath) + "/" + otherName
      : undefined;

  const iconName = pickFirstString(
    primaryIcon,
    otherIcon,
    confIcon,
    pathBasedIconName
  );

  return resolveIconUrl(iconName, iconPrefix);
};
