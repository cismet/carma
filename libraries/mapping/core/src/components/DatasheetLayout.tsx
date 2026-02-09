import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { useDatasheet } from "@carma-mapping/contexts";

export interface DatasheetLayoutProps {
  mainMap: ReactNode;
  datasheetContent: ReactNode;
  /** Called after switching back to map view, so the consumer can call map.resize() */
  onReturnToMap?: () => void;
}

export const DatasheetLayout = ({
  mainMap,
  datasheetContent,
  onReturnToMap,
}: DatasheetLayoutProps) => {
  const { isDatasheetOpen } = useDatasheet();
  const prevOpenRef = useRef(isDatasheetOpen);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isDatasheetOpen;

    if (!isDatasheetOpen && wasOpen) {
      requestAnimationFrame(() => {
        onReturnToMap?.();
      });
    }
  }, [isDatasheetOpen, onReturnToMap]);

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  };

  return (
    <div style={containerStyle}>
      {/* Main map: always mounted, visibility toggled via display */}
      <div
        style={{
          display: isDatasheetOpen ? "none" : "block",
          width: "100%",
          height: "100%",
        }}
      >
        {mainMap}
      </div>

      {/* Datasheet content */}
      <div
        style={{
          display: isDatasheetOpen ? "flex" : "none",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#fff",
        }}
      >
        {datasheetContent}
      </div>
    </div>
  );
};
