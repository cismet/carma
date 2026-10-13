import type { ReactNode } from "react";

/** An area value whose area lies behind something shows at half strength. */
export const AREA_LABEL_OCCLUDED_OPACITY = 0.5;

export type AreaLabelSize = { width: number; height: number };

/** A first guess at an area value's drawn size, before it was ever measured. */
export const estimateAreaLabelSize = (content: ReactNode): AreaLabelSize => {
  const text = typeof content === "string" ? content : String(content ?? "");
  return { width: text.length * 8.5, height: 18 };
};

/** The glyphs' size only: the text's padding, halo and backdrop may reach over the area's edges. */
export const measureAreaLabelGlyphs = (
  elementDiv: HTMLElement
): AreaLabelSize | null => {
  const text = elementDiv.firstElementChild as HTMLElement | null;
  if (!text || text.offsetWidth <= 0) {
    return null;
  }

  const style = getComputedStyle(text);
  const width =
    text.offsetWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  const height =
    text.offsetHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);
  return width > 0 && height > 0 ? { width, height } : null;
};
