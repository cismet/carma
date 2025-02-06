import React from "react";

const WIP: React.FC<{
  message?: string;
}> = ({ message = "Work in Progress" }) => {
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
        transform: "rotate(-30deg)",
        zIndex: 1000,
        fontSize: "10vw",
        color: "rgba(255, 0, 0, 0.5)",
        backgroundColor: "transparent",
      }}
    >
      {message}
    </div>
  );
};

export default WIP;
