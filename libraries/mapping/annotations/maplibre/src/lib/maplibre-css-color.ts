import { Color, SRGBColorSpace } from "three";

const parseAlpha = (alpha: string | undefined) => {
  if (alpha === undefined) return 1;
  const opacity = alpha.endsWith("%")
    ? Number.parseFloat(alpha) / 100
    : Number.parseFloat(alpha);
  return Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1;
};

/** CSS channels are sRGB; the constructor would read them as linear. */
const fromSrgbChannels = (
  red: string,
  green: string,
  blue: string,
  scale = 1
) =>
  new Color().setRGB(
    Number.parseFloat(red) / scale,
    Number.parseFloat(green) / scale,
    Number.parseFloat(blue) / scale,
    SRGBColorSpace
  );

/**
 * `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `transparent` and
 * `color(srgb | display-p3 r g b / a)` to a Three colour and opacity. The
 * canvas is sRGB, so display-p3 channels are read as sRGB (white stays white).
 */
export const parseCssColor = (
  css: string
): { color: Color; opacity: number } => {
  const value = css.trim();
  if (value.toLowerCase() === "transparent") {
    return { color: new Color(0, 0, 0), opacity: 0 };
  }
  const colorFunction = value.match(
    /^color\(\s*(?:srgb|display-p3)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i
  );
  if (colorFunction) {
    return {
      color: fromSrgbChannels(
        colorFunction[1]!,
        colorFunction[2]!,
        colorFunction[3]!
      ),
      opacity: parseAlpha(colorFunction[4]),
    };
  }
  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
  );
  if (rgba) {
    return {
      color: fromSrgbChannels(rgba[1]!, rgba[2]!, rgba[3]!, 255),
      opacity: parseAlpha(rgba[4]),
    };
  }
  const hex8 = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
  if (hex8) {
    return {
      color: new Color(`#${hex8[1]}`),
      opacity: Number.parseInt(hex8[2]!, 16) / 255,
    };
  }
  const hex4 = value.match(/^#([0-9a-f]{3})([0-9a-f])$/i);
  if (hex4) {
    return {
      color: new Color(`#${hex4[1]}`),
      opacity: Number.parseInt(hex4[2]! + hex4[2]!, 16) / 255,
    };
  }
  return { color: new Color(value), opacity: 1 };
};
