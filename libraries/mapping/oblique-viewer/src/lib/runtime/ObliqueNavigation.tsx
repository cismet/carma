import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlane,
  faRotateLeft,
  faRotateRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import {
  OBLIQUE_NAVIGATION_KEYS,
  OBLIQUE_NAVIGATION_INTENT,
  type ObliqueNavigationKey,
  useObliqueViewerActions,
} from "./oblique-actions";
import { strings } from "./strings.de";

const BUTTON_SIZE = "40px";

/** The legacy compact 2-by-3 navigation stays on the map when the information panel closes. */
export const ObliqueNavigation = ({
  nextInterface = false,
}: {
  nextInterface?: boolean;
}) => {
  const {
    isOn,
    isCatalogComplete,
    viewMode,
    selectedImageId,
    selectedSeriesId,
    series,
    navigationTargets,
    previewVisible,
    hoverAvailable,
    sendRequest,
    warmNavigation,
  } = useObliqueViewerActions();
  if (!isOn || viewMode === "objectCoverage") return null;
  const ready =
    selectedImageId !== null &&
    series.some((entry) => entry.enabled && entry.id === selectedSeriesId);
  // Availability is replaced only after the camera settles and its next
  // targets are ready. Keep the last settled states visible during transitions.
  const currentTargets = ready ? navigationTargets : null;
  const intentEvents = (key: ObliqueNavigationKey) => ({
    onPointerEnter: () => warmNavigation?.(key, true, OBLIQUE_NAVIGATION_INTENT.Pointer),
    onPointerLeave: () => warmNavigation?.(key, false, OBLIQUE_NAVIGATION_INTENT.Pointer),
    onFocus: () => warmNavigation?.(key, true, OBLIQUE_NAVIGATION_INTENT.Focus),
    onBlur: () => warmNavigation?.(key, false, OBLIQUE_NAVIGATION_INTENT.Focus),
  });
  const pan = (
    horizontal: number,
    vertical: number,
    label: string,
    arrow: string,
    position: string,
    key: ObliqueNavigationKey
  ) => (
    <Tooltip
      title={label}
      placement="top"
      overlayStyle={{ pointerEvents: "none" }}
    >
      <ControlButtonStyler
        type="button"
        aria-label={label}
        disabled={!currentTargets?.images[key]}
        {...intentEvents(key)}
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
      <Tooltip
        title={label}
        placement="top"
        overlayStyle={{ pointerEvents: "none" }}
      >
        <ControlButtonStyler
          type="button"
          aria-label={label}
          disabled={
            !isCatalogComplete || !currentTargets?.images[
              clockwise
                ? OBLIQUE_NAVIGATION_KEYS.RotateRight
                : OBLIQUE_NAVIGATION_KEYS.RotateLeft
            ]
          }
          {...intentEvents(clockwise ? OBLIQUE_NAVIGATION_KEYS.RotateRight : OBLIQUE_NAVIGATION_KEYS.RotateLeft)}
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
      {(!nextInterface || !hoverAvailable || previewVisible) && (
        <Tooltip
          title={
            previewVisible
              ? strings.closePreviewTooltip
              : strings.flyToImageTooltip
          }
          placement="top"
          overlayStyle={{ pointerEvents: "none" }}
        >
          <ControlButtonStyler
            type="button"
            disabled={!ready && !previewVisible}
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
      )}
      <div className="relative grid grid-cols-3 grid-rows-2 gap-1 p-0">
        {rotate(false, "col-start-1 row-start-1")}
        {pan(
          0,
          1,
          strings.siblingUp,
          "↑",
          "col-start-2 row-start-1",
          OBLIQUE_NAVIGATION_KEYS.Up
        )}
        {rotate(true, "col-start-3 row-start-1")}
        {pan(
          -1,
          0,
          strings.siblingLeft,
          "←",
          "col-start-1 row-start-2",
          OBLIQUE_NAVIGATION_KEYS.Left
        )}
        {pan(
          0,
          -1,
          strings.siblingDown,
          "↓",
          "col-start-2 row-start-2",
          OBLIQUE_NAVIGATION_KEYS.Down
        )}
        {pan(
          1,
          0,
          strings.siblingRight,
          "→",
          "col-start-3 row-start-2",
          OBLIQUE_NAVIGATION_KEYS.Right
        )}
      </div>
    </div>
  );
};
