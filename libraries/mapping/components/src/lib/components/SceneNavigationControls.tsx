import type { CSSProperties, MouseEventHandler } from "react";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { CompassNeedleSVG } from "./PitchingControl/CompassNeedleSVG";

type NavigationButtonConfig = {
  disabled?: boolean;
  tooltip: string;
  title: string;
  dataTestId: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

type NavigationCompassConfig = {
  bearingDeg?: number;
  pitchDeg?: number;
  disabled?: boolean;
  tooltip: string;
  title: string;
  dataTestId: string;
  cursor?: CSSProperties["cursor"];
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
};

export type SceneNavigationControlsProps = {
  disabled?: boolean;
  style?: CSSProperties;
  home?: NavigationButtonConfig | null;
  zoomIn?: NavigationButtonConfig | null;
  zoomOut?: NavigationButtonConfig | null;
  compass?: NavigationCompassConfig | null;
};

export const SceneNavigationControls = ({
  disabled = false,
  style,
  home = null,
  zoomIn = null,
  zoomOut = null,
  compass = null,
}: SceneNavigationControlsProps) => {
  const effectiveStyle: CSSProperties = {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 1600,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    pointerEvents: disabled ? "none" : "auto",
    opacity: disabled ? 0.55 : 1,
    ...style,
  };

  return (
    <div style={effectiveStyle}>
      {home ? (
        <Tooltip title={home.tooltip} placement="right">
          <ControlButtonStyler
            type="button"
            onClick={home.onClick}
            disabled={disabled || home.disabled}
            useDisabledStyle={true}
            dataTestId={home.dataTestId}
            title={home.title}
          >
            <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
          </ControlButtonStyler>
        </Tooltip>
      ) : null}

      {zoomIn || zoomOut ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {zoomIn ? (
            <Tooltip title={zoomIn.tooltip} placement="right">
              <ControlButtonStyler
                type="button"
                onClick={zoomIn.onClick}
                disabled={disabled || zoomIn.disabled}
                useDisabledStyle={true}
                dataTestId={zoomIn.dataTestId}
                title={zoomIn.title}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
            </Tooltip>
          ) : null}

          {zoomOut ? (
            <Tooltip title={zoomOut.tooltip} placement="right">
              <ControlButtonStyler
                type="button"
                onClick={zoomOut.onClick}
                disabled={disabled || zoomOut.disabled}
                useDisabledStyle={true}
                dataTestId={zoomOut.dataTestId}
                title={zoomOut.title}
                className="!rounded-t-none !border-t-[1px]"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      {compass ? (
        <Tooltip title={compass.tooltip} placement="right">
          <ControlButtonStyler
            type="button"
            onMouseDown={compass.onMouseDown}
            onClick={compass.onClick}
            onDoubleClick={compass.onDoubleClick}
            disabled={disabled || compass.disabled}
            useDisabledStyle={disabled || compass.disabled}
            dataTestId={compass.dataTestId}
            title={compass.title}
            width="34px"
            height="34px"
          >
            <div
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor:
                  disabled || compass.disabled
                    ? "default"
                    : compass.cursor ?? "pointer",
              }}
            >
              <CompassNeedleSVG
                pitch={compass.pitchDeg ?? 0}
                heading={compass.bearingDeg ?? 0}
              />
            </div>
          </ControlButtonStyler>
        </Tooltip>
      ) : null}
    </div>
  );
};
