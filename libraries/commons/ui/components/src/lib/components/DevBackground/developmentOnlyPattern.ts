import type { CSSProperties } from "react";

import { degToRadNumeric, radToDegNumeric } from "@carma-units";

export const DEVELOPMENT_ONLY_LABEL =
  "Nur für Entwicklungsgebrauch / Development use only";
export const DEVELOPMENT_ONLY_PATTERN_TEXT_DE = "Nur für Entwicklungsgebrauch";
export const DEVELOPMENT_ONLY_PATTERN_TEXT_EN = "Development use only";
export const DEVELOPMENT_ONLY_PATTERN_TEXT = DEVELOPMENT_ONLY_PATTERN_TEXT_DE;
export const DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT = "Developer Preview";

const DEFAULT_PATTERN_PRIMARY_COLOR = "rgba(0, 0, 0, 0.1)";
const DEFAULT_PATTERN_SECONDARY_COLOR = "transparent";
const DEFAULT_PATTERN_BASE_WIDTH_PX = 1024;
const DEFAULT_PATTERN_REPEAT_X_PX = 384;
const DEFAULT_PATTERN_STRIPE_WIDTH_PX = 16;
const DEFAULT_PATTERN_REPEAT_Y_PX = DEFAULT_PATTERN_STRIPE_WIDTH_PX * 2;
const DEFAULT_PATTERN_TILE_WIDTH_PX = DEFAULT_PATTERN_BASE_WIDTH_PX;
const DEFAULT_PATTERN_TILE_HEIGHT_PX = DEFAULT_PATTERN_REPEAT_Y_PX * 5;
const DEFAULT_PATTERN_BLEND_MODE = "normal";
const DEFAULT_UI_BACKDROP_STRIPE_WIDTH_PX = 18;
// Text rows offset by a quarter repeat; eight stripes close that cycle on y edges.
const DEFAULT_UI_BACKDROP_TILE_HEIGHT_PX =
  DEFAULT_UI_BACKDROP_STRIPE_WIDTH_PX * 8;

export type DevelopmentOnlyPatternStyleOptions = {
  backgroundBlendMode?: CSSProperties["backgroundBlendMode"];
  backgroundColor?: string;
  primaryColor?: string;
  repeatXPx?: number;
  repeatYPx?: number;
  rotationDeg?: number;
  secondaryColor?: string;
  stripeGapPx?: number;
  stripeWidthPx?: number;
  text?: string;
  textPunchOut?: boolean;
  textVisible?: boolean;
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
) => Math.max(1, readFiniteNumber(value ?? fallback, fallback));

const readPatternStripeGapPx = (value: number | undefined, fallback: number) =>
  Math.max(0, readFiniteNumber(value ?? fallback, fallback));

const escapeSvgText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeSvgAttribute = (value: string) =>
  escapeSvgText(value).replace(/"/g, "&quot;");

const readTileablePatternSlope = (
  tileWidthPx: number,
  tileHeightPx: number,
  rotationDeg: number | undefined
) =>
  Number.isFinite(rotationDeg)
    ? -Math.tan(degToRadNumeric(rotationDeg as number))
    : tileHeightPx / tileWidthPx;

const readPatternRotationDeg = (slope: number) =>
  -radToDegNumeric(Math.atan(slope));

const buildRepeatingStripeGradient = ({
  primaryColor,
  rotationDeg,
  secondaryColor,
  stripeGapPx,
  stripeWidthPx,
}: {
  primaryColor: string;
  rotationDeg: number;
  secondaryColor: string;
  stripeGapPx: number;
  stripeWidthPx: number;
}) => {
  const repeatPx = stripeWidthPx + stripeGapPx;

  return `repeating-linear-gradient(${rotationDeg}deg, ${primaryColor} 0 ${stripeWidthPx}px, ${secondaryColor} ${stripeWidthPx}px ${repeatPx}px)`;
};

export const buildDevelopmentOnlyPatternSvgMarkup = ({
  primaryColor = DEFAULT_PATTERN_PRIMARY_COLOR,
  repeatXPx = DEFAULT_PATTERN_REPEAT_X_PX,
  repeatYPx = DEFAULT_PATTERN_REPEAT_Y_PX,
  rotationDeg,
  secondaryColor = DEFAULT_PATTERN_SECONDARY_COLOR,
  stripeGapPx,
  stripeWidthPx = DEFAULT_PATTERN_STRIPE_WIDTH_PX,
  text,
  textPunchOut = true,
  textVisible = true,
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
  const phaseRepeat = stripeWidth * 2;
  const textFontSize = Math.max(8, Math.min(12, stripeWidth * 0.58));
  const safeTexts = textVisible
    ? (texts !== undefined
        ? texts
        : text
        ? [text]
        : [DEVELOPMENT_ONLY_PATTERN_TEXT_DE, DEVELOPMENT_ONLY_PATTERN_TEXT_EN]
      ).map(escapeSvgText)
    : [];
  const hasText = safeTexts.length > 0;
  const desiredTextSlotCount = Math.max(1, Math.round(width / (repeatX / 2)));
  const textSlotCount = hasText
    ? safeTexts.length > 1
      ? Math.max(
          safeTexts.length,
          Math.round(desiredTextSlotCount / safeTexts.length) * safeTexts.length
        )
      : desiredTextSlotCount
    : 1;
  const textSlotWidth = width / textSlotCount;
  const rowOffsetStepX = textSlotWidth / 2;
  const patternSlope = readTileablePatternSlope(width, height, rotationDeg);
  const safeRotationDeg = readPatternRotationDeg(patternSlope);
  const safePrimaryColor = escapeSvgAttribute(primaryColor);
  const safeSecondaryColor = escapeSvgAttribute(secondaryColor);
  const textRuns: {
    label: string;
    phaseIndex: number;
    x: number;
    y: number;
  }[] = [];
  const safeMaskId = "development-only-punched-text";
  const phaseStart = -height - phaseRepeat;
  const phaseEnd = height * 2 + phaseRepeat;
  const phaseStripeCount = Math.ceil((phaseEnd - phaseStart) / stripeWidth);
  const stripeBands = Array.from({ length: phaseStripeCount }, (_, index) => ({
    phaseIndex: index,
    phaseStart: phaseStart + index * stripeWidth,
  }));

  for (const { phaseIndex, phaseStart: stripePhaseStart } of stripeBands) {
    const phaseCenter = stripePhaseStart + stripeWidth / 2;
    const rowOffsetX = (phaseIndex * rowOffsetStepX) % repeatX;
    const minSlotIndex = Math.floor(-rowOffsetX / textSlotWidth) - 1;
    const maxSlotIndex = Math.ceil((width - rowOffsetX) / textSlotWidth) + 1;

    if (hasText) {
      for (
        let slotIndex = minSlotIndex;
        slotIndex <= maxSlotIndex;
        slotIndex += 1
      ) {
        textRuns.push({
          label:
            safeTexts[
              (((slotIndex + phaseIndex) % safeTexts.length) +
                safeTexts.length) %
                safeTexts.length
            ],
          phaseIndex,
          x: rowOffsetX + slotIndex * textSlotWidth,
          y:
            phaseCenter -
            patternSlope * (rowOffsetX + slotIndex * textSlotWidth),
        });
      }
    }
  }

  const maskMarkup =
    hasText && textPunchOut
      ? [
          "<defs>",
          `<mask id="${safeMaskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">`,
          `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
          ...textRuns
            .filter(({ phaseIndex }) => phaseIndex % 2 === 1)
            .map(
              ({ label, x, y }) =>
                `<text x="${x}" y="${y}" dominant-baseline="middle" fill="#000000" font-family="Arial, Helvetica, sans-serif" font-size="${textFontSize}" font-weight="700" text-anchor="middle" transform="rotate(${safeRotationDeg} ${x} ${y})">${label}</text>`
            ),
          "</mask>",
          "</defs>",
        ]
      : [];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...maskMarkup,
    `<rect width="${width}" height="${height}" fill="${safeSecondaryColor}" />`,
    ...stripeBands.map(({ phaseIndex, phaseStart }) => {
      const isPrimaryStripe = phaseIndex % 2 === 1;
      const maskAttribute =
        hasText && isPrimaryStripe && textPunchOut
          ? ` mask="url(#${safeMaskId})"`
          : "";
      const phaseEnd = phaseStart + stripeWidth;
      const minX = -width;
      const maxX = width * 2;
      const points = [
        `${minX},${phaseStart - patternSlope * minX}`,
        `${maxX},${phaseStart - patternSlope * maxX}`,
        `${maxX},${phaseEnd - patternSlope * maxX}`,
        `${minX},${phaseEnd - patternSlope * minX}`,
      ].join(" ");

      return `<polygon points="${points}" fill="${
        isPrimaryStripe ? safePrimaryColor : safeSecondaryColor
      }"${maskAttribute} />`;
    }),
    ...textRuns
      .filter(({ phaseIndex }) => phaseIndex % 2 === 0 || !textPunchOut)
      .map(
        ({ label, x, y }) =>
          `<text x="${x}" y="${y}" dominant-baseline="middle" fill="${safePrimaryColor}" font-family="Arial, Helvetica, sans-serif" font-size="${textFontSize}" font-weight="700" text-anchor="middle" transform="rotate(${safeRotationDeg} ${x} ${y})">${label}</text>`
      ),
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
  stripeGapPx,
  stripeWidthPx = DEFAULT_PATTERN_STRIPE_WIDTH_PX,
  text,
  textPunchOut,
  textVisible,
  texts,
  tileHeightPx,
  tileSizePx,
  tileWidthPx,
  ...options
}: DevelopmentOnlyPatternStyleOptions = {}): CSSProperties => {
  if (textVisible === false) {
    const resolvedStripeWidthPx = readPatternStripeWidthPx(
      stripeWidthPx ?? (repeatYPx !== undefined ? repeatYPx / 2 : undefined),
      DEFAULT_PATTERN_STRIPE_WIDTH_PX
    );
    const resolvedStripeGapPx = readPatternStripeGapPx(
      stripeGapPx ??
        (repeatYPx !== undefined
          ? repeatYPx - resolvedStripeWidthPx
          : undefined),
      resolvedStripeWidthPx
    );

    return {
      backgroundBlendMode,
      backgroundColor,
      backgroundImage: buildRepeatingStripeGradient({
        primaryColor,
        rotationDeg: readFiniteNumber(rotationDeg ?? 45, 45),
        secondaryColor,
        stripeGapPx: resolvedStripeGapPx,
        stripeWidthPx: resolvedStripeWidthPx,
      }),
      backgroundRepeat: "repeat",
      backgroundSize: "auto",
    };
  }

  return {
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
      textVisible,
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
  };
};

export type DevelopmentOnlyUiBackdropStyleOptions =
  DevelopmentOnlyPatternStyleOptions;

export const readDevelopmentOnlyUiBackdropStyle = ({
  backgroundBlendMode = "normal",
  backgroundColor = "rgba(255, 255, 255, 0.82)",
  primaryColor = "rgba(15, 23, 42, 0.13)",
  repeatXPx = 720,
  repeatYPx,
  rotationDeg,
  secondaryColor = "transparent",
  stripeGapPx,
  stripeWidthPx = DEFAULT_UI_BACKDROP_STRIPE_WIDTH_PX,
  text,
  textPunchOut = true,
  textVisible,
  texts = text ? undefined : [DEVELOPMENT_ONLY_UI_BACKDROP_PATTERN_TEXT],
  tileHeightPx = DEFAULT_UI_BACKDROP_TILE_HEIGHT_PX,
  tileSizePx,
  tileWidthPx = 720,
}: DevelopmentOnlyUiBackdropStyleOptions = {}): CSSProperties =>
  readDevelopmentOnlyPatternStyle({
    backgroundBlendMode,
    backgroundColor,
    primaryColor,
    repeatXPx,
    repeatYPx,
    rotationDeg,
    secondaryColor,
    stripeGapPx,
    stripeWidthPx,
    text,
    textPunchOut,
    textVisible,
    texts,
    tileHeightPx,
    tileSizePx,
    tileWidthPx,
  });
