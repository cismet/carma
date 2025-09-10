import { CSSProperties } from "react";

export const debugComponentsContainerRightStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  width: "450px",
  maxWidth: "calc(100vw - 20px)",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  zIndex: 1000,
};

export const debugComponentsContainerLeftStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  left: "60px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  zIndex: 1000,
};
