import { nanoid } from "@reduxjs/toolkit";
import { formatPrice } from "../tools/helper";
export function usageBlockExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  } else {
    const landparcel = dataIn;
    const usage = landparcel.nutzungArrayRelationShip;
    const currentUsage = [];
    usage.forEach((element) => {
      element.nutzung_buchungArrayRelationShip.forEach((item, idx) => {
        let usageId;
        let buchungArray;
        let buchungs;
        let currentIdxInBuchungArray;
        let data = {};
        if (item.gueltig_bis === null) {
          usageId = element.id;
          buchungArray = element.nutzung_buchungArrayRelationShip;
          buchungs = element.nutzung_buchungArrayRelationShip.length;
          currentIdxInBuchungArray = idx;
          element.nutzung_buchungArrayRelationShip.forEach((u) => {
            data.id = usageId;
            data.nutzung = usageId;
            data.buchungs = buchungs;
            data.anlageklasse = u.anlageklasse?.bezeichnung || "";
            data.nutzungsart = u.nutzungsart?.bezeichnung || "";
            data.bezeichnung = u?.nutzungsart?.bezeichnung || "";
            data.fläche = u.flaeche;
            data.preis = formatPrice(
              u.quadratmeterpreis,
              data.anlageklasse === "keine" ? false : true
            );
            (data.gesamtpreis = formatPrice(
              u.quadratmeterpreis * u.flaeche -
                calculateStilleReserve(
                  buchungArray,
                  currentIdxInBuchungArray,
                  u.quadratmeterpreis * u.flaeche
                ),
              data.anlageklasse === "keine" ? false : true
            )),
              (data.stille = formatPrice(
                calculateStilleReserve(
                  buchungArray,
                  currentIdxInBuchungArray,
                  u.quadratmeterpreis * u.flaeche
                )
              ));
            data.buchwert = u.ist_buchwert;
            data.bemerkung = u.bemerkung ? u.bemerkung : "";
          });
          currentUsage.push(data);
        }
      });
    });
    return currentUsage;
  }
}

function calculateStilleReserve(buchungArray, positionInArray, gesamtpreis) {
  const copyArr = [...buchungArray].slice(0, positionInArray);
  let ifBuchwerFound = false;
  let lastIstBuchwer;
  for (let i = copyArr.length - 1; i >= 0; i--) {
    const item = copyArr[i];
    if (item.ist_buchwert && !ifBuchwerFound) {
      ifBuchwerFound = true;
      lastIstBuchwer = item;
    }
  }
  let res = 0;
  if (lastIstBuchwer?.quadratmeterpreis && lastIstBuchwer?.flaeche) {
    res =
      gesamtpreis - lastIstBuchwer.quadratmeterpreis * lastIstBuchwer.flaeche;
  } else {
    res = 0;
  }
  return res < 0 ? 0 : res;
}

export function NFKOverwieExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  } else {
    const landparcel = dataIn;
    const usage = landparcel.nutzungArrayRelationShip;
    const currentUsage = [];
    const allStille = usageBlockExtractor(dataIn);
    usage.forEach((element, usageIdx) => {
      element.nutzung_buchungArrayRelationShip.forEach((item, idx) => {
        let usageId;
        let buchungArray;
        let buchungs;
        let currentIdxInBuchungArray;
        let data = {};
        if (
          item.gueltig_bis === null &&
          item.anlageklasse.bezeichnung !== "keine"
        ) {
          usageId = element.id;
          buchungArray = element.nutzung_buchungArrayRelationShip;
          buchungs = element.nutzung_buchungArrayRelationShip.length;
          currentIdxInBuchungArray = idx;
          element.nutzung_buchungArrayRelationShip.forEach((u) => {
            data.id = usageId;
            data.anlageklasse = u.anlageklasse?.schluessel || "";
            (data.summe =
              u.quadratmeterpreis * u.flaeche -
              calculateStilleReserve(
                buchungArray,
                currentIdxInBuchungArray,
                u.quadratmeterpreis * u.flaeche
              )),
              (data.stille = calculateStilleReserve(
                buchungArray,
                currentIdxInBuchungArray,
                u.quadratmeterpreis * u.flaeche
              ));
          });
          ifAnlageklasseAdded(currentUsage, data);
        }
      });
    });
    let stille = 0;
    allStille.forEach((s) => {
      const clean = s.stille.replace(/€/g, "").replace(/ /g, "");
      const cleanComma = clean.replace(",", ".");
      stille += parseFloat(cleanComma.replace(/[^\d.]/g, ""));
    });
    const formattedCurrentUsage = currentUsage.map((u) => ({
      id: u.id,
      anlageklasse: u.anlageklasse,
      summe: formatPrice(u.summe),
      stille: formatPrice(stille),
    }));

    return formattedCurrentUsage;
  }
}

function ifAnlageklasseAdded(currentUsage, currentData) {
  const ifAnlageklasseAdded = currentUsage.find(
    (a) => a.anlageklasse === currentData.anlageklasse
  );
  if (ifAnlageklasseAdded === undefined) {
    return currentUsage.push(currentData);
  } else {
    ifAnlageklasseAdded.summe = ifAnlageklasseAdded.summe + currentData.summe;
  }
}
