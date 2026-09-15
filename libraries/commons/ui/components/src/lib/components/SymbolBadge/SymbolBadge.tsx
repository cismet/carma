import { useId, useMemo } from "react";

import {
  buildSymbolBadgeSvgMarkup,
  SYMBOL_BADGE_DEFAULT_SIZE_PX,
  type SymbolBadgeDimension,
} from "./symbolBadgeMarkup";

export type SymbolBadgeProps = {
  /** The signature SVG, as markup. Trusted content, it is inlined verbatim. */
  svgMarkup: string;
  /** Colour of the `bg-fill` / `bg-stroke` parts of the signature. */
  color: string;
  dimension?: SymbolBadgeDimension;
  sizePx?: number;
  foregroundColor?: string;
  className?: string;
};

/**
 * Renders a signature SVG at a given size, recoloured from the outside. See
 * `symbolBadgeMarkup.ts` for what a badge is and why the colour comes from a
 * stylesheet rather than from the file.
 */
export const SymbolBadge = ({
  svgMarkup,
  color,
  dimension,
  sizePx = SYMBOL_BADGE_DEFAULT_SIZE_PX,
  foregroundColor,
  className,
}: SymbolBadgeProps) => {
  // The stylesheet is scoped by id, so every instance needs its own, or the
  // badge rendered last decides the colour for all of them.
  const id = useId().replace(/:/g, "");

  const markup = useMemo(
    () =>
      buildSymbolBadgeSvgMarkup({
        svgMarkup,
        id,
        dimension,
        sizePx,
        color,
        foregroundColor,
      }),
    [svgMarkup, id, dimension, sizePx, color, foregroundColor]
  );

  return (
    <span
      className={className}
      // vertical-align and the zeroed line height keep the badge from adding
      // descender space to the line it sits in.
      style={{
        display: "inline-block",
        lineHeight: 0,
        verticalAlign: "middle",
      }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};

/**
 * Signature of react-cismap's `getSymbolSVG`, which its menu components call
 * with a size and a colour to render a sample marker.
 */
export type SymbolBadgeRenderer = (
  sizePx?: number,
  color?: string
) => JSX.Element;

export type SymbolBadgeRendererOptions = {
  svgMarkup: string;
  dimension?: SymbolBadgeDimension;
  /**
   * Colour to render with, regardless of what the caller passes. Needed where
   * the caller derives the colour from a data source the app no longer has.
   */
  color?: string;
  foregroundColor?: string;
};

let rendererCount = 0;

/**
 * Builds a `getSymbolSVG`-shaped function for the react-cismap menu components,
 * which still expect to be handed a renderer rather than a component.
 *
 * Each renderer gets its own stylesheet id, so two renderers with different
 * colours stay independent; the instances of one renderer share it, which is
 * harmless because they share the colour too.
 */
export const createSymbolBadgeRenderer = ({
  svgMarkup,
  dimension,
  color: fixedColor,
  foregroundColor,
}: SymbolBadgeRendererOptions): SymbolBadgeRenderer => {
  const id = `carma-symbol-badge-${(rendererCount += 1)}`;

  return (sizePx = SYMBOL_BADGE_DEFAULT_SIZE_PX, color = "#2664D8") => (
    <span
      style={{
        display: "inline-block",
        lineHeight: 0,
        verticalAlign: "middle",
      }}
      dangerouslySetInnerHTML={{
        __html: buildSymbolBadgeSvgMarkup({
          svgMarkup,
          id,
          dimension,
          sizePx,
          color: fixedColor ?? color,
          foregroundColor,
        }),
      }}
    />
  );
};

export default SymbolBadge;
