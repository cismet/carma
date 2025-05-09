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
          {topLeftControls.map((control) => (
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
          {topRightControls.map((control) => (
            <>{control.component}</>
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
          {topCenterControls.map((control) => (
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
          {bottomLeftControls.map((control) => (
            <>{control.component}</>
          ))}
        </div>
      )}

      {bottomRightControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            zIndex: 500,
            margin: "10px 10px 5px 10px",
          }}
        >
          {bottomRightControls.map((control) => (
            <>{control.component}</>
          ))}
        </div>
      )}

      {bottomCenterControls.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 500,
            margin: "10px",
          }}
        >
          {bottomCenterControls.map((control) => (
            <>{control.component}</>
          ))}
        </div>
      )}
    </>
  );
}

export default ControlRenderer;
