import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import {
  fetchFlurstueckBySchluesselId,
  hasSuccessors,
} from "../../../core/wizard/api";

/**
 * Port of ActivateActionPanel. Only historic parcels can be activated, and only
 * when they have no successor — the same check the panel ran before enabling
 * the finish button.
 */
const ActivateStep = ({ value, onChange, onProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const [checking, setChecking] = useState(false);

  // report on mount too, not only when the chooser changes
  useEffect(() => {
    if (!value.activateKey && !checking) {
      onProblem(
        "Bitte wählen Sie das Flurstück aus, das aktiviert werden soll"
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.activateKey]);

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
      onProblem(e.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div className="mb-1 font-medium">Flurstück, das aktiviert wird</div>
      <LandParcelKeyChooser
        mode="historic"
        value={value.activateKey}
        disabled={checking}
        onChange={handleChange}
        onValidity={(status) => {
          if (!status.valid) {
            onProblem(
              status.message ??
                "Bitte wählen Sie das Flurstück aus, das aktiviert werden soll"
            );
          }
        }}
      />
    </div>
  );
};

export default ActivateStep;
