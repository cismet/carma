import React from "react";
import { PlusOutlined } from "@ant-design/icons";
import { parseLandParcelInput } from "@carma-mapping/fuzzy-search";
import { landparcelLabel } from "./keys";

/**
 * What the wizard adds on top of LandParcelSearch, which stays unaware of it.
 *
 * Modes, as in the Swing FlurstueckChooser:
 *   "current"  — active parcels only
 *   "historic" — historic parcels only
 *   "all"      — no filter
 *   "creation" — a key that does not exist yet
 */

export const CREATE_STAGE = "new";

/** Valid Flurstück inputs, as in the Swing panel: "3", "3/0", "3/15". */
export const parseFlurstueckInput = (text) => {
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
  // a bare Zähler means Nenner 0
  return { zaehler: numbers[0], nenner: tokens.length === 2 ? numbers[1] : 0 };
};

const clean = (zaehler, nenner) => `${Number(zaehler)}/${Number(nenner ?? 0)}`;

/** The text LandParcelSearch shows for a key: "Barmen-1-271/0". */
export const keyToSearchText = (key) =>
  key
    ? `${key.gemarkung?.bezeichnung ?? ""}-${key.flur}-${clean(
        key.zaehler,
        key.nenner
      )}`
    : "";

export const presetToSearchText = (preset) => {
  if (
    preset?.gemarkung?.bezeichnung === undefined ||
    preset?.flur === undefined
  ) {
    return "";
  }
  return preset.zaehler !== undefined && preset.zaehler !== null
    ? keyToSearchText(preset)
    : `${preset.gemarkung.bezeichnung}-${preset.flur}-`;
};

const isHistoric = (parcel) => parcel?.hist !== false;

const keepParcel = (mode, parcel) => {
  if (mode === "current") {
    return !isHistoric(parcel);
  }
  if (mode === "historic") {
    return isHistoric(parcel);
  }
  return true;
};

const HIDDEN_PARCEL_MESSAGES = {
  current: "Das Flurstück ist historisch und kann nicht ausgewählt werden.",
  historic:
    "Das Flurstück ist nicht historisch und kann nicht ausgewählt werden.",
  creation: "Flurstück ist bereits vorhanden",
};

/**
 * Message for a typed key that exists but is filtered out by the mode, or
 * that exists at all when a new one is wanted.
 */
export const hiddenParcelMessage = (text, mode, structure) => {
  if (!HIDDEN_PARCEL_MESSAGES[mode] || !structure) {
    return undefined;
  }
  const segments = (text ?? "").split("-");
  if (segments.length !== 3) {
    return undefined;
  }
  const [gemarkungText, flurText, flurstueckText] = segments.map((segment) =>
    segment.trim()
  );
  const gemarkung = Object.values(structure).find(
    (entry) => entry.gemarkung?.toLowerCase() === gemarkungText.toLowerCase()
  );
  const flur = Object.values(gemarkung?.flure ?? {}).find(
    (entry) => Number(entry.flur) === Number(flurText)
  );
  const parsed = parseFlurstueckInput(flurstueckText);
  if (!flur || parsed.error) {
    return undefined;
  }
  const parcel =
    flur.flurstuecke?.[landparcelLabel(parsed.zaehler, parsed.nenner)];
  return parcel && (mode === "creation" || !keepParcel(mode, parcel))
    ? HIDDEN_PARCEL_MESSAGES[mode]
    : undefined;
};

export const typedKeyProblem = (text, structure) => {
  const segments = (text ?? "").split("-");
  const gemarkungText = segments[0].trim();
  if (!structure || segments.length < 2 || !gemarkungText) {
    return undefined;
  }
  const state = parseLandParcelInput(text, structure);
  if (state.stage === "none") {
    return `Gemarkung "${gemarkungText}" ist nicht bekannt.`;
  }
  const flurText = segments[1].trim();
  if (segments.length >= 3 && state.stage !== "flur_matched" && flurText) {
    return `Flur ${flurText} gibt es in der Gemarkung ${state.gemarkungName} nicht.`;
  }
  if (state.stage === "flur_matched" && state.fstckFilter) {
    return parseFlurstueckInput(state.fstckFilter).error;
  }
  return undefined;
};

export const resolveTypedKey = (text, structure) => {
  if (!structure || (text ?? "").split("-").length !== 3) {
    return undefined;
  }
  const state = parseLandParcelInput(text, structure);
  if (state.stage !== "flur_matched" || !state.fstckFilter) {
    return undefined;
  }
  const parsed = parseFlurstueckInput(state.fstckFilter);
  if (parsed.error) {
    return undefined;
  }
  const parcel =
    structure[state.gemarkungKey]?.flure?.[state.flurKey]?.flurstuecke?.[
      landparcelLabel(parsed.zaehler, parsed.nenner)
    ];
  if (parcel) {
    return { parcel };
  }
  return {
    newKey: {
      gemarkungKey: state.gemarkungKey,
      gemarkungName: state.gemarkungName,
      flur: Number(state.flurName),
      zaehler: parsed.zaehler,
      nenner: parsed.nenner,
    },
  };
};

const filterGroups = (groups, mode) =>
  groups
    .map((group) => ({
      ...group,
      options: (group.options ?? []).filter(
        (option) =>
          option.parcelStage !== "flurstueck" ||
          keepParcel(mode, option.parcelData)
      ),
    }))
    .filter((group) => group.options.length > 0);

const createGroup = (option) => [
  {
    label: <span data-title="category-title">Neues Flurstück</span>,
    titleText: "Neues Flurstück",
    options: [option],
  },
];

/**
 * Only the Flurstück entries are touched; the Gemarkung and Flur lists stay as
 * the search built them, so typing forward works the same everywhere.
 */
export const makeTransformOptions = ({ mode, structure }) => {
  return (groups, { parseState }) => {
    // creation keeps every parcel visible: an existing one answers the question
    const filtered = filterGroups(groups, mode === "creation" ? "all" : mode);
    if (mode !== "creation" || parseState.stage !== "flur_matched") {
      return filtered;
    }

    const parsed = parseFlurstueckInput(parseState.fstckFilter.trim());
    if (parsed.error) {
      return filtered;
    }

    // only offered while the key looks free here; the server decides on pick
    const label = landparcelLabel(parsed.zaehler, parsed.nenner);
    const known =
      structure?.[parseState.gemarkungKey]?.flure?.[parseState.flurKey]
        ?.flurstuecke?.[label];
    if (known) {
      return filtered;
    }

    const text = clean(parsed.zaehler, parsed.nenner);
    return [
      ...filtered,
      ...createGroup({
        key: "create",
        value: `${parseState.gemarkungDisplay}-${parseState.flurName}-${text}`,
        label: (
          <div style={{ paddingLeft: "0.3rem" }}>
            <span style={{ marginRight: "0.4rem" }}>
              <PlusOutlined />
            </span>
            <span>{`${parseState.gemarkungName}-${parseState.flurName}-${text} anlegen`}</span>
          </div>
        ),
        sData: null,
        isLandParcel: true,
        parcelStage: CREATE_STAGE,
        parcelData: {
          gemarkungKey: parseState.gemarkungKey,
          gemarkungName: parseState.gemarkungName,
          flur: Number(parseState.flurName),
          zaehler: parsed.zaehler,
          nenner: parsed.nenner,
        },
      }),
    ];
  };
};

/**
 * The redux lookup is keyed by the id parsed out of the ALKIS id, which is not
 * the database id, so the Bezeichnung is matched first and the Schlüssel last.
 */
export const resolveGemarkung = (gemarkungen, { key, name }) => {
  if (!gemarkungen) {
    return undefined;
  }
  return (
    gemarkungen.find((entry) => entry.bezeichnung === name) ??
    gemarkungen.find((entry) => Number(entry.schluessel) === Number(key))
  );
};
