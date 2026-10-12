import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEventHandler,
  type RefObject,
} from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

type BackdropProps = {
  /** percent */
  contrast: number;
  /** percent */
  brightness?: number;
  /** percent */
  saturation?: number;
  color?: string;
  filterEnabled?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  panEnabled?: boolean;
  /** NG's controlled fade also applies before the shared scene becomes available. */
  opacityRef?: RefObject<number>;
  map?: MaplibreMap;
};

/**
 * The sheet between the map and the preview image: it tints and filters
 * the map showing through, catches the click that closes the preview, and
 * lets the preview controller capture drags for off-center panning.
 */
export const Backdrop = ({
  contrast,
  brightness = 100,
  saturation = 100,
  color,
  onClick,
  interactive = true,
  panEnabled = true,
  filterEnabled = true,
  opacityRef,
  map,
}: BackdropProps) => {
  const elementRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opacityRef || !map) return;
    const sync = () => {
      const element = elementRef.current;
      if (!element) return;
      const opacity = String(Math.max(0, Math.min(1, opacityRef.current ?? 1)));
      if (element.style.opacity !== opacity) element.style.opacity = opacity;
    };
    sync();
    // The existing controller requests these camera frames; no second RAF or React render loop.
    map.on("render", sync);
    return () => {
      map.off("render", sync);
    };
  }, [map, opacityRef]);
  const filterValue = filterEnabled
    ? `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%)`
    : "none";
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundColor: color,
    // This initial value must be present in the first DOM commit, before effects/scene admission.
    opacity: opacityRef
      ? Math.max(0, Math.min(1, opacityRef.current ?? 1))
      : undefined,
    WebkitBackdropFilter: filterValue,
    backdropFilter: filterValue,
    // At the NG scene handoff the DOM filter must clear immediately; the shared
    // renderer owns the fade and must not receive a second fading filter on top.
    transition:
      opacityRef && !filterEnabled
        ? "none"
        : "backdrop-filter 0.25s linear, -webkit-backdrop-filter 0.25s linear",
    cursor:
      interactive && panEnabled
        ? "var(--oblique-preview-cursor, grab)"
        : "default",
    pointerEvents: interactive ? "auto" : "none",
    touchAction: "none",
    zIndex: 1,
  };

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!onClick) return;
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={elementRef}
      style={style}
      role="button"
      tabIndex={0}
      aria-label="Bildvorschau beenden"
      onClick={onClick}
      onKeyDown={onKeyDown}
    />
  );
};
