import type { CSSProperties, KeyboardEventHandler } from "react";

type BackdropProps = {
  /** percent */
  contrast: number;
  /** percent */
  brightness?: number;
  /** percent */
  saturation?: number;
  color?: string;
  onClick?: () => void;
  interactive?: boolean;
};

/**
 * The sheet between the map and the preview image: it tints and filters
 * the map showing through, catches the click that closes the preview, and
 * blocks the drag that would move the map out from under the image.
 */
export const Backdrop = ({
  contrast,
  brightness = 100,
  saturation = 100,
  color,
  onClick,
  interactive = true,
}: BackdropProps) => {
  const filterValue = `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%)`;
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundColor: color,
    WebkitBackdropFilter: filterValue,
    backdropFilter: filterValue,
    transition:
      "backdrop-filter 1.2s linear, -webkit-backdrop-filter 1.2s linear",
    cursor: interactive ? "pointer" : "default",
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
      style={style}
      role="button"
      tabIndex={0}
      aria-label="Bildvorschau beenden"
      onClick={onClick}
      onKeyDown={onKeyDown}
    />
  );
};
