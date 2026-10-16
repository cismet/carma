import { VectorTrapezoidIcon } from "@carma-commons/ui/components";

export const createAreaPlanarToolIcon = (iconLabel?: string) => (
  <span
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
    }}
  >
    {iconLabel ? (
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "max-content",
          fontSize: "1.34em",
          fontWeight: 700,
          lineHeight: 1,
          textAlign: "center",
          color: "#ffffff",
          WebkitTextStroke: "1px #000000",
          paintOrder: "stroke fill",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {iconLabel}
      </span>
    ) : null}
    <span
      style={{
        position: "relative",
        zIndex: 1,
        display: "inline-flex",
      }}
    >
      <VectorTrapezoidIcon fontSize="1.33em" />
    </span>
  </span>
);
