import { Color, SRGBColorSpace } from "three";

export type PreviewBackdropTint = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number
];
const unit = (value: number) => Math.max(0, Math.min(1, value));
const channel = (value: string, scale: number) =>
  unit(parseFloat(value) / (value.endsWith("%") ? 100 : scale));

/** Parse the existing CSS backdrop style once; no canvas or receiver texture is involved. */
export const previewBackdropTint = (
  style = "rgba(0, 0, 0, 0.13)"
): PreviewBackdropTint => {
  const color = style.trim();
  if (color === "transparent") return [0, 0, 0, 0];
  const rgb = /^rgba?\((.*)\)$/i.exec(color);
  if (rgb) {
    const channels = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (channels.length >= 3)
      return [
        channel(channels[0], 255),
        channel(channels[1], 255),
        channel(channels[2], 255),
        channels[3] ? channel(channels[3], 1) : 1,
      ];
  }
  let opaque = color;
  let alpha = 1;
  if (/^#[\da-f]{8}$/i.test(color)) {
    opaque = color.slice(0, 7);
    alpha = parseInt(color.slice(7), 16) / 255;
  } else if (/^#[\da-f]{4}$/i.test(color)) {
    opaque = color.slice(0, 4);
    alpha = parseInt(color[4], 16) / 15;
  }
  const value = new Color(opaque).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  return [value.r, value.g, value.b, alpha];
};
