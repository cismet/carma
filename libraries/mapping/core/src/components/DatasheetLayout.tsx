import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useDatasheet } from "@carma-mapping/contexts";

export interface DatasheetLayoutProps {
  mainMap: ReactNode;
  datasheetContent: ReactNode;
  /** Transition duration in ms */
  transitionDuration?: number;
  /** Opacity of the main map when visible (default 1) */
  mapOpacity?: number;
  /** Called after switching back to map view, so the consumer can call map.resize() */
  onReturnToMap?: () => void;
}

const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

export const DatasheetLayout = ({
  mainMap,
  datasheetContent,
  transitionDuration = 300,
  mapOpacity = 1,
  onReturnToMap,
}: DatasheetLayoutProps) => {
  const { isDatasheetOpen } = useDatasheet();
  const prevOpenRef = useRef(isDatasheetOpen);

  // Track whether the datasheet has ever been opened (to skip transition on mount)
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isDatasheetOpen;

    if (isDatasheetOpen && !wasOpen) {
      setHasAnimated(true);
    }

    if (!isDatasheetOpen && wasOpen) {
      requestAnimationFrame(() => {
        onReturnToMap?.();
      });
    }
  }, [isDatasheetOpen, onReturnToMap]);

  const transition = hasAnimated
    ? `opacity ${transitionDuration}ms ${EASING}, transform ${transitionDuration}ms ${EASING}`
    : "none";

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  };

  const mapStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: isDatasheetOpen ? 0 : mapOpacity,
    pointerEvents: isDatasheetOpen ? "none" : "auto",
    transition,
    zIndex: 1,
  };

  const datasheetStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    opacity: isDatasheetOpen ? 1 : 0,
    transform: isDatasheetOpen ? "translateY(0)" : "translateY(30px)",
    pointerEvents: isDatasheetOpen ? "auto" : "none",
    transition,
    zIndex: 2,
  };

  return (
    <div style={containerStyle}>
      <div style={mapStyle}>{mainMap}</div>
      <div style={datasheetStyle}>{datasheetContent}</div>
    </div>
  );
};
