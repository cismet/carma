import React, { useRef } from "react";
import LandParcelKeyChooser from "../LandParcelKeyChooser";

const OLD_KEY_PROMPT =
  "Bitte wählen Sie das Flurstück aus, das umbenannt werden soll";
const NEW_KEY_PROMPT = "Bitte geben Sie den neuen Flurstücksschlüssel ein";
const HISTORIC_REJECTED = "Historisches Flurstück kann nicht umbenannt werden.";

const RenameStep = ({ value, onChange, onProblem }) => {
  const oldStatus = useRef({ valid: false, message: OLD_KEY_PROMPT });
  const newStatus = useRef({ valid: false, message: NEW_KEY_PROMPT });

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
          // every parcel is offered; a historic one is rejected on pick
          mode="all"
          prefillCurrent
          reject={(key) => (key.gueltigBis ? HISTORIC_REJECTED : null)}
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
