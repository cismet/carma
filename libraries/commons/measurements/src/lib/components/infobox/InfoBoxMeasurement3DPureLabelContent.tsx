import type { MouseEvent as ReactMouseEvent } from "react";

import { Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";

import type { PureLabelColorStyleId } from "./InfoBoxMeasurement3D.config";

type PureLabelAppearance = {
  fontSizePx: number;
  backgroundColor: string;
  textColor: string;
};

type InfoBoxMeasurement3DPureLabelContentProps = {
  isLivePreview: boolean;
  stopEventPropagation: (event: ReactMouseEvent<HTMLElement>) => void;
  pureLabelAppearance: PureLabelAppearance | null;
  selectedPureLabelColorStyleId: PureLabelColorStyleId | undefined;
  pureLabelDefaultFontSizePx: number;
  pureLabelMinFontSizePx: number;
  pureLabelMaxFontSizePx: number;
  pureLabelFontSizeStepPx: number;
  pureLabelColorStyleOptions: Array<{
    value: PureLabelColorStyleId;
    label: string;
  }>;
  adjustCurrentPureLabelFontSize: (deltaPx: number) => void;
  handlePureLabelColorStyleChange: (styleId: PureLabelColorStyleId) => void;
};

export const InfoBoxMeasurement3DPureLabelContent = ({
  isLivePreview,
  stopEventPropagation,
  pureLabelAppearance,
  selectedPureLabelColorStyleId,
  pureLabelDefaultFontSizePx,
  pureLabelMinFontSizePx,
  pureLabelMaxFontSizePx,
  pureLabelFontSizeStepPx,
  pureLabelColorStyleOptions,
  adjustCurrentPureLabelFontSize,
  handlePureLabelColorStyleChange,
}: InfoBoxMeasurement3DPureLabelContentProps) => {
  if (isLivePreview) {
    return (
      <div className="text-[12px] mb-0">
        <div className="mt-1 text-sm pl-2 pr-1 text-gray-500">
          Klick auf das Modell, um eine Beschriftung zu platzieren.
        </div>
      </div>
    );
  }

  return (
    <div className="text-[12px] mb-0">
      <div className="mt-1 text-sm pl-2 pr-1">
        <div
          className="mb-2 flex items-center gap-2"
          onClick={stopEventPropagation}
          onMouseDown={stopEventPropagation}
        >
          <span className="text-gray-500">Schriftgröße:</span>
          <button
            type="button"
            onClick={() =>
              adjustCurrentPureLabelFontSize(-pureLabelFontSizeStepPx)
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              !pureLabelAppearance ||
              pureLabelAppearance.fontSizePx <= pureLabelMinFontSizePx
            }
            aria-label="Schriftgröße verkleinern"
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <span className="tabular-nums min-w-[48px] text-center">
            {pureLabelAppearance?.fontSizePx ?? pureLabelDefaultFontSizePx}
            px
          </span>
          <button
            type="button"
            onClick={() =>
              adjustCurrentPureLabelFontSize(pureLabelFontSizeStepPx)
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              !pureLabelAppearance ||
              pureLabelAppearance.fontSizePx >= pureLabelMaxFontSizePx
            }
            aria-label="Schriftgröße vergrößern"
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
        <div
          className="mb-1 flex items-center gap-2"
          onClick={stopEventPropagation}
          onMouseDown={stopEventPropagation}
        >
          <span className="text-gray-500">Farbstil:</span>
          <Select
            size="small"
            value={selectedPureLabelColorStyleId}
            options={pureLabelColorStyleOptions}
            onChange={(value: PureLabelColorStyleId | undefined) => {
              if (!value) return;
              handlePureLabelColorStyleChange(value);
            }}
            style={{ minWidth: 140 }}
          />
        </div>
      </div>
    </div>
  );
};
