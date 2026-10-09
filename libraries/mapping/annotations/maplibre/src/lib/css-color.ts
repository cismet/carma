import { Color, SRGBColorSpace } from "three";

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` to a Three colour and opacity. */
export const parseCssColor = (
  css: string
): { color: Color; opacity: number } => {
  const value = css.trim();
  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
  );
  if (rgba) {
    const alpha = rgba[4];
    const opacity =
      alpha === undefined
        ? 1
        : alpha.endsWith("%")
        ? Number.parseFloat(alpha) / 100
        : Number.parseFloat(alpha);
    return {
      // CSS channels are sRGB; the constructor would read them as linear.
      color: new Color().setRGB(
        Number.parseFloat(rgba[1]!) / 255,
        Number.parseFloat(rgba[2]!) / 255,
        Number.parseFloat(rgba[3]!) / 255,
        SRGBColorSpace
      ),
      opacity: Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1,
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
