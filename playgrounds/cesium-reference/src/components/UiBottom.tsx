import React from "react";

interface Props {
  children: React.ReactNode;
}

const UiBottom: React.FC<Props> = ({ children }) => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        left: 10,
        padding: "10px",
        background: "rgba(255, 255, 255, 0.85)",
      }}
    >
      {children}
    </div>
  );
};

export default UiBottom;
