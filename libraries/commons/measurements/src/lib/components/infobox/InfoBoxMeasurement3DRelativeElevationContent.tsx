import type { ReactNode } from "react";

import { InputNumber } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { formatNumber } from "@carma-mapping/engines/cesium/measurements";

import type { RelativeElevationContentProps } from "./InfoBoxMeasurement3DPointDistance.types";

type InfoBoxMeasurement3DRelativeElevationContentProps =
  RelativeElevationContentProps & {
    interactive: boolean;
  };

export const InfoBoxMeasurement3DRelativeElevationContent = ({
  interactive,
  isRelativeElevationEditActive,
  relativeElevationValue,
  stopEventPropagation,
  elevationInputSharedProps,
  relativeElevationInputWidthPx,
  handleElevationInputChange,
  stopElevationEditMode,
  startRelativeElevationEditMode,
}: InfoBoxMeasurement3DRelativeElevationContentProps): ReactNode => {
  if (!interactive) {
    return (
      <span className="tabular-nums">
        {formatNumber(relativeElevationValue)} m relative Höhe über Bezugspunkt
      </span>
    );
  }

  if (isRelativeElevationEditActive) {
    return (
      <span
        className="inline-flex items-center gap-1"
        onClick={stopEventPropagation}
      >
        <InputNumber
          value={relativeElevationValue}
          onChange={handleElevationInputChange}
          {...elevationInputSharedProps}
          style={{
            width: relativeElevationInputWidthPx,
          }}
          data-test-id="relative-elevation-edit-input"
        />
        <button
          type="button"
          onClick={stopElevationEditMode}
          className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
          data-test-id="relative-elevation-edit-complete-btn"
          aria-label="Relative Höhenbearbeitung abschließen"
        >
          <FontAwesomeIcon icon={faCheck} />
        </button>
        <span>m relative Höhe über Bezugspunkt</span>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={startRelativeElevationEditMode}
        className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
        data-test-id="relative-elevation-display-btn"
      >
        {formatNumber(relativeElevationValue)} m
      </button>
      <span>relative Höhe über Bezugspunkt</span>
    </>
  );
};
