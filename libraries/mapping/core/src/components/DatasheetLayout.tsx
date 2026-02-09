import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useDatasheet } from "@carma-mapping/contexts";

type AnimationState =
  | "map"
  | "animating-open"
  | "datasheet"
  | "animating-close";

export interface DatasheetLayoutProps {
  mainMap: ReactNode;
  datasheetContent: ReactNode;
  miniMap: ReactNode;
  /** Capture a snapshot image from the main map canvas */
  getMainMapSnapshot: () => string | null;
  /** Capture a snapshot from the mini-map canvas */
  getMiniMapSnapshot?: () => string | null;
  /** Mini-map dimensions */
  miniMapWidth?: number;
  miniMapHeight?: number;
  /** Padding from bottom-right corner */
  miniMapPadding?: number;
  /** Transition duration in ms */
  transitionDuration?: number;
  /** Called after closing transition completes, so the consumer can call map.resize() */
  onReturnToMap?: () => void;
}

const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

export const DatasheetLayout = ({
  mainMap,
  datasheetContent,
  miniMap,
  getMainMapSnapshot,
  getMiniMapSnapshot,
  miniMapWidth = 350,
  miniMapHeight = 220,
  miniMapPadding = 16,
  transitionDuration = 400,
  onReturnToMap,
}: DatasheetLayoutProps) => {
  const { isDatasheetOpen, closeDatasheet } = useDatasheet();
  const containerRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<HTMLImageElement>(null);

  const [animState, setAnimState] = useState<AnimationState>("map");
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null);
  // Snapshot position: starts at one size, transitions to another
  const [snapshotStyle, setSnapshotStyle] = useState<CSSProperties>({});

  const prevOpenRef = useRef(isDatasheetOpen);

  // Compute mini-map target position (bottom-right corner)
  const getMiniMapPosition = useCallback((): CSSProperties => {
    const container = containerRef.current;
    if (!container) return {};
    const rect = container.getBoundingClientRect();
    return {
      position: "absolute",
      top: rect.height - miniMapHeight - miniMapPadding,
      left: rect.width - miniMapWidth - miniMapPadding,
      width: miniMapWidth,
      height: miniMapHeight,
      borderRadius: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      overflow: "hidden",
    };
  }, [miniMapWidth, miniMapHeight, miniMapPadding]);

  // Full-size position
  const getFullPosition = useCallback((): CSSProperties => {
    const container = containerRef.current;
    if (!container) return {};
    const rect = container.getBoundingClientRect();
    return {
      position: "absolute",
      top: 0,
      left: 0,
      width: rect.width,
      height: rect.height,
      borderRadius: 0,
      boxShadow: "none",
      overflow: "hidden",
    };
  }, []);

  // Handle open/close transitions
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isDatasheetOpen;

    if (isDatasheetOpen && !wasOpen) {
      // --- OPENING ---
      const snapshot = getMainMapSnapshot();
      if (!snapshot) {
        // No snapshot available, just switch immediately
        setAnimState("datasheet");
        return;
      }

      setSnapshotSrc(snapshot);
      // Start snapshot at full size
      setSnapshotStyle({
        ...getFullPosition(),
        transition: "none",
      });
      setAnimState("animating-open");

      // After one frame, transition snapshot to mini-map position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSnapshotStyle({
            ...getMiniMapPosition(),
            transition: `top ${transitionDuration}ms ${EASING}, left ${transitionDuration}ms ${EASING}, width ${transitionDuration}ms ${EASING}, height ${transitionDuration}ms ${EASING}, border-radius ${transitionDuration}ms ${EASING}, box-shadow ${transitionDuration}ms ${EASING}`,
          });
        });
      });
    } else if (!isDatasheetOpen && wasOpen) {
      // --- CLOSING ---
      const snapshot = getMiniMapSnapshot?.();
      if (!snapshot) {
        // No snapshot, just switch
        setAnimState("map");
        onReturnToMap?.();
        return;
      }

      setSnapshotSrc(snapshot);
      // Start snapshot at mini-map size
      setSnapshotStyle({
        ...getMiniMapPosition(),
        transition: "none",
      });
      setAnimState("animating-close");

      // After one frame, transition to full size
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSnapshotStyle({
            ...getFullPosition(),
            transition: `top ${transitionDuration}ms ${EASING}, left ${transitionDuration}ms ${EASING}, width ${transitionDuration}ms ${EASING}, height ${transitionDuration}ms ${EASING}, border-radius ${transitionDuration}ms ${EASING}, box-shadow ${transitionDuration}ms ${EASING}`,
          });
        });
      });
    }
  }, [
    isDatasheetOpen,
    getMainMapSnapshot,
    getMiniMapSnapshot,
    getFullPosition,
    getMiniMapPosition,
    transitionDuration,
    onReturnToMap,
  ]);

  // Handle transition end
  const handleTransitionEnd = useCallback(() => {
    if (animState === "animating-open") {
      setSnapshotSrc(null);
      setAnimState("datasheet");
    } else if (animState === "animating-close") {
      setSnapshotSrc(null);
      setAnimState("map");
      // Give the map a frame to become visible before resize
      requestAnimationFrame(() => {
        onReturnToMap?.();
      });
    }
  }, [animState, onReturnToMap]);

  const showMainMap = animState === "map";
  const showDatasheet =
    animState === "datasheet" ||
    animState === "animating-open" ||
    animState === "animating-close";
  const showMiniMap = animState === "datasheet";
  const showSnapshot =
    (animState === "animating-open" || animState === "animating-close") &&
    snapshotSrc != null;

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  };

  const mainMapStyle: CSSProperties = {
    display: showMainMap ? "block" : "none",
    width: "100%",
    height: "100%",
  };

  const datasheetStyle: CSSProperties = {
    display: showDatasheet ? "flex" : "none",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    background: "#fff",
  };

  const miniMapContainerStyle: CSSProperties = {
    ...getMiniMapPosition(),
    display: showMiniMap ? "block" : "none",
    zIndex: 10,
    cursor: "pointer",
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Main map: always mounted, visibility toggled via display */}
      <div style={mainMapStyle}>{mainMap}</div>

      {/* Datasheet overlay: content + mini-map */}
      <div style={datasheetStyle}>
        <div style={{ flex: 1, overflow: "auto" }}>{datasheetContent}</div>

        {/* Live mini-map: click overlay to return to full map view */}
        <div style={miniMapContainerStyle}>
          {miniMap}
          <div
            onClick={closeDatasheet}
            title="Zur Karte"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              cursor: "pointer",
              zIndex: 1,
            }}
          />
        </div>
      </div>

      {/* Snapshot image for CSS transition */}
      {showSnapshot && (
        <img
          ref={snapshotRef}
          src={snapshotSrc!}
          alt=""
          onTransitionEnd={handleTransitionEnd}
          style={{
            ...snapshotStyle,
            zIndex: 20,
            objectFit: "cover",
            pointerEvents: "none",
            display: "block",
          }}
        />
      )}
    </div>
  );
};
