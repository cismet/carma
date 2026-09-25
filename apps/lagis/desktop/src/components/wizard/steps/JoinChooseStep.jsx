import React, { useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import LandParcelKeyChooser from "../LandParcelKeyChooser";
import { formatKey, hasDuplicateKeys } from "../../../core/wizard/keys";
import { fetchGeometries, geometryForKey } from "../../../core/wizard/geometry";

const INCOMPLETE = "Bitte vervollständigen Sie alle Flurstücke";

const JoinChooseStep = ({ value, onChange, onProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
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

  // a parcel the chooser rejected, e.g. a historic one
  const [chooserProblem, setChooserProblem] = useState();

  const handleValidity = (slotId, status) => {
    if (!status.valid && status.message !== INCOMPLETE) {
      setChooserProblem({ slotId, message: status.message });
    } else {
      setChooserProblem((previous) =>
        previous?.slotId === slotId ? undefined : previous
      );
    }
  };

  // true once every picked parcel is known to have an ALKIS geometry
  const [geometryOk, setGeometryOk] = useState(false);

  useEffect(() => {
    setGeometryOk(false);
    if (
      chooserProblem &&
      slots.some((slot) => slot.id === chooserProblem.slotId)
    ) {
      onProblem(chooserProblem.message);
      return;
    }
    if (keys.length !== slots.length) {
      onProblem(INCOMPLETE);
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

    let cancelled = false;
    onProblem("Prüfe Flurstücke...");
    fetchGeometries(keys, jwt)
      .then((geometries) => {
        if (cancelled) {
          return;
        }
        const missing = keys.find((key) => !geometryForKey(key, geometries));
        if (missing) {
          onProblem(
            `Konnte keine Geometrie zu Flurstück ${formatKey(missing)} finden.`
          );
          return;
        }
        setGeometryOk(true);
        onProblem(
          keys.length < 2
            ? "Es müssen mindestens zwei Flurstücke ausgewählt werden"
            : null
        );
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
  }, [slots, chooserProblem]);

  return (
    <div className="flex flex-col gap-3">
      <div className="font-medium">Flurstücke, die zusammengelegt werden</div>
      {slots.map((slot, index) => (
        <div key={slot.id} className="flex items-start gap-2">
          <LandParcelKeyChooser
            mode="current"
            prefillCurrent={slot.id === 1}
            value={slot.key}
            preset={slot.preset}
            onChange={(next) =>
              setSlots(
                slots.map((entry) =>
                  entry.id === slot.id ? { ...entry, key: next } : entry
                )
              )
            }
            onValidity={(status) => handleValidity(slot.id, status)}
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
              disabled={!geometryOk}
              onClick={() =>
                setSlots([
                  ...slots,
                  {
                    id: Math.max(...slots.map((e) => e.id)) + 1,
                    key: undefined,
                    preset: slot.key,
                  },
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
