import React, { useEffect, useMemo } from "react";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { hasDuplicateKeys } from "../../../core/wizard/keys";
import { WIZARD_ACTIONS } from "../../../core/wizard/constants";

/**
 * Port of ResultingPanel: one creation chooser per parcel that will come out of
 * the action — as many as the split count, or exactly one when merging.
 * Gemarkung and Flur are preset from the parcel the action starts from, which
 * is what the panel's COPY_CONTENT_MODE did.
 */
const ResultingStep = ({ value, onChange, onProblem }) => {
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

  useEffect(() => {
    if (resultKeys.length !== count || resultKeys.some((key) => !key)) {
      onProblem("Bitte vervollständigen Sie alle Flurstücke");
      return;
    }
    if (hasDuplicateKeys(resultKeys)) {
      onProblem("Es darf kein Flurstück doppelt ausgewählt werden.");
      return;
    }
    onProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKeys, count]);

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
          preset={preset}
          onChange={(next) => setKeyAt(index, next)}
        />
      ))}
    </div>
  );
};

export default ResultingStep;
