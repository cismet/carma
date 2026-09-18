import React, { useRef } from "react";
import LandParcelKeyChooser from "../LandParcelKeyChooser";

const OLD_KEY_PROMPT =
  "Bitte wählen Sie das Flurstück aus, das umbenannt werden soll";
const NEW_KEY_PROMPT = "Bitte geben Sie den neuen Flurstücksschlüssel ein";

const RenameStep = ({ value, onChange, onProblem }) => {
  const oldStatus = useRef({ valid: false, message: OLD_KEY_PROMPT });
  const newStatus = useRef({ valid: false, message: NEW_KEY_PROMPT });

  // The old key is reported first, so the user is guided top to bottom.
  const report = () => {
    if (!oldStatus.current.valid) {
      onProblem(oldStatus.current.message || OLD_KEY_PROMPT);
    } else if (!newStatus.current.valid) {
      onProblem(newStatus.current.message || NEW_KEY_PROMPT);
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
            oldStatus.current = status;
            report();
          }}
        />
      </div>
      <div>
        <div className="mb-1 font-medium">Neuer Flurstücksschlüssel</div>
        <LandParcelKeyChooser
          mode="creation"
          incompleteMessage={NEW_KEY_PROMPT}
          disabled={!value.renameKey}
          value={value.createKey}
          preset={value.renameKey}
          onChange={(next) => onChange({ createKey: next })}
          onValidity={(status) => {
            newStatus.current = status;
            report();
          }}
        />
      </div>
    </div>
  );
};

export default RenameStep;
