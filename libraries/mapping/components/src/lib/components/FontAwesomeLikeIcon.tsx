import React from "react";

import { CSS_MIX_BLEND_MODE } from "@carma-commons/dom/document";

type FontAwesomeLikeIconBlendMode =
  | typeof CSS_MIX_BLEND_MODE.DARKEN
  | typeof CSS_MIX_BLEND_MODE.MULTIPLY
  | typeof CSS_MIX_BLEND_MODE.NORMAL;

interface FontAwesomeLikeIconProps {
  src: string;
  id?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  blendMode?: FontAwesomeLikeIconBlendMode;
}

/**
 * A component that mimics FontAwesome icon behavior but uses custom images.
 * Automatically centers the image, scales to fit container, and maintains aspect ratio.
 */
export const FontAwesomeLikeIcon: React.FC<FontAwesomeLikeIconProps> = ({
  src,
  id,
  alt = "Icon",
  className = "",
  blendMode = CSS_MIX_BLEND_MODE.MULTIPLY,
  style = {},
}) => {
  return (
    <img
      id={id}
      src={src}
      alt={alt}
      className={`inline-block ${className}`}
      style={{
        width: "1em",
        height: "1em",
        objectFit: "contain",
        verticalAlign: "middle",
        mixBlendMode: blendMode,
        ...style,
      }}
    />
  );
};

export default FontAwesomeLikeIcon;
