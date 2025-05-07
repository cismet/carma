import { type ControlComponent } from "../map-control";
import { filterControls, sortControls } from "../utils/controlHelper";

interface ControlRendererProps {
  controls: ControlComponent[];
}

function ControlRenderer({ controls }: ControlRendererProps) {
  const topLeftControls = controls
    .filter((c) => filterControls(c, "topleft"))
    .sort(sortControls);
  const topRightControls = controls
    .filter((c) => filterControls(c, "topright"))
    .sort(sortControls);
  const topCenterControls = controls
    .filter((c) => filterControls(c, "topcenter"))
    .sort(sortControls);
  const bottomLeftControls = controls
    .filter((c) => filterControls(c, "bottomleft"))
    .sort(sortControls);
  const bottomRightControls = controls
    .filter((c) => filterControls(c, "bottomright"))
    .sort(sortControls);
  const bottomCenterControls = controls
    .filter((c) => filterControls(c, "bottomcenter"))
    .sort(sortControls);

  return (
    <>
      {topLeftControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 500,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            margin: "10px",
          }}
        >
          {topLeftControls.map((control, index) => (
            <>{control.component}</>
          ))}
        </div>
      )}

      {topRightControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 500,
            margin: "10px",
          }}
        >
          {topRightControls.map((control, index) => (
            <div key={`top-right-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {topCenterControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "44px",
            right: "44px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 1000,
            margin: "10px",
            fontSize: "14px",
            alignItems: "center",
          }}
        >
          {topCenterControls.map((control, index) => (
            <>{control.component}</>
          ))}
        </div>
      )}

      {bottomLeftControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            zIndex: 500,
            margin: "10px 10px 5px 10px",
          }}
        >
          {bottomLeftControls.map((control, index) => (
            <>{control.component}</>
          ))}
        </div>
      )}

      {bottomRightControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            right: "10px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column-reverse",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          {bottomRightControls.map((control, index) => (
            <div key={`bottom-right-${index}`}>{control.component}</div>
          ))}
        </div>
      )}

      {bottomCenterControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {bottomCenterControls.map((control, index) => (
            <div key={`bottom-center-${index}`}>{control.component}</div>
          ))}
        </div>
      )}
    </>
  );
}

export default ControlRenderer;
