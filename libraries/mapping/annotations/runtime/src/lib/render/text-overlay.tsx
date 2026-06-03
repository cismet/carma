import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  type AnnotationLineLabelOptions,
  annotationLineLabelDefaults,
} from "../config/annotation-line-label-options";
import {
  ANNOTATION_THEME_STYLE,
  type AnnotationThemeStyle,
} from "../config/annotation-theme-style";

import "./text-overlay.css";

export const TEXT_OVERLAY_CLASS_NAMES = Object.freeze({
  root: "carma-annotation-text-overlay",
  backdrop: "carma-annotation-text-overlay__backdrop",
  surface: "carma-annotation-text-overlay__surface",
  textEcho: "carma-annotation-text-overlay__text-echo",
  text: "carma-annotation-text-overlay__text",
});

const TEXT_OVERLAY_STYLE_DEFAULTS = Object.freeze({
  paddingBlockEx: 0.25,
  paddingInlineEx: 0.65,
  backdropInsetBlockEx: -0.35,
  backdropInsetInlineEx: -0.75,
});

export type TextOverlayStyleOptions = {
  fontSize?: string;
  letterSpacing?: string;
  fontWeight?: string | number;
  textEchoBlurPx?: number;
  textEchoShadow?: string;
};

export const TEXT_OVERLAY_AREA_LABEL_STYLE: TextOverlayStyleOptions =
  Object.freeze({
    fontSize: "20px",
    letterSpacing: "5%",
    fontWeight: 800,
    textEchoBlurPx: 12,
    textEchoShadow:
      "0 0 4px rgba(2, 6, 23, 0.8), 0 0 12px rgba(2, 6, 23, 0.77), 0 0 24px rgba(2, 6, 23, 0.64)",
  });

const TEXT_OVERLAY_THEME_BACKDROP_RGB: Readonly<
  Record<AnnotationThemeStyle, string>
> = Object.freeze({
  [ANNOTATION_THEME_STYLE.BRIGHT_ON_DARK]: "15, 23, 42",
  [ANNOTATION_THEME_STYLE.DARK_ON_BRIGHT]: "255, 255, 255",
});

type TextOverlayDomElements = {
  element: HTMLDivElement;
  backdrop: HTMLDivElement;
  surface: HTMLDivElement;
  textEcho: HTMLDivElement;
  text: HTMLDivElement;
};

export type TextOverlayProps = {
  content: ReactNode;
  selected?: boolean;
  textColor?: string;
  fontSize?: string;
  styleOptions?: TextOverlayStyleOptions;
  visualOptions?: AnnotationLineLabelOptions;
  surfaceBlendMode?: CSSProperties["mixBlendMode"];
  onClick?: () => void;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
};

const createHtmlElement = <T extends keyof HTMLElementTagNameMap>(
  tagName: T,
  className: string
) => {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
};

const applyOptionalNumberCssVar = ({
  element,
  value,
  property,
  unit,
  min,
  max,
}: {
  element: HTMLElement;
  value?: number;
  property: string;
  unit?: string;
  min?: number;
  max?: number;
}) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return;
  }

  const lowerBoundedValue = min === undefined ? value : Math.max(value, min);
  const boundedValue =
    max === undefined ? lowerBoundedValue : Math.min(lowerBoundedValue, max);
  element.style.setProperty(property, `${boundedValue}${unit ?? ""}`);
};

export const applyTextOverlayOptions = ({
  element,
  backdrop,
  surface,
  accentColor,
  visualOptions = annotationLineLabelDefaults,
}: TextOverlayDomElements & {
  accentColor?: string;
  visualOptions?: AnnotationLineLabelOptions;
}) => {
  element.style.setProperty(
    "--carma-annotation-text-overlay-font-family",
    visualOptions.text.fontFamily
  );
  element.style.setProperty(
    "--carma-annotation-text-overlay-font-weight",
    String(visualOptions.text.fontWeight)
  );
  if (accentColor) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-glow-color",
      accentColor
    );
  }
  element.dataset.annotationThemeStyle = visualOptions.appearance.themeStyle;
  element.dataset.annotationTextOverlayBackgroundStyle =
    visualOptions.background.style;

  if (
    typeof visualOptions.background.surfaceAlpha === "number" &&
    Number.isFinite(visualOptions.background.surfaceAlpha) &&
    !visualOptions.background.color?.trim()
  ) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-backdrop-background",
      `rgba(${
        TEXT_OVERLAY_THEME_BACKDROP_RGB[visualOptions.appearance.themeStyle]
      }, ${Math.min(Math.max(visualOptions.background.surfaceAlpha, 0), 1)})`
    );
  }

  const showBackdrop = visualOptions.background.showBackdrop !== false;
  backdrop.style.display = showBackdrop ? "block" : "none";
  surface.style.display = showBackdrop ? "block" : "none";

  if (visualOptions.text.color?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-text-color",
      visualOptions.text.color
    );
  }
  if (visualOptions.text.blendMode?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-text-blend-mode",
      visualOptions.text.blendMode
    );
  }
  if (visualOptions.background.color?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-backdrop-background",
      visualOptions.background.color
    );
  }
  if (visualOptions.background.blendMode?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-backdrop-blend-mode",
      visualOptions.background.blendMode
    );
  }
  if (visualOptions.surface.blendMode?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-surface-blend-mode",
      visualOptions.surface.blendMode
    );
  }
  if (visualOptions.text.echo?.color?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-text-echo-color",
      visualOptions.text.echo.color
    );
  }
  if (visualOptions.text.echo?.blendMode?.trim()) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-text-echo-blend-mode",
      visualOptions.text.echo.blendMode
    );
  }

  applyOptionalNumberCssVar({
    element,
    value: visualOptions.text.echo?.blurPx,
    property: "--carma-annotation-text-overlay-text-echo-blur-px",
    unit: "px",
    min: 0,
  });
  applyOptionalNumberCssVar({
    element,
    value: visualOptions.text.echo?.opacity,
    property: "--carma-annotation-text-overlay-text-echo-opacity",
    min: 0,
    max: 1,
  });
  applyOptionalNumberCssVar({
    element,
    value: visualOptions.background.blurPx,
    property: "--carma-annotation-text-overlay-surface-blur-px",
    unit: "px",
    min: 0,
  });
  applyOptionalNumberCssVar({
    element,
    value: visualOptions.background.brightnessPct,
    property: "--carma-annotation-text-overlay-surface-brightness-pct",
    unit: "%",
    min: 0,
  });
  applyOptionalNumberCssVar({
    element,
    value: visualOptions.background.saturatePct,
    property: "--carma-annotation-text-overlay-surface-saturate-pct",
    unit: "%",
    min: 0,
  });
  applyOptionalNumberCssVar({
    element,
    value: visualOptions.background.radiusEx,
    property: "--carma-annotation-text-overlay-backdrop-radius",
    unit: "ex",
    min: 0,
  });
  applyOptionalNumberCssVar({
    element,
    value: visualOptions.background.edgeBlurPx,
    property: "--carma-annotation-text-overlay-surface-edge-blur-px",
    unit: "px",
    min: 0,
  });

  if (
    typeof visualOptions.surface.paddingBlockEx === "number" ||
    typeof visualOptions.surface.paddingInlineEx === "number"
  ) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-padding-block",
      `${
        typeof visualOptions.surface.paddingBlockEx === "number" &&
        Number.isFinite(visualOptions.surface.paddingBlockEx)
          ? Math.max(visualOptions.surface.paddingBlockEx, 0)
          : TEXT_OVERLAY_STYLE_DEFAULTS.paddingBlockEx
      }ex`
    );
    element.style.setProperty(
      "--carma-annotation-text-overlay-padding-inline",
      `${
        typeof visualOptions.surface.paddingInlineEx === "number" &&
        Number.isFinite(visualOptions.surface.paddingInlineEx)
          ? Math.max(visualOptions.surface.paddingInlineEx, 0)
          : TEXT_OVERLAY_STYLE_DEFAULTS.paddingInlineEx
      }ex`
    );
  }

  if (
    typeof visualOptions.background.insetBlockEx === "number" ||
    typeof visualOptions.background.insetInlineEx === "number"
  ) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-backdrop-inset",
      `${
        typeof visualOptions.background.insetBlockEx === "number" &&
        Number.isFinite(visualOptions.background.insetBlockEx)
          ? visualOptions.background.insetBlockEx
          : TEXT_OVERLAY_STYLE_DEFAULTS.backdropInsetBlockEx
      }ex ${
        typeof visualOptions.background.insetInlineEx === "number" &&
        Number.isFinite(visualOptions.background.insetInlineEx)
          ? visualOptions.background.insetInlineEx
          : TEXT_OVERLAY_STYLE_DEFAULTS.backdropInsetInlineEx
      }ex`
    );
  }
};

const applyTextOverlayStyleOptions = (
  element: HTMLElement,
  styleOptions?: TextOverlayStyleOptions
) => {
  if (!styleOptions) {
    return;
  }

  if (styleOptions.fontSize) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-font-size",
      styleOptions.fontSize
    );
  }
  if (styleOptions.fontWeight !== undefined) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-font-weight",
      String(styleOptions.fontWeight)
    );
  }
  if (styleOptions.letterSpacing) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-letter-spacing",
      styleOptions.letterSpacing
    );
  }
  if (typeof styleOptions.textEchoBlurPx === "number") {
    element.style.setProperty(
      "--carma-annotation-text-overlay-text-echo-blur-px",
      `${styleOptions.textEchoBlurPx}px`
    );
  }
  if (styleOptions.textEchoShadow) {
    element.style.setProperty(
      "--carma-annotation-text-overlay-text-echo-shadow",
      styleOptions.textEchoShadow
    );
  }
};

export const createTextOverlayElement = ({
  accentColor,
  visualOptions,
  styleOptions,
}: {
  accentColor?: string;
  visualOptions?: AnnotationLineLabelOptions;
  styleOptions?: TextOverlayStyleOptions;
}) => {
  const element = createHtmlElement("div", TEXT_OVERLAY_CLASS_NAMES.root);
  const backdrop = createHtmlElement("div", TEXT_OVERLAY_CLASS_NAMES.backdrop);
  const surface = createHtmlElement("div", TEXT_OVERLAY_CLASS_NAMES.surface);
  const textEcho = createHtmlElement("div", TEXT_OVERLAY_CLASS_NAMES.textEcho);
  const text = createHtmlElement("div", TEXT_OVERLAY_CLASS_NAMES.text);
  textEcho.dataset.annotationTextOverlayTextEcho = "true";
  text.dataset.annotationTextOverlayText = "foreground";
  applyTextOverlayOptions({
    element,
    backdrop,
    surface,
    textEcho,
    text,
    accentColor,
    visualOptions,
  });
  applyTextOverlayStyleOptions(element, styleOptions);
  element.append(backdrop, surface, textEcho, text);
  return element;
};

export const resolveTextOverlayTextElement = (element: HTMLElement) =>
  element.querySelector(
    '[data-annotation-text-overlay-text="foreground"]'
  ) as HTMLElement | null;

export const resolveTextOverlayTextEchoElement = (element: HTMLElement) =>
  element.querySelector(
    '[data-annotation-text-overlay-text-echo="true"]'
  ) as HTMLElement | null;

export const setTextOverlayText = (
  element: HTMLElement,
  textContent: string
) => {
  const text = resolveTextOverlayTextElement(element);
  const textEcho = resolveTextOverlayTextEchoElement(element);
  if (text && text.textContent !== textContent) {
    text.textContent = textContent;
  }
  if (textEcho && textEcho.textContent !== textContent) {
    textEcho.textContent = textContent;
  }
};

const toTextContent = (value: ReactNode, fallback = ""): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;

const buildTextOverlayStyle = ({
  textColor,
  fontSize,
  styleOptions,
  visualOptions,
  surfaceBlendMode,
  hasInteraction,
}: {
  textColor?: string;
  fontSize?: string;
  styleOptions?: TextOverlayStyleOptions;
  visualOptions: AnnotationLineLabelOptions;
  surfaceBlendMode?: CSSProperties["mixBlendMode"];
  hasInteraction: boolean;
}): CSSProperties =>
  ({
    pointerEvents: hasInteraction ? "auto" : "none",
    cursor: hasInteraction ? "pointer" : "default",
    "--carma-annotation-text-overlay-font-family":
      visualOptions.text.fontFamily,
    "--carma-annotation-text-overlay-font-weight": String(
      styleOptions?.fontWeight ?? visualOptions.text.fontWeight
    ),
    ...(styleOptions?.fontSize ?? fontSize
      ? {
          "--carma-annotation-text-overlay-font-size":
            styleOptions?.fontSize ?? fontSize,
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
    ...(textColor
      ? {
          "--carma-annotation-text-overlay-text-color": textColor,
        }
      : {}),
    ...(surfaceBlendMode
      ? {
          "--carma-annotation-text-overlay-backdrop-blend-mode":
            surfaceBlendMode,
          "--carma-annotation-text-overlay-surface-blend-mode":
            surfaceBlendMode,
        }
      : {}),
  } as CSSProperties);

export const TextOverlay = ({
  content,
  selected,
  textColor,
  fontSize,
  styleOptions,
  visualOptions = annotationLineLabelDefaults,
  surfaceBlendMode,
  onClick,
  onDoubleClick,
  onLongPress,
  longPressDurationMs = 320,
}: TextOverlayProps) => {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const textContent = toTextContent(content);
  const hasInteraction = Boolean(onClick || onDoubleClick || onLongPress);
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current === null) {
      return;
    }

    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onClick?.();
    },
    [onClick]
  );

  const handlePointerDown = useCallback(
    (_event: PointerEvent<HTMLDivElement>) => {
      if (!onLongPress) {
        return;
      }

      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        onLongPress();
      }, longPressDurationMs);
    },
    [clearLongPressTimer, longPressDurationMs, onLongPress]
  );

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  return (
    <div
      className={TEXT_OVERLAY_CLASS_NAMES.root}
      data-annotation-theme-style={visualOptions.appearance.themeStyle}
      data-annotation-text-overlay-background-style={
        visualOptions.background.style
      }
      data-selected={selected ? "true" : undefined}
      style={buildTextOverlayStyle({
        textColor,
        fontSize,
        styleOptions,
        visualOptions,
        surfaceBlendMode,
        hasInteraction,
      })}
      onClick={onClick ? handleClick : undefined}
      onDoubleClick={onDoubleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? clearLongPressTimer : undefined}
      onPointerLeave={onLongPress ? clearLongPressTimer : undefined}
      onPointerCancel={onLongPress ? clearLongPressTimer : undefined}
    >
      <div className={TEXT_OVERLAY_CLASS_NAMES.backdrop} />
      <div className={TEXT_OVERLAY_CLASS_NAMES.surface} />
      <div
        className={TEXT_OVERLAY_CLASS_NAMES.textEcho}
        data-annotation-text-overlay-text-echo="true"
      >
        {textContent}
      </div>
      <div
        className={TEXT_OVERLAY_CLASS_NAMES.text}
        data-annotation-text-overlay-text="foreground"
      >
        {textContent}
      </div>
    </div>
  );
};
