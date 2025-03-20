import type { Map } from "maplibre-gl";
import CompassNeedleSVG from "./CompassNeedleSVG";
import { useEffect, useState } from "react";

interface LibrePitchingCompassProps {
  mapRef: React.RefObject<Map | null>;
}

export const LibrePitchingCompass = ({ mapRef }: LibrePitchingCompassProps) => {
  const [isControlMouseDown, setIsControlMouseDown] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialHeading, setInitialHeading] = useState(0);
  const [initialPitch, setInitialPitch] = useState(0);
  const currentPitch = mapRef?.current?.getPitch() ?? 0;
  const currentHeading = mapRef?.current?.getBearing() ?? 0;

  const handleControlMouseUp = () => {
    setIsControlMouseDown(false);
  };

  useEffect(() => {
    if (!isControlMouseDown) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!isControlMouseDown) return;
      if (mapRef.current) {
        const deltaX = event.clientX - initialMouseX;
        const deltaY = event.clientY - initialMouseY;

        const newHeading = (initialHeading + deltaX * 0.3) % 360;

        const newPitch = Math.max(0, Math.min(85, initialPitch - deltaY * 0.3));

        mapRef.current.setBearing(newHeading);
        mapRef.current.setPitch(newPitch);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleControlMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleControlMouseUp);
    };
  }, [isControlMouseDown]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="cesium-orbit-control-button"
      onMouseDown={(e) => {
        if (mapRef.current) {
          setIsControlMouseDown(true);
          setInitialMouseX(e.clientX);
          setInitialMouseY(e.clientY);
          setInitialHeading(mapRef.current.getBearing());
          setInitialPitch(mapRef.current.getPitch());
        }
      }}
      onMouseUp={handleControlMouseUp}
      onClick={() => {
        mapRef?.current?.setPitch(0);
        mapRef?.current?.setBearing(0);
      }}
      style={{
        border: "none",
        background: "transparent",
        width: "28px",
        height: "28px",
        display: "flex",
        margin: "0px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <CompassNeedleSVG pitch={currentPitch} heading={currentHeading} />
    </div>
  );
};
