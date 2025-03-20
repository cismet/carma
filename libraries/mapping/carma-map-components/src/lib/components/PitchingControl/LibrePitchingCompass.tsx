import type { Map } from "maplibre-gl";
import CompassNeedleSVG from "./CompassNeedleSVG";

interface LibrePitchingCompassProps {
  mapRef: React.RefObject<Map | null>;
}

export const LibrePitchingCompass = ({ mapRef }: LibrePitchingCompassProps) => {
  const currentPitch = mapRef?.current?.getPitch() ?? 0;
  const currentHeading = mapRef?.current?.getBearing() ?? 0;

  console.log("xxx", currentPitch);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="cesium-orbit-control-button"
      //   onMouseDown={handleMouseDown}
      //   onMouseUp={handleControlMouseUp}
      onClick={() => {
        mapRef?.current?.setPitch(0);
        mapRef?.current?.setBearing(0);
      }}
      //   onDoubleClick={handleDoubleClick}
      style={{
        border: "none",
        background: "transparent",
        // TODO make sizing responsive to container size
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
