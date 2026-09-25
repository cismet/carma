import React, { useState } from "react";
import { useSelector } from "react-redux";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { explain } from "../../../core/wizard/errors";
import {
  fetchFlurstueckBySchluesselId,
  hasSuccessors,
} from "../../../core/wizard/api";

const CHOOSE_PROMPT =
  "Bitte wählen Sie das Flurstück aus, das aktiviert werden soll";

const ActivateStep = ({ value, onChange, onProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const [checking, setChecking] = useState(false);

  const handleChange = async (key) => {
    onChange({ activateKey: undefined });
    if (!key) {
      return;
    }
    setChecking(true);
    onProblem("Flurstück wird geprüft...");
    try {
      const flurstueck = await fetchFlurstueckBySchluesselId(key.id, jwt);
      if (flurstueck && (await hasSuccessors(flurstueck.id, jwt))) {
        onProblem(
          "Ausgewähltes Flurstück hat Nachfolger und kann nicht aktiviert werden"
        );
        return;
      }
      onChange({ activateKey: key });
      onProblem(null);
    } catch (e) {
      onProblem(explain("Das Flurstück konnte nicht geprüft werden", e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div className="mb-1 font-medium">Flurstück, das aktiviert wird</div>
      <LandParcelKeyChooser
        mode="historic"
        prefillCurrent
        incompleteMessage={CHOOSE_PROMPT}
        value={value.activateKey}
        disabled={checking}
        onChange={handleChange}
        onValidity={(status) => {
          if (!status.valid) {
            onProblem(status.message ?? CHOOSE_PROMPT);
          }
        }}
      />
    </div>
  );
};

export default ActivateStep;
