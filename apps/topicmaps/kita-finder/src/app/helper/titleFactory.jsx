import React from "react";
import { getAlterTextFromFilterState } from "./helper";
const factory = ({ featureCollectionContext }) => {
  const { itemsDictionary, filteredItems, filterState } =
    featureCollectionContext;
  const lebenslagen = itemsDictionary?.lebenslagen || [];

  let themenstadtplanDesc = "alle Kitas | unter 2 + ab 2 Jahre | 35h pro Woche";
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

  const themenKitasDesc = [];
  if (filterState) {
    let schwerDesc = "alle Kitas";
    let alterDesc = "Kinder";
    if (filterState.normal && !filterState.inklusion) {
      schwerDesc = "Kitas ohne Schwerpunkt Inklusion";
    }
    if (!filterState.normal && filterState.inklusion) {
      schwerDesc = "Kitas mit Schwerpunkt Inklusion";
    }

    if (filterState.normal && filterState.inklusion) {
      schwerDesc = "alle Kitas";
    }

    themenKitasDesc.push(schwerDesc);
    alterDesc += " " + getAlterTextFromFilterState(filterState.alter);
    themenKitasDesc.push(alterDesc);

    if (filterState.umfang_45 || filterState.umfang_35) {
      if (filterState.umfang_45 && filterState.umfang_35) {
        themenKitasDesc.push("35h oder 45h pro Woche");
      } else if (filterState.umfang_45 && !filterState.umfang_35) {
        themenKitasDesc.push("45h pro Woche");
      } else if (!filterState.umfang_45 && filterState.umfang_35) {
        themenKitasDesc.push("35h pro Woche");
      }
    }
  }

  return (
    <div>
      <b>Mein Kita-Finder:</b> {themenKitasDesc.join(" | ")}
    </div>
  );
};
// };

export default factory;
