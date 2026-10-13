import type { ReactNode } from "react";

import { useVorhabenItems } from "../../data/vorhabenItems";

/**
 * "Meine Vorhaben: N von M Themen" for the MapTitleBox, or null while the
 * filter is at its default (all themes, no citizen participation switch).
 * Same text and conditions as the old titleFactory.
 */
export const useVorhabenTitle = (): ReactNode | null => {
  const {
    filterState,
    itemsDictionary: { topics },
  } = useVorhabenItems();

  const filtered =
    (topics.length > 0 && filterState.topics.length !== topics.length) ||
    filterState.citizen;
  if (!filtered) {
    return null;
  }

  let text = `${filterState.topics.length} von ${topics.length} Themen`;
  if (filterState.citizen) {
    text += " (nur Vorhaben mit Bürgerbeteiligung)";
  }

  return (
    <div>
      <b>Meine Vorhaben: </b> {text}
    </div>
  );
};
