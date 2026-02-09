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

  const layerStyle = (visible: boolean): CSSProperties => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    visibility: visible ? "visible" : "hidden",
    pointerEvents: visible ? "auto" : "none",
  });

  return (
    <div style={containerStyle}>
      {/* Main map: always mounted, keeps canvas dimensions via visibility */}
      <div style={layerStyle(!isDatasheetOpen)}>{mainMap}</div>

      {/* Datasheet content */}
      <div
        style={{
          ...layerStyle(isDatasheetOpen),
          display: "flex",
          flexDirection: "column",
          background: "#fff",
        }}
      >
        {datasheetContent}
      </div>
    </div>
  );
};
