import { formatPrice } from "../tools/helper";
import { isBuchungAt } from "./usageHistory";
export function usageBlockExtractor(dataIn, moment) {
  if (dataIn === undefined) {
    return [];
  }
  return dataIn.nutzungArrayRelationShip.flatMap((nutzung) => {
    const buchungen = nutzung.nutzung_buchungArrayRelationShip;
    return buchungen.flatMap((u, idx) => {
      if (!isBuchungAt(u, moment)) {
        return [];
      }
      const anlageklasse = u.anlageklasse?.bezeichnung || "";
      const showPrice = anlageklasse !== "keine";
      const value = u.quadratmeterpreis * u.flaeche;
      const stille = calculateStilleReserve(buchungen, idx, value);
      return [
        {
          id: moment ? `${nutzung.id}-${idx + 1}` : nutzung.id,
          nutzung: nutzung.id,
          buchungs: idx + 1,
          anlageklasse,
          anlageklasseKey: u.anlageklasse?.schluessel || "",
          nutzungsart: u.nutzungsart?.schluessel || "",
          bezeichnung: u.nutzungsart?.bezeichnung || "",
          fläche: u.flaeche,
          preis: formatPrice(u.quadratmeterpreis, showPrice),
          gesamtpreis: formatPrice(value - stille, showPrice),
          stille: formatPrice(stille),
          buchwert: u.ist_buchwert,
          bemerkung: u.bemerkung ? u.bemerkung : "",
        },
      ];
    });
  });
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
          item.anlageklasse &&
          item.anlageklasse.bezeichnung !== "keine"
        ) {
          usageId = element.id;
          buchungArray = element.nutzung_buchungArrayRelationShip;
          buchungs = element.nutzung_buchungArrayRelationShip.length;
          currentIdxInBuchungArray = idx;
          element.nutzung_buchungArrayRelationShip.forEach((u) => {
            data.id = usageId;
            data.anlageklasse = u.anlageklasse?.schluessel || "";
            data.anlageklasseName = u.anlageklasse?.bezeichnung || "";
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
      anlageklasse: u.anlageklasseName,
      anlageklasseKey: u.anlageklasse,
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
