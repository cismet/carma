import { Fragment } from "react";
import { type ControlComponent } from "../map-control";
import { filterControls, sortControls } from "../utils/controlHelper";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "./control-styles";

interface ControlRendererProps {
  controls: ControlComponent[];
}

function ControlRenderer({ controls }: ControlRendererProps) {
  const { renderer } = DEFAULT_CONTROL_STYLE_OPTIONS;
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
  const hasBottomLeftControls = bottomLeftControls.length > 0;
  const bottomContainerStyle = {
    ...renderer.bottomContainer,
    justifyContent: hasBottomLeftControls ? "space-between" : "flex-end",
  };

  return (
    <>
      {topLeftControls.length > 0 && (
        <div style={renderer.topLeft}>
          {topLeftControls.map((control, index) => (
            <Fragment key={`topLeft-${index}`}>{control.component}</Fragment>
          ))}
        </div>
      )}

      {topRightControls.length > 0 && (
        <div style={renderer.topRight}>
          {topRightControls.map((control, index) => (
            <Fragment key={`topRight-${index}`}>{control.component}</Fragment>
          ))}
        </div>
      )}

      {topCenterControls.length > 0 && (
        <div style={renderer.topCenter}>
          {topCenterControls.map((control, index) => (
            <div style={renderer.topCenterItem} key={`topCenter-${index}`}>
              {control.component}
            </div>
          ))}
        </div>
      )}

      {(bottomLeftControls.length > 0 ||
        bottomRightControls.length > 0 ||
        bottomCenterControls.length > 0) && (
        <div style={bottomContainerStyle}>
          {hasBottomLeftControls && (
            <div style={renderer.bottomLeft}>
              {bottomLeftControls.map((control, index) => (
                <Fragment key={`bottomLeft-${index}`}>
                  {control.component}
                </Fragment>
              ))}
            </div>
          )}

          {bottomCenterControls.length > 0 && (
            <div style={renderer.bottomCenter}>
              {bottomCenterControls.map((control, index) => (
                <div
                  style={renderer.bottomCenterItem}
                  key={`bottomCenter-${index}`}
                >
                  {control.component}
                </div>
              ))}
            </div>
          )}

          {bottomRightControls.length > 0 && (
            <div style={renderer.bottomRight}>
              {bottomRightControls.map((control, index) => (
                <Fragment key={`bottomRight-${index}`}>
                  {control.component}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default ControlRenderer;
