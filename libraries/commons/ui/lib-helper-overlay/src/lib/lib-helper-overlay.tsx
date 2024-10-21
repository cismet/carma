import React, { useEffect, useState, cloneElement, useContext, memo } from "react";
import { OverlayHelperHightlighterProps, HighlightRect } from "..";
import { getContainerPosition, getElementPosition } from "./utils/helper";
import { Popover } from "antd";
import { OverlayTourContext } from "./components/OverlayTourProvider";

function LibHelperOverlay({
  closeOverlay,
  transparency = 0.8,
  color = "black",
}: OverlayHelperHightlighterProps) {
  const [hightlightRects, setHightlightRects] = useState<HighlightRect[]>([]);

  const overlayTourContext = useContext(OverlayTourContext);

  if (overlayTourContext === null) {
    return null;
  }

  const { configs, secondaryKey, setSecondaryKey } = overlayTourContext;

  const showSecondaryByIdHelper = (key: string) => {
    if (secondaryKey) {
      return secondaryKey === key;
    } else {
      return false;
    }
  };
  useEffect(() => {
    configs.forEach((currentItem) => {
      const {
        key,
        el,
        content,
        containerPos = "center",
        contentPos = "center",
        contentWidth,
        position,
        secondary,
      } = currentItem;
      const rect = el && el.getBoundingClientRect();
      const pos = getContainerPosition(containerPos);
      const contPos = getElementPosition(contentPos);

      setHightlightRects((prev) => [
        ...prev,
        {
          key,
          rect: rect ? rect : null,
          content,
          pos,
          contentPos,
          contPos,
          contentWidth,
          position,
          secondary: secondary?.content,
          secondaryPos: secondary?.secondaryPos
            ? secondary?.secondaryPos
            : "top",
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
      onClick={() => {
        if (secondaryKey) {
          setSecondaryKey(null);
        } else {
          closeOverlay && closeOverlay();
        }
      }}
    >
      {hightlightRects.map((config, idx) => {
        const {
          rect,
          key,
          content,
          pos,
          contPos,
          contentWidth,
          position,
          secondary,
          secondaryPos,
        } = config;

        return (
          <div
            key={idx}
            onClick={(e) => handleMessageClick(e)}
            style={
              rect
                ? {
                  position: "absolute",
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                  color: "white",
                  ...pos,
                }
                : position
            }
          >
            <span
              onClick={() => {
                if (secondaryKey === key) {
                  setSecondaryKey(null);
                } else {
                  setSecondaryKey(key);
                }
              }}
              style={{
                position: "absolute",
                width: contentWidth === "default" ? "auto" : contentWidth,
                ...contPos,
              }}
            >
              {secondary ? (
                <Popover
                  content={
                    secondary && typeof secondary !== "string" ? (
                      cloneElement(secondary, {
                        setSecondaryKey,
                      })
                    ) : (
                      <div>{secondary}</div>
                    )
                  }
                  open={showSecondaryByIdHelper(key)}
                  arrow={true}
                  placement={secondaryPos}
                  autoAdjustOverflow={true}
                >
                  <span
                    style={{
                      cursor: "pointer",
                    }}
                  >
                    {content}
                  </span>
                </Popover>
              ) : (
                content
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default memo(LibHelperOverlay);