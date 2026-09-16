import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input, Select, Tag } from "antd";
import { BankOutlined, BlockOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { getLandparcelInternaDataStructure } from "../../store/slices/lagis";
import { removeLeadingZeros } from "../../core/tools/helper";
import { fetchSchluesselById, findSchluesselByKey } from "../../core/wizard/api";
import { landparcelLabel } from "../../core/wizard/areaCheck";
import { FLURSTUECK_ART } from "../../core/wizard/constants";
import useStammdaten from "../../core/wizard/useStammdaten";

/**
 * Port of de.cismet.lagis.gui.panels.FlurstueckChooser.
 *
 * Modes mirror FlurstueckChooser.Mode:
 *   "current"    — CONTINUATION, only active parcels
 *   "historic"   — CONTINUATION_HISTORIC, only historic ones
 *   "all"        — SEARCH, no filter
 *   "creation"   — CREATION, Gemarkung and Flur from the lists, the Flurstück
 *                  typed by hand and checked against the database
 *
 * The Gemarkung/Flur/Flurstück lists come out of the lookup the app already
 * keeps in redux, so picking a parcel costs no request. Only resolving the
 * chosen key to its full row (Art, gueltig_bis, war_staedtisch) hits the server.
 */

const pad = (value, length) => String(value ?? "").padStart(length, "0");

const parseFlurstueckInput = (text) => {
  if (!text) {
    return { error: "Bitte geben Sie ein Flurstück ein." };
  }
  const tokens = text.split("/");
  if (tokens.length > 2) {
    return { error: "Es ist nur ein Teiler / erlaubt." };
  }
  const numbers = tokens.map((token) => Number(token.trim()));
  if (numbers.some((value) => !Number.isInteger(value) || value < 0)) {
    return {
      error:
        "Kein gültiger Flurstücksname. Gültige Namen sind z.B. 3, 3/0 , 3/15",
    };
  }
  // a bare Zähler means Nenner 0, as in the Swing DocumentListener
  return { zaehler: numbers[0], nenner: tokens.length === 2 ? numbers[1] : 0 };
};

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

  const [gemarkungKey, setGemarkungKey] = useState();
  const [flurKey, setFlurKey] = useState();
  const [flurstueckLabel, setFlurstueckLabel] = useState();
  const [creationText, setCreationText] = useState("");
  const [status, setStatus] = useState({
    valid: false,
    message: "Bitte vervollständigen Sie alle Flurstücke",
  });
  const checkRef = useRef(0);

  // COPY_CONTENT_MODE of AutomaticFlurstueckRetriever: preselect Gemarkung and
  // Flur of another parcel and leave the Flurstück to the user.
  useEffect(() => {
    if (!preset) {
      return;
    }
    setGemarkungKey(preset.gemarkung?.schluessel);
    setFlurKey(pad(preset.flur, 3));
    if (mode !== "creation" && preset.zaehler !== undefined) {
      setFlurstueckLabel(landparcelLabel(preset.zaehler, preset.nenner));
    }
  }, [preset, mode]);

  const gemarkungOptions = useMemo(
    () =>
      Object.keys(structure ?? {}).map((key) => ({
        label: structure[key].gemarkung,
        value: key,
      })),
    [structure]
  );

  const selectedGemarkung = structure?.[gemarkungKey];
  const selectedFlur = selectedGemarkung?.flure?.[flurKey];

  const flurOptions = useMemo(
    () =>
      Object.keys(selectedGemarkung?.flure ?? {}).map((key) => ({
        label: removeLeadingZeros(selectedGemarkung.flure[key].flur, true),
        value: key,
      })),
    [selectedGemarkung]
  );

  const flurstueckOptions = useMemo(() => {
    const parcels = selectedFlur?.flurstuecke ?? {};
    return Object.keys(parcels)
      .filter((key) => {
        if (mode === "current") {
          return parcels[key].hist === false;
        }
        if (mode === "historic") {
          return parcels[key].hist !== false;
        }
        return true;
      })
      .map((key) => {
        const parcel = parcels[key];
        const staedtisch = parcel.art === FLURSTUECK_ART.STAEDTISCH;
        let color = "lightgrey";
        if (parcel.hist === false) {
          color = staedtisch ? "black" : "purple";
        }
        return {
          value: key,
          label: (
            <span style={{ color }}>
              <span className="mr-1 text-sm">
                {staedtisch ? <BankOutlined /> : <BlockOutlined />}
              </span>
              {removeLeadingZeros(parcel.label)}
            </span>
          ),
        };
      });
  }, [selectedFlur, mode]);

  const publish = (key, nextStatus) => {
    setStatus(nextStatus);
    onValidity(nextStatus);
    onChange(nextStatus.valid ? key : undefined);
  };

  /** Selection modes: resolve the picked parcel to its full Schlüssel row. */
  const handleFlurstueckSelected = async (label) => {
    setFlurstueckLabel(label);
    const parcel = selectedFlur?.flurstuecke?.[label];
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

  /**
   * The redux lookup is keyed by the Gemarkung id parsed out of the ALKIS id,
   * which is always a string, while `schluessel` arrives from GraphQL as a
   * number. Match on the Bezeichnung — both sides read it from the same table —
   * and fall back to comparing the Schlüssel numerically.
   */
  const resolveGemarkung = (key) => {
    if (!gemarkungen || key === undefined) {
      return undefined;
    }
    const bezeichnung = structure?.[key]?.gemarkung;
    return (
      gemarkungen.find((entry) => entry.bezeichnung === bezeichnung) ??
      gemarkungen.find((entry) => Number(entry.schluessel) === Number(key))
    );
  };

  /** Creation mode: the typed key must parse and must not exist yet. */
  useEffect(() => {
    if (mode !== "creation") {
      return undefined;
    }
    if (stammdatenError) {
      publish(undefined, {
        valid: false,
        message: `Gemarkungen konnten nicht geladen werden: ${stammdatenError}`,
      });
      return undefined;
    }
    const gemarkung = resolveGemarkung(gemarkungKey);
    if (!gemarkung || !selectedFlur) {
      publish(undefined, {
        valid: false,
        message: "Bitte wählen Sie Gemarkung und Flur aus.",
      });
      return undefined;
    }
    const parsed = parseFlurstueckInput(creationText.trim());
    if (parsed.error) {
      publish(undefined, { valid: false, message: parsed.error });
      return undefined;
    }

    const candidate = {
      // structureKey lets alkisIdForKey find the parcel again without
      // re-deriving it from the Schlüssel
      gemarkung: { ...gemarkung, structureKey: gemarkungKey },
      flur: Number(selectedFlur.flur),
      zaehler: parsed.zaehler,
      nenner: parsed.nenner,
    };

    const token = ++checkRef.current;
    const timer = setTimeout(async () => {
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
        } else {
          publish(candidate, {
            valid: true,
            message: "Flurstück ist noch nicht vorhanden und kann angelegt werden",
          });
        }
      } catch (e) {
        if (token === checkRef.current) {
          publish(undefined, {
            valid: false,
            message: "Fehler beim Prüfen des Flurstücks",
          });
        }
      }
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    gemarkungKey,
    flurKey,
    creationText,
    gemarkungen,
    stammdatenError,
    selectedFlur,
  ]);

  if (!structure) {
    return <div className="text-gray-500">Flurstücke werden geladen...</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select
          value={gemarkungKey}
          placeholder="Gemarkung"
          showSearch
          disabled={disabled}
          style={{ width: 180 }}
          options={gemarkungOptions}
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().startsWith(input.toLowerCase())
          }
          filterSort={(a, b) => (a?.label ?? "").localeCompare(b?.label ?? "")}
          onChange={(next) => {
            setGemarkungKey(next);
            setFlurKey(undefined);
            setFlurstueckLabel(undefined);
            publish(undefined, {
              valid: false,
              message: "Bitte wählen Sie einen Flur aus.",
            });
          }}
        />
        <Select
          value={flurKey}
          placeholder="Flur"
          showSearch
          disabled={disabled || !selectedGemarkung}
          style={{ width: 100 }}
          options={flurOptions}
          filterOption={(input, option) =>
            (option?.label ?? "").toLowerCase().startsWith(input.toLowerCase())
          }
          filterSort={(a, b) => parseInt(a.label, 10) - parseInt(b.label, 10)}
          onChange={(next) => {
            setFlurKey(next);
            setFlurstueckLabel(undefined);
            publish(undefined, {
              valid: false,
              message: "Bitte wählen Sie ein Flurstück aus.",
            });
          }}
        />
        {mode === "creation" ? (
          <Input
            value={creationText}
            placeholder="z.B. 3 oder 3/15"
            disabled={disabled || !selectedFlur}
            style={{ width: 150 }}
            status={status.valid ? "" : creationText ? "error" : ""}
            onChange={(event) => setCreationText(event.target.value)}
          />
        ) : (
          <Select
            value={flurstueckLabel}
            placeholder="Flurstück"
            showSearch
            disabled={disabled || !selectedFlur}
            style={{ width: 170 }}
            options={flurstueckOptions}
            filterOption={(input, option) =>
              (removeLeadingZeros(option.value) ?? "")
                .toLowerCase()
                .startsWith(input.toLowerCase())
            }
            filterSort={(a, b) => parseFloat(a.value) - parseFloat(b.value)}
            onChange={handleFlurstueckSelected}
          />
        )}
        {value?.art?.bezeichnung && (
          <Tag color={value.art.bezeichnung === FLURSTUECK_ART.STAEDTISCH ? "blue" : "purple"}>
            {value.art.bezeichnung}
          </Tag>
        )}
        {value?.gueltigBis && <Tag color="default">historisch</Tag>}
      </div>
      <div className={`text-xs ${status.valid ? "text-gray-500" : "text-red-600"}`}>
        {status.message}
      </div>
    </div>
  );
};

export default LandParcelKeyChooser;
