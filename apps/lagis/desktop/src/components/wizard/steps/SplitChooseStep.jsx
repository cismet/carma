import React, { useEffect } from "react";
import { InputNumber } from "antd";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import {
  MAX_SPLIT_COUNT,
  MIN_SPLIT_COUNT,
  WIZARD_ACTIONS,
} from "../../../core/wizard/constants";

const CHOOSE_PROMPT =
  "Bitte wählen Sie das Flurstück aus, das geteilt werden soll";

/**
 * Port of SplitActionChoosePanel.
 *
 * For "teilen" the user picks the parcel and how many parts it becomes. In
 * "zusammenlegen/teilen" the source is the merged parcel from the previous
 * step, so only the count is asked for — the Swing panel removed the chooser
 * from the layout in that mode.
 */
const SplitChooseStep = ({ value, onChange, onProblem }) => {
  const joinMode = value.action === WIZARD_ACTIONS.SPLIT_JOIN;
  const count = value.splitCount ?? MIN_SPLIT_COUNT;
  const key = value.splitKey;

  useEffect(() => {
    if (!joinMode && !key) {
      onProblem(CHOOSE_PROMPT);
      return;
    }
    if (!Number.isInteger(count) || count < MIN_SPLIT_COUNT) {
      onProblem("Es müssen mindestens zwei neue Flurstücke entstehen");
      return;
    }
    onProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinMode, key, count]);

  return (
    <div className="flex flex-col gap-4">
      {!joinMode && (
        <div>
          <div className="mb-1 font-medium">Flurstück, das geteilt wird</div>
          <LandParcelKeyChooser
            mode="current"
            incompleteMessage={CHOOSE_PROMPT}
            value={key}
            onChange={(next) => onChange({ splitKey: next })}
            onValidity={(status) => {
              if (!status.valid) {
                onProblem(status.message);
              }
            }}
          />
        </div>
      )}
      <div>
        <div className="mb-1 font-medium">Anzahl der neuen Flurstücke</div>
        <InputNumber
          min={MIN_SPLIT_COUNT}
          max={MAX_SPLIT_COUNT}
          value={count}
          onChange={(next) => onChange({ splitCount: next ?? MIN_SPLIT_COUNT })}
        />
      </div>
    </div>
  );
};

export default SplitChooseStep;
