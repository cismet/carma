import type { CSSProperties, FC } from "react";

import {
  PREVIEW_HEIGHT_VAR,
  PREVIEW_WIDTH_VAR,
  PREVIEW_OFFSET_X_VAR,
  PREVIEW_OFFSET_Y_VAR,
} from "./hooks/usePreviewSizeSync";

type PreviewImageProps = {
  src: string;
  alt: string;
  /** fade in over 0.8 s rather than appear */
  fadeIn: boolean;
  /** shown at all; false keeps the element but hides it at once */
  shown: boolean;
  borderStyle?: string;
  boxShadowStyle?: string;
  /** puts the principal point on the screen centre */
  translate: string;
  /** turns the image about the screen centre, degrees */
  rollDeg: number;
};

/**
 * The image itself, centred on the principal point and sized by the CSS
 * variables the size sync writes. The roll goes on a wrapper turning about
 * the screen centre, which is where the principal point sits.
 */
export const PreviewImage: FC<PreviewImageProps> = ({
  src,
  alt,
  fadeIn,
  shown,
  borderStyle,
  boxShadowStyle,
  translate,
  rollDeg,
}) => {
  const wrapperStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    transform: `translate(var(${PREVIEW_OFFSET_X_VAR}, 0px), var(${PREVIEW_OFFSET_Y_VAR}, 0px)) rotate(${rollDeg}deg)`,
    transformOrigin: "50% 50%",
    pointerEvents: "none",
    zIndex: 2,
  };
  const imageStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: translate,
    width: `var(${PREVIEW_WIDTH_VAR}, 0px)`,
    height: `var(${PREVIEW_HEIGHT_VAR}, 0px)`,
    minWidth: `var(${PREVIEW_WIDTH_VAR}, 0px)`,
    minHeight: `var(${PREVIEW_HEIGHT_VAR}, 0px)`,
    boxSizing: "content-box",
    pointerEvents: "none",
    opacity: shown ? 1 : 0,
    transition: fadeIn ? "opacity 0.8s linear" : "opacity 0s linear",
    border: borderStyle,
    boxShadow: boxShadowStyle,
  };
  return (
    <div style={wrapperStyle}>
      <img src={src} alt={alt} style={imageStyle} draggable={false} />
    </div>
  );
};
