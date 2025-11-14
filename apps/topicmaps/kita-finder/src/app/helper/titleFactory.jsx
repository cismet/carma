import React from "react";
import { buildThemenKitasDescription } from "./titleFactoryHelper";
import { traegertypMap } from "../helper/filter";

const factory = ({ featureCollectionContext }) => {
  const { itemsDictionary, filteredItems, filterState, allFeatures } =
    featureCollectionContext;
  // old not working code
  // let themenstadtplanDesc = "alle Kitas | unter 2 + ab 2 Jahre | 35h pro Woche";
  // if (filterState) {
  //   if (
  //     filterState?.positiv?.length > 0 &&
  //     filterState?.positiv?.length < lebenslagen.length
  //   ) {
  //     if (filterState.positiv.length <= 4) {
  //       themenstadtplanDesc += filterState.positiv.join(", ");
  //     } else {
  //       themenstadtplanDesc += filterState.positiv.length + " Themen";
  //     }
  //     if (filterState?.negativ?.length > 0) {
  //       if (filterState.negativ.length <= 3) {
  //         themenstadtplanDesc += " ohne ";
  //         themenstadtplanDesc += filterState.negativ.join(", ");
  //       } else {
  //         themenstadtplanDesc +=
  //           " (" + filterState?.negativ?.length + " Themen ausgeschlossen)";
  //       }
  //     }
  //   }
  const themenKitasDesc = buildThemenKitasDescription(
    filterState,
    traegertypMap
  );
  if (!allFeatures || allFeatures.length === 0) {
    return null;
  }
  return (
    <div>
      <b>Mein Kita-Finder:</b> {themenKitasDesc.join(" | ")}
    </div>
  );
};

export default factory;
