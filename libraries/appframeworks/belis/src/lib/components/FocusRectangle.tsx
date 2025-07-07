import React from "react";

interface FocusRectangleProps {
  inFocusMode: boolean;
  mapWidth: number;
  mapHeight: number;
}

export const FocusRectangle = ({
  inFocusMode,
  mapWidth,
  mapHeight,
}: FocusRectangleProps) => {
  if (inFocusMode === true) {
    return (
      <div
        style={{
          position: "absolute",
          top: mapHeight / 4,
          left: mapWidth / 4,
          zIndex: 500,
          width: mapWidth / 2,
          height: mapHeight / 2,

          background: "#00000011",
          // margin: 10,
          pointerEvents: "none",
          border: "2px solid #ffffffbb",
        }}
      />
    );
  } else {
    return <div />;
  }
};
