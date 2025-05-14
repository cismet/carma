import type { CSSProperties, FC } from "react";

export type BlendMode = "normal" | "difference" | "normal50";

interface PreviewImageProps {
  src: string;
  alt: string;
  fadeIn: boolean;
  width: number;
  height: number;
  borderStyle: string;
  boxShadowStyle: string;
  transform: string;
  isDebug?: boolean;
  blendMode: BlendMode;
}

export const PreviewImage: FC<PreviewImageProps> = ({
  src,
  alt,
  fadeIn,
  width,
  height,
  borderStyle,
  boxShadowStyle,
  transform,
  isDebug,
  blendMode,
}) => {
  const styleObj: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform,
    height,
    width,
    minWidth: `${width}px`,
    minHeight: `${height}px`,
    boxSizing: "content-box",
    pointerEvents: "none",
    zIndex: 1200,
    transition: "opacity 0.8s linear",
    overflow: "hidden",
    //scroll: "none",
  };

  if (blendMode === "normal50") {
    styleObj.mixBlendMode = "normal";
    styleObj.opacity = fadeIn ? 0.5 : 0;
  } else if (blendMode === "difference") {
    styleObj.mixBlendMode = "difference";
    styleObj.opacity = fadeIn ? 1 : 0;
  } else {
    // 'normal' or undefined
    styleObj.mixBlendMode = "normal";
    styleObj.opacity = fadeIn ? 1 : 0;
  }

  if (!isDebug) {
    styleObj.border = borderStyle;
    styleObj.boxShadow = boxShadowStyle;
    styleObj.backdropFilter = "contrast(50%)";
  }

  return <img src={src} alt={alt} style={styleObj} />;
};
