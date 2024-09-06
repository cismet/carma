import React, { useEffect, useState } from "react";
import { OverlayHelperHightlighterProps, HighlightRect, Secondary } from "..";
import { getContainerPosition, getElementPosition } from "./utils/helper";

export function LibHelperOverlay({
  configs,
  closeOverlay,
  transparency = 0.8,
  color = "black",
}: OverlayHelperHightlighterProps) {
  const [hightlightRects, setHightlightRects] = useState<HighlightRect[]>([]);
  useEffect(() => {
    configs.forEach((currentItem) => {
      let secondary: JSX.Element | string | undefined = undefined;
      if (currentItem.secondary) {
        secondary = currentItem.secondary.content;
      }
      const { el, content, containerPos, contentPos, contentWidth } =
        currentItem;
      const rect = el.getBoundingClientRect();
      const pos = getContainerPosition(containerPos);
      const contPos = getElementPosition(contentPos);

      setHightlightRects((prev) => [
        ...prev,
        {
          rect,
          content,
          pos,
          contentPos,
          contPos,
          contentWidth,
          ...(secondary && { secondary }),
        },
      ]);
    });
  }, [configs]);

  const handleMessageClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        zIndex: 1000,
        width: "100vw",
        height: "100vh",
        background: color,
        opacity: transparency,
      }}
      onClick={() => closeOverlay()}
    >
      {hightlightRects.map((config, idx) => {
        let secondary: JSX.Element | string | undefined = undefined;
        if (config.secondary) {
          secondary = config.secondary;
        }
        const { rect, content, pos, contPos, contentWidth } = config;

        return (
          <div
            key={idx}
            onClick={(e) => handleMessageClick(e)}
            style={{
              position: "absolute",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              color: "white",
              ...pos,
            }}
          >
            <span
              style={{
                position: "absolute",
                width: contentWidth === "default" ? "auto" : contentWidth,
                ...contPos,
              }}
            >
              {content}
              {secondary && secondary}
            </span>
          </div>
        );
      })}
    </div>
  );
}
