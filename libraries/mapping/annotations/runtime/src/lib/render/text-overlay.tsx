import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  type AnnotationLineLabelOptions,
  annotationLineLabelDefaults,
} from "../config/annotation-line-label-options";
import {
  applyTextOverlayOptions,
  applyTextOverlayStyleOptions,
  getTextOverlayStyleOptionVars,
  type TextOverlayStyleOptions,
} from "./text-overlay-css";

import "./text-overlay.css";

const TEXT_OVERLAY_CLASS_NAMES = Object.freeze({
  root: "carma-annotation-text-overlay",
  backdrop: "carma-annotation-text-overlay__backdrop",
  surface: "carma-annotation-text-overlay__surface",
  textEcho: "carma-annotation-text-overlay__text-echo",
  text: "carma-annotation-text-overlay__text",
});

const TEXT_ECHO_SELECTOR = '[data-annotation-text-overlay-text-echo="true"]';
const TEXT_SELECTOR = '[data-annotation-text-overlay-text="foreground"]';

export const TEXT_OVERLAY_AREA_LABEL_STYLE: TextOverlayStyleOptions =
  Object.freeze({
    fontSize: "17px",
    letterSpacing: "5%",
    fontWeight: 800,
    // a tight, light rim keeps the white text readable on bright fills
    // without darkening the area around it
    textEchoBlurPx: 4,
    textEchoShadow: "0 0 2px rgba(2, 6, 23, 0.42), 0 0 6px rgba(2, 6, 23, 0.3)",
  });

type TextOverlayProps = {
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

const createDiv = (className: string) => {
  const element = document.createElement("div");
  element.className = className;
  return element;
};

/** The imperative twin of {@link TextOverlay}, for overlays drawn outside React. */
export const createTextOverlayElement = ({
  accentColor,
  visualOptions,
  styleOptions,
}: {
  accentColor?: string;
  visualOptions?: AnnotationLineLabelOptions;
  styleOptions?: TextOverlayStyleOptions;
}) => {
  const element = createDiv(TEXT_OVERLAY_CLASS_NAMES.root);
  const backdrop = createDiv(TEXT_OVERLAY_CLASS_NAMES.backdrop);
  const surface = createDiv(TEXT_OVERLAY_CLASS_NAMES.surface);
  const textEcho = createDiv(TEXT_OVERLAY_CLASS_NAMES.textEcho);
  const text = createDiv(TEXT_OVERLAY_CLASS_NAMES.text);
  textEcho.dataset.annotationTextOverlayTextEcho = "true";
  text.dataset.annotationTextOverlayText = "foreground";
  applyTextOverlayOptions({
    element,
    backdrop,
    surface,
    accentColor,
    visualOptions,
  });
  applyTextOverlayStyleOptions(element, styleOptions);
  element.append(backdrop, surface, textEcho, text);
  return element;
};

export const setTextOverlayText = (
  element: HTMLElement,
  textContent: string
) => {
  [TEXT_SELECTOR, TEXT_ECHO_SELECTOR].forEach((selector) => {
    const target = element.querySelector(selector);
    if (target && target.textContent !== textContent) {
      target.textContent = textContent;
    }
  });
};

const toTextContent = (value: ReactNode): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

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
}): CSSProperties => {
  const fontSizeFallback =
    styleOptions?.fontSize === undefined ? fontSize : undefined;

  return {
    pointerEvents: hasInteraction ? "auto" : "none",
    cursor: hasInteraction ? "pointer" : "default",
    "--carma-annotation-text-overlay-font-family":
      visualOptions.text.fontFamily,
    "--carma-annotation-text-overlay-font-weight": String(
      visualOptions.text.fontWeight
    ),
    ...(fontSizeFallback
      ? { "--carma-annotation-text-overlay-font-size": fontSizeFallback }
      : {}),
    ...getTextOverlayStyleOptionVars(styleOptions),
    ...(textColor
      ? { "--carma-annotation-text-overlay-text-color": textColor }
      : {}),
    ...(surfaceBlendMode
      ? {
          "--carma-annotation-text-overlay-backdrop-blend-mode":
            surfaceBlendMode,
          "--carma-annotation-text-overlay-surface-blend-mode":
            surfaceBlendMode,
        }
      : {}),
  } as CSSProperties;
};

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

  const handlePointerDown = useCallback(() => {
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
  }, [clearLongPressTimer, longPressDurationMs, onLongPress]);

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
