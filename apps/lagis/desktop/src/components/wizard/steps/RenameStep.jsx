import React, { useState } from "react";
import LandParcelKeyChooser from "../LandParcelKeyChooser";

/**
 * Port of RenameActionPanel: the parcel to rename on top, the new key below.
 * The new key is preset with Gemarkung and Flur of the old one and inherits its
 * Flurstücksart when the action runs.
 */
const RenameStep = ({ value, onChange, onProblem }) => {
  const [oldStatus, setOldStatus] = useState({
    valid: false,
    message: "Bitte wählen Sie das Flurstück aus, das umbenannt werden soll",
  });
  const [newStatus, setNewStatus] = useState({ valid: false, message: "" });

  // The old key is reported first, so the user is guided top to bottom.
  const report = (oldOne, newOne) => {
    if (!oldOne.valid) {
      onProblem(oldOne.message);
    } else if (!newOne.valid) {
      onProblem(newOne.message);
    } else {
      onProblem(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 font-medium">Flurstück, das umbenannt wird</div>
        <LandParcelKeyChooser
          mode="current"
          value={value.renameKey}
          onChange={(next) => onChange({ renameKey: next })}
          onValidity={(status) => {
            setOldStatus(status);
            report(status, newStatus);
          }}
        />
      </div>
      <div>
        <div className="mb-1 font-medium">Neuer Flurstücksschlüssel</div>
        <LandParcelKeyChooser
          mode="creation"
          value={value.createKey}
          preset={value.renameKey}
          onChange={(next) => onChange({ createKey: next })}
          onValidity={(status) => {
            setNewStatus(status);
            report(oldStatus, status);
          }}
        />
      </div>
    </div>
  );
};

export default RenameStep;
