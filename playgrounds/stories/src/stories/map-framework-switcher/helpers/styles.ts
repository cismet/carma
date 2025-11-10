export const styles = {
  topLeftAbsolute: {
    position: "absolute" as const,
    top: "16px",
    left: "16px",
    zIndex: 1000,
  },
  topCenterAbsolute: {
    position: "absolute" as const,
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 1000,
  },
  bottomLeftAbsolute: {
    position: "absolute" as const,
    bottom: "16px",
    left: "16px",
    zIndex: 1000,
  },
};
