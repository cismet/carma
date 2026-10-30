import { clamp } from "@carma-commons/math";

import {
  annotationLineLabelDefaults,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import {
  ANNOTATION_THEME,
  type AnnotationThemeStyle,
} from "../config/annotation-theme";

export type TextOverlayStyleOptions = {
  fontSize?: string;
  letterSpacing?: string;
  fontWeight?: string | number;
  textEchoBlurPx?: number;
  textEchoShadow?: string;
};

const TEXT_OVERLAY_STYLE_DEFAULTS = Object.freeze({
  paddingBlockEx: 0.25,
  paddingInlineEx: 0.65,
  backdropInsetBlockEx: -0.35,
  backdropInsetInlineEx: -0.75,
});

const TEXT_OVERLAY_THEME_BACKDROP_RGB: Readonly<
  Record<AnnotationThemeStyle, string>
> = Object.freeze({
  [ANNOTATION_THEME.style.BRIGHT_ON_DARK]: "15, 23, 42",
  [ANNOTATION_THEME.style.DARK_ON_BRIGHT]: "255, 255, 255",
});

/** The CSS custom properties a style-options object sets on the overlay root. */
export const getTextOverlayStyleOptionVars = (
  styleOptions?: TextOverlayStyleOptions
): Record<string, string> => ({
  ...(styleOptions?.fontSize
    ? { "--carma-annotation-text-overlay-font-size": styleOptions.fontSize }
    : {}),
  ...(styleOptions?.fontWeight !== undefined
    ? {
        "--carma-annotation-text-overlay-font-weight": String(
          styleOptions.fontWeight
        ),
      }
    : {}),
  ...(styleOptions?.letterSpacing
    ? {
        "--carma-annotation-text-overlay-letter-spacing":
          styleOptions.letterSpacing,
      }
    : {}),
  ...(typeof styleOptions?.textEchoBlurPx === "number"
    ? {
        "--carma-annotation-text-overlay-text-echo-blur-px": `${styleOptions.textEchoBlurPx}px`,
      }
    : {}),
  ...(styleOptions?.textEchoShadow
    ? {
        "--carma-annotation-text-overlay-text-echo-shadow":
          styleOptions.textEchoShadow,
      }
    : {}),
});

export const applyTextOverlayStyleOptions = (
  element: HTMLElement,
  styleOptions?: TextOverlayStyleOptions
) => {
  Object.entries(getTextOverlayStyleOptionVars(styleOptions)).forEach(
    ([property, value]) => element.style.setProperty(property, value)
  );
};

const setNumberCssVar = (
  element: HTMLElement,
  property: string,
  value: number | undefined,
  { unit = "", min, max }: { unit?: string; min?: number; max?: number } = {}
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return;
  }

  element.style.setProperty(
    property,
    `${clamp(value, min ?? -Infinity, max ?? Infinity)}${unit}`
  );
};

const finiteOr = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Writes the line-label options as CSS custom properties and data attributes on the overlay DOM. */
export const applyTextOverlayOptions = ({
  element,
  backdrop,
  surface,
  accentColor,
  visualOptions = annotationLineLabelDefaults,
}: {
  element: HTMLElement;
  backdrop: HTMLElement;
  surface: HTMLElement;
  accentColor?: string;
  visualOptions?: AnnotationLineLabelOptions;
}) => {
  const { text, background, surface: surfaceOptions } = visualOptions;
  const setVar = (property: string, value?: string) => {
    if (value?.trim()) {
      element.style.setProperty(property, value);
    }
  };

  element.style.setProperty(
    "--carma-annotation-text-overlay-font-family",
    text.fontFamily
  );
  element.style.setProperty(
    "--carma-annotation-text-overlay-font-weight",
    String(text.fontWeight)
  );
  if (accentColor) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-glow-color",
      accentColor
    );
  }
  element.dataset.annotationThemeStyle = visualOptions.appearance.themeStyle;
  element.dataset.annotationTextOverlayBackgroundStyle = background.style;

  if (
    typeof background.surfaceAlpha === "number" &&
    Number.isFinite(background.surfaceAlpha) &&
    !background.color?.trim()
  ) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-backdrop-background",
      `rgba(${
        TEXT_OVERLAY_THEME_BACKDROP_RGB[visualOptions.appearance.themeStyle]
      }, ${clamp(background.surfaceAlpha, 0, 1)})`
    );
  }

  const showBackdrop = background.showBackdrop !== false;
  backdrop.style.display = showBackdrop ? "block" : "none";
  surface.style.display = showBackdrop ? "block" : "none";

  setVar("--carma-annotation-text-overlay-text-color", text.color);
  setVar("--carma-annotation-text-overlay-text-blend-mode", text.blendMode);
  setVar(
    "--carma-annotation-text-overlay-backdrop-background",
    background.color
  );
  setVar(
    "--carma-annotation-text-overlay-backdrop-blend-mode",
    background.blendMode
  );
  setVar(
    "--carma-annotation-text-overlay-surface-blend-mode",
    surfaceOptions.blendMode
  );
  setVar("--carma-annotation-text-overlay-text-echo-color", text.echo?.color);
  setVar(
    "--carma-annotation-text-overlay-text-echo-blend-mode",
    text.echo?.blendMode
  );

  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-text-echo-blur-px",
    text.echo?.blurPx,
    { unit: "px", min: 0 }
  );
  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-text-echo-opacity",
    text.echo?.opacity,
    { min: 0, max: 1 }
  );
  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-surface-blur-px",
    background.blurPx,
    { unit: "px", min: 0 }
  );
  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-surface-brightness-pct",
    background.brightnessPct,
    { unit: "%", min: 0 }
  );
  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-surface-saturate-pct",
    background.saturatePct,
    { unit: "%", min: 0 }
  );
  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-backdrop-radius",
    background.radiusEx,
    { unit: "ex", min: 0 }
  );
  setNumberCssVar(
    element,
    "--carma-annotation-text-overlay-surface-edge-blur-px",
    background.edgeBlurPx,
    { unit: "px", min: 0 }
  );

  if (
    typeof surfaceOptions.paddingBlockEx === "number" ||
    typeof surfaceOptions.paddingInlineEx === "number"
  ) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-padding-block",
      `${Math.max(
        finiteOr(
          surfaceOptions.paddingBlockEx,
          TEXT_OVERLAY_STYLE_DEFAULTS.paddingBlockEx
        ),
        0
      )}ex`
    );
    element.style.setProperty(
      "--carma-annotation-text-overlay-padding-inline",
      `${Math.max(
        finiteOr(
          surfaceOptions.paddingInlineEx,
          TEXT_OVERLAY_STYLE_DEFAULTS.paddingInlineEx
        ),
        0
      )}ex`
    );
  }

  if (
    typeof background.insetBlockEx === "number" ||
    typeof background.insetInlineEx === "number"
  ) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-backdrop-inset",
      `${finiteOr(
        background.insetBlockEx,
        TEXT_OVERLAY_STYLE_DEFAULTS.backdropInsetBlockEx
      )}ex ${finiteOr(
        background.insetInlineEx,
        TEXT_OVERLAY_STYLE_DEFAULTS.backdropInsetInlineEx
      )}ex`
    );
  }
};
