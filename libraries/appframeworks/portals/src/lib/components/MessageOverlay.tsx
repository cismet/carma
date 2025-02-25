import React from "react";

const MessageOverlay: React.FC<{
  message?: string;
}> = ({ message = "Experimental Feature Enabled" }) => {
  return (
    <div
      style={{
        position: "fixed",
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        userSelect: "none",
        pointerEvents: "none",
        transform: "rotate(-15deg)",
        zIndex: 1000,
        fontSize: "8vh",
        color: "rgba(255, 255, 255, 0.5)",
        mixBlendMode: "screen",
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
    >
      {message}
    </div>
  );
};

export default MessageOverlay;
