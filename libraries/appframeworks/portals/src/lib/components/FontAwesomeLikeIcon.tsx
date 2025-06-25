import React from "react";

interface FontAwesomeLikeIconProps {
  src: string;
  id?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  blendMode?: "darken" | "multiply" | "normal";
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
  blendMode = "multiply",
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
