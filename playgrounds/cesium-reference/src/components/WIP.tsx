import React from "react";

const WIP: React.FC = () => {
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
      Under Construction
    </div>
  );
};

export default WIP;
