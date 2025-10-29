import { default as React } from "react";
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
export declare const FontAwesomeLikeIcon: React.FC<FontAwesomeLikeIconProps>;
export default FontAwesomeLikeIcon;
