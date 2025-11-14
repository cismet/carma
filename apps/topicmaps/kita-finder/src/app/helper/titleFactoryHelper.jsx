import { getAlterTextFromFilterState } from "./helper";
import { constants } from "./constants";

const getInclusionDescription = (filterState) => {
  const { normal, inklusion } = filterState;

  if (normal && !inklusion) return "Kitas ohne Schwerpunkt Inklusion";
  if (!normal && inklusion) return "Kitas mit Schwerpunkt Inklusion";
  return "alle Kitas"; // covers both (normal && inklusion) and (!normal && !inklusion)
};

const getUmfangDescription = (filterState) => {
  const { umfang_45, umfang_35 } = filterState;

  if (!umfang_45 && !umfang_35) return null;
  if (umfang_45 && umfang_35) return "35h oder 45h pro Woche";
  if (umfang_45) return "45h pro Woche";
  if (umfang_35) return "35h pro Woche";
  return null;
};

const getTrageTypeDescription = (filterState, traegertypMap) => {
  const positiv = [];
  const negativ = [];

  traegertypMap.forEach((traeger) => {
    const itemName = traeger.text.toLowerCase();
    Object.keys(filterState).forEach((key) => {
      if (key.toLowerCase() === itemName) {
        if (filterState[key]) {
          const description = constants.TRAEGERTEXT_FOR_DESCRIPTION[traeger.c];
          positiv.push(description);
        } else {
          const description = constants.TRAEGERTEXT_FOR_DESCRIPTION[traeger.c];
          negativ.push(description);
        }
      }
    });
  });

  const tragerLength = positiv.length + negativ.length;
  if (tragerLength === positiv.length) return null;

  if (negativ.length <= tragerLength / 2 - 1) {
    return "ohne " + negativ.join(" und ");
  } else {
    return "nur " + positiv.join(", ");
  }
};

export const buildThemenKitasDescription = (filterState, traegertypMap) => {
  if (!filterState) return [];

  const descriptions = [];

  // Add inclusion description
  descriptions.push(getInclusionDescription(filterState));

  const traegerDsc = getTrageTypeDescription(filterState, traegertypMap);

  if (traegerDsc) {
    descriptions.push(traegerDsc);
  }

  // Add age description
  const alterDesc = "Kinder " + getAlterTextFromFilterState(filterState.alter);
  descriptions.push(alterDesc);

  // Add hours description if applicable
  const umfangDesc = getUmfangDescription(filterState);
  if (umfangDesc) {
    descriptions.push(umfangDesc);
  }

  return descriptions;
};
