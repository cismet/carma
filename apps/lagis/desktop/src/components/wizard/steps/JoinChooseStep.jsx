import React, { useEffect, useMemo } from "react";
import { Button } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { hasDuplicateKeys } from "../../../core/wizard/keys";

/**
 * Port of JoinActionChoosePanel: a growing list of parcels to merge. At least
 * two are required, none twice, and all of them must share the same
 * Flurstücksart — the merged parcel inherits it.
 */
const JoinChooseStep = ({ value, onChange, onProblem }) => {
  // memoised: a fresh default array on every render would re-run the effect
  const slots = useMemo(
    () => value.joinSlots ?? [{ id: 1, key: undefined }],
    [value.joinSlots]
  );

  const setSlots = (next) => {
    onChange({
      joinSlots: next,
      joinKeys: next.map((slot) => slot.key).filter(Boolean),
    });
  };

  const keys = slots.map((slot) => slot.key).filter(Boolean);

  useEffect(() => {
    if (keys.length !== slots.length) {
      onProblem("Bitte vervollständigen Sie alle Flurstücke");
      return;
    }
    if (keys.length < 2) {
      onProblem("Es müssen mindestens zwei Flurstücke ausgewählt werden");
      return;
    }
    if (hasDuplicateKeys(keys)) {
      onProblem("Es darf kein Flurstück doppelt ausgewählt werden.");
      return;
    }
    const firstArt = keys[0]?.art?.bezeichnung;
    if (keys.some((key) => key.art?.bezeichnung !== firstArt)) {
      onProblem("Alle Flurstücke müssen dieselbe Art haben.");
      return;
    }
    onProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  return (
    <div className="flex flex-col gap-3">
      <div className="font-medium">Flurstücke, die zusammengelegt werden</div>
      {slots.map((slot, index) => (
        <div key={slot.id} className="flex items-start gap-2">
          <LandParcelKeyChooser
            mode="current"
            value={slot.key}
            onChange={(next) =>
              setSlots(
                slots.map((entry) =>
                  entry.id === slot.id ? { ...entry, key: next } : entry
                )
              )
            }
          />
          <Button
            icon={<DeleteOutlined />}
            disabled={slots.length <= 1}
            onClick={() =>
              setSlots(slots.filter((entry) => entry.id !== slot.id))
            }
            title="Flurstück entfernen"
          />
          {index === slots.length - 1 && (
            <Button
              icon={<PlusOutlined />}
              onClick={() =>
                setSlots([
                  ...slots,
                  { id: Math.max(...slots.map((e) => e.id)) + 1, key: undefined },
                ])
              }
              title="Flurstück hinzufügen"
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default JoinChooseStep;
