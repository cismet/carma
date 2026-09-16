import type { CSSProperties } from "react";
import { type ControlComponent, useControlContext } from "../map-control";
import { filterControls, sortControls } from "../utils/controlHelper";
import { DEFAULT_CONTROL_STYLE_OPTIONS } from "./control-styles";

interface ControlRendererProps {
  controls: ControlComponent[];
}

/**
 * The display a control's wrapper gets while the layout hides its controls.
 * `none` takes the control off the screen without unmounting it, so its
 * children keep their state; the wrapper is otherwise `contents`, which
 * leaves the group's flex layout exactly as if there were no wrapper.
 */
const wrapperDisplay = (
  control: ControlComponent,
  controlsHidden: boolean
): CSSProperties["display"] =>
  controlsHidden && !control.keepWhenHidden ? "none" : "contents";

function ControlRenderer({ controls }: ControlRendererProps) {
  const { renderer } = DEFAULT_CONTROL_STYLE_OPTIONS;
  const { controlsHidden } = useControlContext();
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

  // the item wrappers of the centre groups carry the display themselves; the
  // side groups get a layout-transparent wrapper per control for it
  const itemStyle = (
    base: CSSProperties,
    control: ControlComponent
  ): CSSProperties =>
    controlsHidden && !control.keepWhenHidden
      ? { ...base, display: "none" }
      : base;

  return (
    <>
      {topLeftControls.length > 0 && (
        <div style={renderer.topLeft}>
          {topLeftControls.map((control, index) => (
            <div
              key={`topLeft-${index}`}
              style={{ display: wrapperDisplay(control, controlsHidden) }}
            >
              {control.component}
            </div>
          ))}
        </div>
      )}

      {topRightControls.length > 0 && (
        <div style={renderer.topRight}>
          {topRightControls.map((control, index) => (
            <div
              key={`topRight-${index}`}
              style={{ display: wrapperDisplay(control, controlsHidden) }}
            >
              {control.component}
            </div>
          ))}
        </div>
      )}

      {topCenterControls.length > 0 && (
        <div style={renderer.topCenter}>
          {topCenterControls.map((control, index) => (
            <div
              style={itemStyle(renderer.topCenterItem, control)}
              key={`topCenter-${index}`}
            >
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
                <div
                  key={`bottomLeft-${index}`}
                  style={{ display: wrapperDisplay(control, controlsHidden) }}
                >
                  {control.component}
                </div>
              ))}
            </div>
          )}

          {bottomCenterControls.length > 0 && (
            <div style={renderer.bottomCenter}>
              {bottomCenterControls.map((control, index) => (
                <div
                  style={itemStyle(renderer.bottomCenterItem, control)}
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
                <div
                  key={`bottomRight-${index}`}
                  style={{ display: wrapperDisplay(control, controlsHidden) }}
                >
                  {control.component}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default ControlRenderer;
