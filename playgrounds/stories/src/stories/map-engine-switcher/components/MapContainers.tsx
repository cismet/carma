import type { RefObject } from "react";

interface MapContainersProps {
  leafletContainerRef: RefObject<HTMLDivElement>;
  cesiumContainerRef: RefObject<HTMLDivElement>;
  children?: React.ReactNode;
}

export const MapContainers = ({
  leafletContainerRef,
  cesiumContainerRef,
  children,
}: MapContainersProps) => {
  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div
        ref={leafletContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      />
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 2,
        }}
      />
      {children}
    </div>
  );
};
