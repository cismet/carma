/**
 * Markup for a "symbol badge": a signature SVG drawn at a given pixel size and
 * recoloured from the outside.
 *
 * A badge is a small SVG whose shapes are tagged with the classes `bg-fill`,
 * `bg-stroke`, `fg-fill` and `fg-stroke` instead of carrying their final
 * colours. The builder wraps such a signature in a sized `<svg>` and injects a
 * stylesheet that paints the background parts in the requested colour and the
 * foreground parts in the foreground colour. Because a CSS rule beats a
 * presentation attribute, the colours baked into the signature file are
 * overridden without touching its markup.
 *
 * This is the carma-side replacement for react-cismap's `getSymbolSVGGetter`
 * (`react-cismap/tools/uiHelper`), kept geometry-compatible with it so that a
 * migrated app renders the same marker as its Leaflet predecessor.
 */

/** Default rendered edge length of the badge, in pixels. */
export const SYMBOL_BADGE_DEFAULT_SIZE_PX = 30;

/** Assumed viewBox of a signature that does not declare its own dimension. */
export const SYMBOL_BADGE_DEFAULT_DIMENSION = { width: 24, height: 24 };

/** Colour of the `fg-fill` / `fg-stroke` parts. */
export const SYMBOL_BADGE_DEFAULT_FOREGROUND_COLOR = "white";

/**
 * The class names a signature uses to mark which of its shapes are recoloured.
 * Shapes without one of these classes keep the colours in the file.
 */
export const SYMBOL_BADGE_CLASS_NAMES = {
  backgroundFill: "bg-fill",
  backgroundStroke: "bg-stroke",
  foregroundFill: "fg-fill",
  foregroundStroke: "fg-stroke",
} as const;

/**
 * Intrinsic size of the signature, i.e. its viewBox. SVG attributes arrive as
 * strings, so both forms are accepted.
 */
export type SymbolBadgeDimension = {
  width: number | string;
  height: number | string;
};

export type SymbolBadgeMarkupOptions = {
  /** The signature SVG, as markup. Trusted content, it is inlined verbatim. */
  svgMarkup: string;
  /**
   * Scopes the injected stylesheet. Two badges rendered with different colours
   * must not share an id, or the one defined last wins for both.
   */
  id: string;
  dimension?: SymbolBadgeDimension;
  sizePx?: number;
  /** Colour of the `bg-fill` / `bg-stroke` parts. */
  color: string;
  foregroundColor?: string;
};

/**
 * A dimension read off an SVG attribute can be a string, absent, zero or
 * garbage. Anything that cannot describe a viewBox falls back to the default,
 * which keeps the markup renderable instead of emitting NaN or Infinity.
 */
const toPositiveLength = (value: number | string | undefined, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildSymbolBadgeSvgMarkup = ({
  svgMarkup,
  id,
  dimension,
  sizePx = SYMBOL_BADGE_DEFAULT_SIZE_PX,
  color,
  foregroundColor = SYMBOL_BADGE_DEFAULT_FOREGROUND_COLOR,
}: SymbolBadgeMarkupOptions): string => {
  const size = toPositiveLength(sizePx, SYMBOL_BADGE_DEFAULT_SIZE_PX);
  const viewBoxWidth = toPositiveLength(
    dimension?.width,
    SYMBOL_BADGE_DEFAULT_DIMENSION.width
  );
  const viewBoxHeight = toPositiveLength(
    dimension?.height,
    SYMBOL_BADGE_DEFAULT_DIMENSION.height
  );

  // Inset by half a signature unit on each side, so the badge keeps a hairline
  // of breathing room inside its box. Same formula as react-cismap's, which is
  // what makes a migrated marker sit exactly where the Leaflet one sat.
  const insetX = size / viewBoxWidth / 2;
  const insetY = size / viewBoxHeight / 2;
  const innerWidth = size - 2 * insetX;
  const innerHeight = size - 2 * insetY;

  const {
    backgroundFill,
    backgroundStroke,
    foregroundFill,
    foregroundStroke,
  } = SYMBOL_BADGE_CLASS_NAMES;

  return `<svg id="${id}" height="${size}" width="${size}">
  <style>
    /* <![CDATA[ */
      #${id} .${backgroundFill} { fill: ${color}; }
      #${id} .${backgroundStroke} { stroke: ${color}; }
      #${id} .${foregroundFill} { fill: ${foregroundColor}; }
      #${id} .${foregroundStroke} { stroke: ${foregroundColor}; }
    /* ]]> */
  </style>
  <svg x="${insetX}" y="${insetY}" width="${innerWidth}" height="${innerHeight}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">
    ${svgMarkup}
  </svg>
</svg>`;
};
