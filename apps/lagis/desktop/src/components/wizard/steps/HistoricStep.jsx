import React, { useState } from "react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import LandParcelKeyChooser from "../LandParcelKeyChooser";

const CHOOSE_PROMPT =
  "Bitte wählen Sie das Flurstück aus, das historisch gesetzt werden soll";

const HistoricStep = ({ value, onChange, onProblem }) => {
  const [status, setStatus] = useState({ valid: false });
  const date = value.historicDate ?? new Date();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 font-medium">
          Flurstück, das historisch gesetzt wird
        </div>
        <LandParcelKeyChooser
          // as in Swing, so an already historic parcel can be picked
          mode="all"
          prefillCurrent
          incompleteMessage={CHOOSE_PROMPT}
          value={value.historicKey}
          onChange={(next) => onChange({ historicKey: next })}
          onValidity={(next) => {
            setStatus(next);
            onProblem(next.valid ? null : next.message ?? CHOOSE_PROMPT);
          }}
        />
      </div>
      <div>
        <div className="mb-1 font-medium">Historisch ab</div>
        <DatePicker
          value={dayjs(date)}
          format="DD.MM.YYYY"
          allowClear={false}
          disabled={!status.valid}
          onChange={(next) =>
            onChange({ historicDate: next ? next.toDate() : new Date() })
          }
        />
      </div>
    </div>
  );
};

export default HistoricStep;
