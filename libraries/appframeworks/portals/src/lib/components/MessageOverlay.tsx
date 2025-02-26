import React from "react";

export const MessageOverlay: React.FC<{
  message?: string;
}> = ({ message = "Experimental Feature Enabled" }) => {
  return (
    <div
      style={{
        position: "absolute",
        width: "100vw",
        height: "100%",
        paddingBottom: "7%",
        display: "flex",
        justifyContent: "center",
        alignItems: "end",
        userSelect: "none",
        pointerEvents: "none",
        //transform: "rotate(-15deg)",
        zIndex: 1000,
        fontSize: "3vw",
        color: "rgba(255, 255, 255, 0.5)",
        mixBlendMode: "screen",
        backgroundColor: "transparent",
        textShadow: "0 0 8px grey",
        overflow: "hidden",
      }}
    >
      {message}
    </div>
  );
};

export default MessageOverlay;
