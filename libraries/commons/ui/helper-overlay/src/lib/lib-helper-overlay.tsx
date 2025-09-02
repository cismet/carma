import React, { useEffect, useState, cloneElement } from "react";
import { OverlayHelperHightlighterProps, HighlightRect } from "..";
import { getContainerPosition, getElementPosition } from "./utils/helper";
import { Popover } from "antd";

export function LibHelperOverlay({
  configs,
  closeOverlay,
  transparency = 0.8,
  color = "black",
  showSecondaryWithKey,
  openedSecondaryKey,
  showOverlay,
}: OverlayHelperHightlighterProps) {
  const [hightlightRects, setHightlightRects] = useState<HighlightRect[]>([]);
  const showSecondaryByIdHelper = (key: string) => {
    if (openedSecondaryKey) {
      return openedSecondaryKey === key;
    } else {
      return false;
    }
  };
  useEffect(() => {
    const setItems = () => {
      setHightlightRects([]);
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
    };

    setItems();

    window.addEventListener("resize", setItems);

    return () => {
      window.removeEventListener("resize", setItems);
    };
  }, [configs]);

  const handleMessageClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      data-test-id="overlay-helper-bg"
      style={{
        position: "fixed",
        display: "flex",
        flexDirection: "column",
        top: 0,
        zIndex: 1002,
        width: "100%",
        height: "100%",
        background: color,
        opacity: transparency,
      }}
      onClick={() => {
        if (openedSecondaryKey) {
          showSecondaryWithKey(null);
        } else {
          closeOverlay();
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
                if (openedSecondaryKey === key) {
                  showSecondaryWithKey(null);
                } else {
                  showSecondaryWithKey(key);
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
                        setSecondaryWithKey: showSecondaryWithKey,
                        showOverlay: showOverlay,
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
                    data-test-id={
                      secondary
                        ? "primary-with-secondary"
                        : "overlay-helper-primary"
                    }
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
