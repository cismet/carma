import type { CSSProperties } from "react";

export const DEVELOPMENT_ONLY_LABEL =
  "Nur für Entwicklungsgebrauch / Development use only";
export const DEVELOPMENT_ONLY_PATTERN_TEXT_DE = "Nur für Entwicklungsgebrauch";
export const DEVELOPMENT_ONLY_PATTERN_TEXT_EN = "Development use only";
export const DEVELOPMENT_ONLY_PATTERN_TEXT = DEVELOPMENT_ONLY_PATTERN_TEXT_DE;

const DEFAULT_PATTERN_PRIMARY_COLOR = "rgba(0, 0, 0, 0.1)";
const DEFAULT_PATTERN_SECONDARY_COLOR = "transparent";
const DEFAULT_PATTERN_BASE_WIDTH_PX = 1024;
const DEFAULT_PATTERN_REPEAT_X_PX = 384;
const DEFAULT_PATTERN_STRIPE_WIDTH_PX = 16;
const DEFAULT_PATTERN_REPEAT_Y_PX = DEFAULT_PATTERN_STRIPE_WIDTH_PX * 2;
const DEFAULT_PATTERN_TILE_WIDTH_PX = DEFAULT_PATTERN_BASE_WIDTH_PX;
const DEFAULT_PATTERN_TILE_HEIGHT_PX = DEFAULT_PATTERN_REPEAT_Y_PX * 5;
const DEFAULT_PATTERN_BLEND_MODE = "normal";

export type DevelopmentOnlyPatternStyleOptions = {
  backgroundBlendMode?: CSSProperties["backgroundBlendMode"];
  backgroundColor?: string;
  primaryColor?: string;
  repeatXPx?: number;
  repeatYPx?: number;
  rotationDeg?: number;
  secondaryColor?: string;
  stripeWidthPx?: number;
  text?: string;
  textPunchOut?: boolean;
  texts?: readonly string[];
  tileHeightPx?: number;
  tileSizePx?: number;
  tileWidthPx?: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const readFiniteNumber = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const readPatternTileDimensionPx = (
  value: number | undefined,
  fallback: number
) => Math.max(24, readFiniteNumber(value ?? fallback, fallback));

const readPatternStripeWidthPx = (
  value: number | undefined,
  fallback: number
) => Math.max(8, readFiniteNumber(value ?? fallback, fallback));

const escapeSvgText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeSvgAttribute = (value: string) =>
  escapeSvgText(value).replace(/"/g, "&quot;");

const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

const readSeamlessPatternRotationDeg = (
  tileWidthPx: number,
  tileHeightPx: number,
  rotationDeg: number | undefined
) =>
  Number.isFinite(rotationDeg)
    ? (rotationDeg as number)
    : -radiansToDegrees(Math.atan2(tileHeightPx, tileWidthPx));

export const buildDevelopmentOnlyPatternSvgMarkup = ({
  primaryColor = DEFAULT_PATTERN_PRIMARY_COLOR,
  repeatXPx = DEFAULT_PATTERN_REPEAT_X_PX,
  repeatYPx = DEFAULT_PATTERN_REPEAT_Y_PX,
  rotationDeg,
  secondaryColor = DEFAULT_PATTERN_SECONDARY_COLOR,
  stripeWidthPx = DEFAULT_PATTERN_STRIPE_WIDTH_PX,
  text,
  textPunchOut = true,
  texts,
  tileHeightPx,
  tileSizePx,
  tileWidthPx,
}: DevelopmentOnlyPatternStyleOptions = {}) => {
  const width = readPatternTileDimensionPx(
    tileWidthPx ?? tileSizePx,
    DEFAULT_PATTERN_TILE_WIDTH_PX
  );
  const height = readPatternTileDimensionPx(
    tileHeightPx ?? tileSizePx,
    DEFAULT_PATTERN_TILE_HEIGHT_PX
  );
  const repeatX = readPatternTileDimensionPx(
    repeatXPx,
    DEFAULT_PATTERN_REPEAT_X_PX
  );
  const stripeWidth = readPatternStripeWidthPx(
    stripeWidthPx ?? repeatYPx / 2,
    DEFAULT_PATTERN_STRIPE_WIDTH_PX
  );
  const stripeCount = Math.max(2, Math.round(height / stripeWidth));
  const textFontSize = Math.max(8, Math.min(12, stripeWidth * 0.58));
  const textSlotWidth = repeatX / 2;
  const safeRotationDeg = readSeamlessPatternRotationDeg(
    width,
    height,
    rotationDeg
  );
  const safePrimaryColor = escapeSvgAttribute(primaryColor);
  const safeSecondaryColor = escapeSvgAttribute(secondaryColor);
  const safeTexts = (
    texts?.length
      ? texts
      : text
      ? [text]
      : [DEVELOPMENT_ONLY_PATTERN_TEXT_DE, DEVELOPMENT_ONLY_PATTERN_TEXT_EN]
  ).map(escapeSvgText);
  const textRuns: {
    label: string;
    stripeIndex: number;
    x: number;
    y: number;
  }[] = [];
  const rowOffsetStepX = textSlotWidth / 2;
  const safePatternId = "development-only-pattern";
  const safeMaskId = "development-only-punched-text";

  for (let stripeIndex = 0; stripeIndex < stripeCount; stripeIndex += 1) {
    const y = stripeIndex * stripeWidth + stripeWidth / 2;
    const rowOffsetX = (stripeIndex * rowOffsetStepX) % repeatX;
    const minSlotIndex = Math.floor(
      (-rowOffsetX - textSlotWidth) / textSlotWidth
    );
    const maxSlotIndex = Math.ceil(
      (repeatX - rowOffsetX + textSlotWidth) / textSlotWidth
    );

    for (
      let slotIndex = minSlotIndex;
      slotIndex <= maxSlotIndex;
      slotIndex += 1
    ) {
      textRuns.push({
        label:
          safeTexts[
            (((slotIndex + stripeIndex) % safeTexts.length) +
              safeTexts.length) %
              safeTexts.length
          ],
        stripeIndex,
        x: rowOffsetX + slotIndex * textSlotWidth,
        y,
      });
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<defs>",
    `<mask id="${safeMaskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${repeatX}" height="${height}">`,
    `<rect x="0" y="0" width="${repeatX}" height="${height}" fill="#ffffff" />`,
    ...textRuns
      .filter(({ stripeIndex }) => stripeIndex % 2 === 1)
      .map(
        ({ label, x, y }) =>
          `<text x="${x}" y="${y}" dominant-baseline="middle" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="${textFontSize}" font-weight="700" text-anchor="middle">${label}</text>`
      ),
    "</mask>",
    `<pattern id="${safePatternId}" patternUnits="userSpaceOnUse" width="${repeatX}" height="${height}" patternTransform="rotate(${safeRotationDeg})">`,
    ...Array.from({ length: stripeCount }, (_, stripeIndex) => {
      const isPrimaryStripe = stripeIndex % 2 === 1;
      const maskAttribute =
        isPrimaryStripe && textPunchOut ? ` mask="url(#${safeMaskId})"` : "";

      return `<rect x="0" y="${
        stripeIndex * stripeWidth
      }" width="${repeatX}" height="${stripeWidth}" fill="${
        isPrimaryStripe ? safePrimaryColor : safeSecondaryColor
      }"${maskAttribute} />`;
    }),
    ...textRuns
      .filter(({ stripeIndex }) => stripeIndex % 2 === 0)
      .map(
        ({ label, x, y }) =>
          `<text x="${x}" y="${y}" dominant-baseline="middle" fill="${safePrimaryColor}" font-family="Arial, Helvetica, sans-serif" font-size="${textFontSize}" font-weight="700" text-anchor="middle">${label}</text>`
      ),
    "</pattern>",
    "</defs>",
    `<rect width="${width}" height="${height}" fill="url(#${safePatternId})" />`,
    "</svg>",
  ].join("");
};

export const buildDevelopmentOnlyPatternDataUrl = (
  options?: DevelopmentOnlyPatternStyleOptions
) =>
  `data:image/svg+xml,${encodeURIComponent(
    buildDevelopmentOnlyPatternSvgMarkup(options)
  )}`;

export const readDevelopmentOnlyPatternStyle = ({
  backgroundBlendMode = DEFAULT_PATTERN_BLEND_MODE,
  backgroundColor = "#ffffff",
  primaryColor = DEFAULT_PATTERN_PRIMARY_COLOR,
  repeatXPx,
  repeatYPx,
  rotationDeg,
  secondaryColor = DEFAULT_PATTERN_SECONDARY_COLOR,
  stripeWidthPx = DEFAULT_PATTERN_STRIPE_WIDTH_PX,
  text,
  textPunchOut,
  texts,
  tileHeightPx,
  tileSizePx,
  tileWidthPx,
  ...options
}: DevelopmentOnlyPatternStyleOptions = {}): CSSProperties => ({
  backgroundBlendMode,
  backgroundColor,
  backgroundImage: `url("${buildDevelopmentOnlyPatternDataUrl({
    ...options,
    primaryColor,
    repeatXPx,
    repeatYPx,
    rotationDeg,
    secondaryColor,
    stripeWidthPx,
    text,
    textPunchOut,
    texts,
    tileHeightPx,
    tileSizePx,
    tileWidthPx,
  })}")`,
  backgroundRepeat: "repeat",
  backgroundSize: `${readPatternTileDimensionPx(
    tileWidthPx ?? tileSizePx,
    DEFAULT_PATTERN_TILE_WIDTH_PX
  )}px ${readPatternTileDimensionPx(
    tileHeightPx ?? tileSizePx,
    DEFAULT_PATTERN_TILE_HEIGHT_PX
  )}px`,
});
