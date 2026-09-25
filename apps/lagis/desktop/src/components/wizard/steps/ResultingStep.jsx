import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { hasDuplicateKeys } from "../../../core/wizard/keys";
import { WIZARD_ACTIONS } from "../../../core/wizard/constants";
import { areaCheckKeys, checkAreas } from "../../../core/wizard/areaCheck";

const INCOMPLETE = "Bitte vervollständigen Sie alle Flurstücke";

/**
 * Port of ResultingPanel: one creation chooser per resulting parcel. The first
 * copies the source parcel, each later one the key above it once it unlocks.
 * The choosers are filled in order; each key must have an ALKIS geometry
 * before the next one unlocks.
 */
const ResultingStep = ({ value, onChange, onProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const isJoin = value.action === WIZARD_ACTIONS.JOIN;
  const count = isJoin ? 1 : value.splitCount ?? 2;

  // ResultingPanel took the split candidate, or the last join member when
  // there was none.
  const preset = useMemo(() => {
    if (value.splitKey) {
      return value.splitKey;
    }
    const joinKeys = value.joinKeys ?? [];
    return joinKeys[joinKeys.length - 1];
  }, [value.splitKey, value.joinKeys]);

  // memoised: a fresh [] on every render would re-run the effect below
  const resultKeys = useMemo(() => value.resultKeys ?? [], [value.resultKeys]);

  // Going back and changing the split count leaves stale entries behind;
  // ResultingPanel.refresh() dropped them the same way.
  useEffect(() => {
    if (resultKeys.length !== count) {
      const trimmed = resultKeys.slice(0, count);
      trimmed.length = count;
      onChange({ resultKeys: trimmed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, resultKeys.length]);

  // leading slots whose key and geometry are confirmed; later ones stay locked
  const [confirmed, setConfirmed] = useState(0);
  // a key the chooser rejected, e.g. one that already exists
  const [chooserProblem, setChooserProblem] = useState();

  const handleValidity = (index, status) => {
    if (!status.valid && status.message !== INCOMPLETE) {
      setChooserProblem({ index, message: status.message });
    } else {
      setChooserProblem((previous) =>
        previous?.index === index ? undefined : previous
      );
    }
  };

  useEffect(() => {
    onChange({ areaCheck: undefined });
    const firstEmpty = resultKeys.findIndex((key) => !key);
    const filled = resultKeys.slice(
      0,
      firstEmpty === -1 ? resultKeys.length : firstEmpty
    );
    setConfirmed(Math.max(0, filled.length - 1));

    if (chooserProblem) {
      setConfirmed(Math.min(chooserProblem.index, filled.length));
      onProblem(chooserProblem.message);
      return;
    }
    if (hasDuplicateKeys(filled)) {
      onProblem("Es darf kein Flurstück doppelt ausgewählt werden.");
      return;
    }

    let cancelled = false;
    onProblem("Prüfe Flurstücke...");
    checkAreas(areaCheckKeys({ ...value, resultKeys: filled }), jwt)
      .then((areaCheck) => {
        if (cancelled) {
          return;
        }
        if (areaCheck.problem) {
          onProblem(areaCheck.problem);
          return;
        }
        setConfirmed(filled.length);
        if (filled.length < count) {
          onProblem(INCOMPLETE);
          return;
        }
        onChange({ areaCheck });
        onProblem(null);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("Geometrien konnten nicht geprüft werden", e);
          onProblem("Fehler beim Prüfen der Geometrien");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKeys, count, chooserProblem]);

  // A locked slot stays empty; once it unlocks it copies the key above it.
  // Kept per slot, so changing an earlier key does not reset a later one.
  const slotPresets = useRef({});
  const presetAt = (index) => {
    if (index === 0) {
      return preset;
    }
    if (!(index in slotPresets.current)) {
      if (!resultKeys[index] && index > confirmed) {
        return undefined;
      }
      slotPresets.current[index] = resultKeys[index - 1] ?? preset;
    }
    return slotPresets.current[index];
  };

  const setKeyAt = (index, key) => {
    const next = [...resultKeys];
    next.length = count;
    next[index] = key;
    onChange({ resultKeys: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="font-medium">
        {isJoin ? "Flurstück anlegen" : "Flurstücke anlegen"}
      </div>
      {Array.from({ length: count }).map((_, index) => (
        <LandParcelKeyChooser
          // the slots are positional, there is no id to key them by
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          mode="creation"
          value={resultKeys[index]}
          preset={presetAt(index)}
          disabled={index > confirmed}
          onChange={(next) => setKeyAt(index, next)}
          onValidity={(status) => handleValidity(index, status)}
        />
      ))}
    </div>
  );
};

export default ResultingStep;
