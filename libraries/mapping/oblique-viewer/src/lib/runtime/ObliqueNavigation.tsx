import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlane,
  faRotateLeft,
  faRotateRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Spin, Tooltip } from "antd";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useObliqueViewerActions } from "./oblique-actions";
import { strings } from "./strings.de";

const BUTTON_SIZE = "40px";

/** The legacy compact 2-by-3 navigation stays on the map when the information panel closes. */
export const ObliqueNavigation = () => {
  const {
    isOn,
    isLoading,
    isBusy,
    viewMode,
    selectedImageId,
    selectedSeriesId,
    series,
    canPan,
    previewVisible,
    sendRequest,
  } = useObliqueViewerActions();
  if (!isOn || viewMode === "objectCoverage") return null;
  const ready =
    selectedImageId !== null &&
    series.some((entry) => entry.enabled && entry.id === selectedSeriesId);
  const held = isBusy || !ready;
  const pan = (
    horizontal: number,
    vertical: number,
    label: string,
    arrow: string,
    position: string
  ) => (
    <Tooltip title={label} placement="top">
      <ControlButtonStyler
        type="button"
        aria-label={label}
        disabled={held || !canPan}
        onClick={() => sendRequest({ type: "pan", horizontal, vertical })}
        width={BUTTON_SIZE}
        height={BUTTON_SIZE}
        className={`pointer-events-auto select-none ${position}`}
      >
        {arrow}
      </ControlButtonStyler>
    </Tooltip>
  );
  const rotate = (clockwise: boolean, position: string) => {
    const label = clockwise ? strings.rotateRight : strings.rotateLeft;
    return (
      <Tooltip title={label} placement="top">
        <ControlButtonStyler
          type="button"
          aria-label={label}
          disabled={held}
          onClick={() => sendRequest({ type: "rotate", clockwise })}
          width={BUTTON_SIZE}
          height={BUTTON_SIZE}
          className={`pointer-events-auto select-none ${position}`}
        >
          <FontAwesomeIcon
            icon={clockwise ? faRotateRight : faRotateLeft}
            className="text-xs"
          />
        </ControlButtonStyler>
      </Tooltip>
    );
  };
  return (
    <div
      aria-label="Schrägluftbild-Navigation"
      role="group"
      data-test-id="oblique-navigation"
      style={{
        position: "absolute",
        bottom: "60px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <Tooltip
        title={
          previewVisible
            ? strings.closePreviewTooltip
            : strings.flyToImageTooltip
        }
        placement="top"
      >
        <ControlButtonStyler
          type="button"
          disabled={held && !previewVisible}
          onClick={() => sendRequest({ type: "flyToImage" })}
          width="160px"
          height={BUTTON_SIZE}
          className="pointer-events-auto select-none"
        >
          <span className="flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={previewVisible ? faXmark : faPlane} />
            {previewVisible ? strings.closePreview : strings.flyToImage}
          </span>
        </ControlButtonStyler>
      </Tooltip>
      <div className="relative grid grid-cols-3 grid-rows-2 gap-1 p-0">
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Spin size="small" />
          </div>
        )}
        {rotate(false, "col-start-1 row-start-1")}
        {pan(0, 1, strings.siblingUp, "↑", "col-start-2 row-start-1")}
        {rotate(true, "col-start-3 row-start-1")}
        {pan(-1, 0, strings.siblingLeft, "←", "col-start-1 row-start-2")}
        {pan(0, -1, strings.siblingDown, "↓", "col-start-2 row-start-2")}
        {pan(1, 0, strings.siblingRight, "→", "col-start-3 row-start-2")}
      </div>
    </div>
  );
};
