import React, { useEffect, useState } from "react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import LandParcelKeyChooser from "../LandParcelKeyChooser";

/**
 * Port of HistoricActionPanel: the parcel plus the date it becomes historic.
 * Rights and leases are dealt with on finish, in HistoricRebeMipaDialog.
 */
const HistoricStep = ({ value, onChange, onProblem }) => {
  const [status, setStatus] = useState({ valid: false });
  const date = value.historicDate ?? new Date();

  // report on mount too, not only when the chooser changes
  useEffect(() => {
    if (!value.historicKey) {
      onProblem(
        "Bitte wählen Sie das Flurstück aus, das historisch gesetzt werden soll"
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.historicKey]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 font-medium">
          Flurstück, das historisch gesetzt wird
        </div>
        <LandParcelKeyChooser
          // HistoricActionPanel builds a plain FlurstueckChooser, so its filter
          // starts on "alle Flurstücke": an already historic parcel can be
          // picked, and the action then only writes its Rechte/Mieten.
          mode="all"
          value={value.historicKey}
          onChange={(next) => onChange({ historicKey: next })}
          onValidity={(next) => {
            setStatus(next);
            onProblem(
              next.valid
                ? null
                : next.message ??
                    "Bitte wählen Sie das Flurstück aus, das historisch gesetzt werden soll"
            );
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
