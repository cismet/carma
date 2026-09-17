import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tag } from "antd";
import { useSelector } from "react-redux";
import { LandParcelSearch } from "@carma-mapping/fuzzy-search";
import { getLandparcelInternaDataStructure } from "../../store/slices/lagis";
import {
  fetchSchluesselById,
  findSchluesselByKey,
} from "../../core/wizard/api";
import {
  CREATE_STAGE,
  keyToSearchText,
  makeTransformOptions,
  presetToSearchText,
  resolveGemarkung,
} from "../../core/wizard/parcelSearchAdapter";
import { FLURSTUECK_ART } from "../../core/wizard/constants";
import useStammdaten from "../../core/wizard/useStammdaten";

/**
 * The Flurstück picker of the wizard. The input is the LandParcelSearch of the
 * header, so a parcel is found the same way everywhere; what stays here is the
 * wizard's part: which parcels a step may pick, whether a typed key is still
 * free, and the full Schlüssel behind a choice. Modes: see parcelSearchAdapter.
 */

const INCOMPLETE = "Bitte vervollständigen Sie alle Flurstücke";

const LandParcelKeyChooser = ({
  mode = "current",
  value,
  onChange,
  onValidity = () => {},
  preset,
  disabled = false,
}) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const structure = useSelector(getLandparcelInternaDataStructure);
  const { gemarkungen, error: stammdatenError } = useStammdaten();

  const [text, setText] = useState(
    () => keyToSearchText(value) || presetToSearchText(preset)
  );
  // going back to a step must not look unfinished, and must not ask again
  const [status, setStatus] = useState(() =>
    value
      ? {
          valid: true,
          message:
            mode === "creation"
              ? "Flurstück ist noch nicht vorhanden und kann angelegt werden"
              : "Aktuell ausgewähltes Flurstück vollständig.",
        }
      : { valid: false, message: INCOMPLETE }
  );
  // the last picked option, to tell a selection apart from typing
  const pickedRef = useRef(text);
  const checkRef = useRef(0);

  useEffect(() => {
    if (value) {
      onValidity(status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const presetText = presetToSearchText(preset);
  const presetRef = useRef(presetText);

  const publish = (key, nextStatus) => {
    setStatus(nextStatus);
    onValidity(nextStatus);
    onChange(nextStatus.valid ? key : undefined);
  };

  // the parcel this one is derived from changed, so the choice here is void
  useEffect(() => {
    if (!presetText || presetText === presetRef.current) {
      return;
    }
    presetRef.current = presetText;
    pickedRef.current = presetText;
    setText(presetText);
    publish(undefined, { valid: false, message: INCOMPLETE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetText]);

  const transformOptions = useMemo(
    () => makeTransformOptions({ mode, structure }),
    [mode, structure]
  );

  const takeExisting = async (parcel) => {
    if (!parcel?.lfk) {
      publish(undefined, {
        valid: false,
        message: "Es wurde kein Flurstück ausgewählt",
      });
      return;
    }
    const token = ++checkRef.current;
    publish(undefined, { valid: false, message: "Flurstück wird geladen..." });
    try {
      const resolved = await fetchSchluesselById(parcel.lfk, jwt);
      if (token !== checkRef.current) {
        return;
      }
      if (!resolved) {
        publish(undefined, {
          valid: false,
          message: "Flurstück konnte nicht geladen werden.",
        });
        return;
      }
      publish(resolved, {
        valid: true,
        message: "Aktuell ausgewähltes Flurstück vollständig.",
      });
    } catch (e) {
      if (token === checkRef.current) {
        publish(undefined, { valid: false, message: e.message });
      }
    }
  };

  /** The key must still be free at the moment it is picked. */
  const takeNew = async (data) => {
    if (stammdatenError) {
      publish(undefined, {
        valid: false,
        message: `Gemarkungen konnten nicht geladen werden: ${stammdatenError}`,
      });
      return;
    }
    const gemarkung = resolveGemarkung(gemarkungen, {
      key: data.gemarkungKey,
      name: data.gemarkungName,
    });
    if (!gemarkung) {
      publish(undefined, {
        valid: false,
        message: "Gemarkung konnte nicht zugeordnet werden.",
      });
      return;
    }

    const candidate = {
      gemarkung,
      flur: data.flur,
      zaehler: data.zaehler,
      nenner: data.nenner,
    };

    const token = ++checkRef.current;
    publish(undefined, { valid: false, message: "Flurstück wird geprüft..." });
    try {
      const existing = await findSchluesselByKey(candidate, jwt);
      if (token !== checkRef.current) {
        return;
      }
      if (existing) {
        publish(undefined, {
          valid: false,
          message: "Flurstück ist bereits vorhanden",
        });
        return;
      }
      publish(candidate, {
        valid: true,
        message: "Flurstück ist noch nicht vorhanden und kann angelegt werden",
      });
    } catch (e) {
      if (token === checkRef.current) {
        publish(undefined, {
          valid: false,
          message: "Fehler beim Prüfen des Flurstücks",
        });
      }
    }
  };

  const handleOptionSelect = (option) => {
    if (option.parcelStage === CREATE_STAGE) {
      pickedRef.current = option.value;
      setText(option.value);
      takeNew(option.parcelData);
      return;
    }
    if (option.parcelStage === "flurstueck") {
      pickedRef.current = option.value;
      if (mode === "creation") {
        publish(undefined, {
          valid: false,
          message: "Flurstück ist bereits vorhanden",
        });
        return;
      }
      takeExisting(option.parcelData);
    }
  };

  // typing on drops the choice, so no step keeps a key the input no longer shows
  const handleValueChange = (next) => {
    setText(next);
    if (next === pickedRef.current) {
      return;
    }
    checkRef.current += 1;
    if (status.valid || value) {
      publish(undefined, { valid: false, message: INCOMPLETE });
    }
  };

  const handleNotFound = (input) => {
    if (mode === "creation") {
      // the "anlegen" entry is the answer here, not an error
      return;
    }
    publish(undefined, {
      valid: false,
      message: `Kein Flurstück gefunden: ${input}`,
    });
  };

  if (!structure) {
    return <div className="text-gray-500">Flurstücke werden geladen...</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div
          style={{
            pointerEvents: disabled ? "none" : undefined,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <LandParcelSearch
            pixelwidth={320}
            landParcelData={structure}
            value={text}
            onValueChange={handleValueChange}
            transformOptions={transformOptions}
            onOptionSelect={handleOptionSelect}
            onNotFound={handleNotFound}
            showDropdownBelow={true}
            showButton={false}
          />
        </div>
        {value?.art?.bezeichnung && (
          <Tag
            color={
              value.art.bezeichnung === FLURSTUECK_ART.STAEDTISCH
                ? "blue"
                : "purple"
            }
          >
            {value.art.bezeichnung}
          </Tag>
        )}
        {value?.gueltigBis && <Tag color="default">historisch</Tag>}
      </div>
      <div
        className={`text-xs ${status.valid ? "text-gray-500" : "text-red-600"}`}
      >
        {status.message}
      </div>
    </div>
  );
};

export default LandParcelKeyChooser;
