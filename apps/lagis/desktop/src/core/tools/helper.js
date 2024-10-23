import { nanoid } from "@reduxjs/toolkit";
import { getArea25832 } from "./mappingTools";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const dateFormat = "DD.MM.YYYY";
export const getNonce = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const todayString = yyyy + mm + dd;
  const todayInt = parseInt(todayString);
  return todayInt + Math.random();
};

export const getColorFromCode = (code = 12004320) => {
  if (code) {
    let c = code;
    let r = (c & 0xff0000) >> 16;
    let g = (c & 0xff00) >> 8;
    let b = c & 0xff;
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "black";
};

export function addLeadingZeros(flur) {
  const correctFlur = "00" + flur;
  return correctFlur;
}

export function buildUrlParams(paramsUrl) {
  if (!paramsUrl?.gem) {
    return "";
  }
  const params = [];
  if (paramsUrl.gem) {
    params.push(`gem=${paramsUrl.gem}`);
  }
  if (paramsUrl.flur) {
    params.push(`&flur=${paramsUrl.flur}`);
  }
  if (paramsUrl.fstck) {
    params.push(`&fstck=${paramsUrl.fstck}`);
  }
  return params.join("");
}

export const compare = (a, b) => {
  if (a === undefined || a === null) {
    a = "";
  }
  if (b === undefined || a === null) {
    b = "";
  }

  return (
    isFinite(b) - isFinite(a) ||
    a - b ||
    (a?.length === b?.length && a.toString().localeCompare(b)) ||
    a?.length - b?.length
  );
};

export function formatPrice(number, show = true) {
  if (!number || number === 0) {
    return show ? "0,00 €" : "";
  }

  const formatter = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formattedNumber = formatter.format(number);

  return formattedNumber;
}

export const defaultLinksColor = "#E0E0E0";

export const removeLeadingZeros = (numberStr, flur = false) => {
  if (!numberStr) {
    return undefined;
  }
  const parts = numberStr.split("/");

  const trimmedParts = parts.map((part) => {
    let startIndex = 0;

    while (startIndex < part.length && part[startIndex] === "0") {
      startIndex++;
    }

    return part.substring(startIndex);
  });

  const flurResalt = trimmedParts.join("/");

  const result =
    trimmedParts.length > 1
      ? trimmedParts.join("/")
      : trimmedParts.join("") + "/0";

  return !flur ? result : flurResalt;
};

export function getOfficesWithColorAndSquare(
  officesArray,
  dataIn,
  ifHistory = false
) {
  const nameGeomColorData = [];
  const alkisArea = dataIn.alkisLandparcel?.area;

  let area;
  officesArray?.verwaltungsbereichArrayRelationShip.forEach((item) => {
    const color =
      item.verwaltende_dienststelle.farbeArrayRelationShip[0]?.rgb_farbwert ||
      "";
    if (
      officesArray.verwaltungsbereichArrayRelationShip.length === 1 &&
      !ifHistory
    ) {
      area = alkisArea;
    } else {
      if (item.flaeche !== null) {
        area = item.flaeche;
        area = item?.extended_geom?.area || item.flaeche;
      } else {
        area = item?.extended_geom?.area || 0;
      }
    }
    const title = `${item.verwaltende_dienststelle.ressort.abkuerzung}.${item.verwaltende_dienststelle.abkuerzung_abteilung}`;

    nameGeomColorData.push({
      id: nanoid(),
      title,
      size: Math.round(area),
      color: getColorFromCode(color),
      officeGeom: item.extended_geom,
    });
  });

  return nameGeomColorData;
}
export function geHistoricalArraytOfficesWithColorAndSquare(
  historicalArray,
  dataIn
) {
  const result = [];
  historicalArray.forEach((h) => {
    const res = getOfficesWithColorAndSquare(h, dataIn, true);
    const dateChangedDate = dayjs(h.geaendert_am).toDate();
    const formattedChangedDate = dayjs(dateChangedDate).format("DD.MM.YYYY");
    const changedByName = h.geaendert_von;
    const historyData = {
      id: nanoid(),
      editorName: changedByName,
      changedDate: formattedChangedDate,
      agencyData: res,
    };
    result.push(historyData);
  });
  return result;
}

export function getLandparcelStringFromAlkisLandparcel(landparcel) {
  const getCurrentLandparcelGemerkung =
    landparcel.flurstueck_schluessel.gemarkung.bezeichnung;
  const getCurrentLandparcelFlur = landparcel.flurstueck_schluessel.flur;
  const getCurrentLandparcelZaehler =
    landparcel.flurstueck_schluessel.flurstueck_zaehler;
  const getCurrentLandparcelZaehlerNenner =
    landparcel.flurstueck_schluessel.flurstueck_nenner;
  const currentLandparcel = `${getCurrentLandparcelGemerkung} ${getCurrentLandparcelFlur} ${getCurrentLandparcelZaehler}/${getCurrentLandparcelZaehlerNenner}`;
  return currentLandparcel;
}
export function replaceSlashWithDash(value) {
  return value ? value.replace("/", "-") : value;
}
export function getGemarkunFlurFstckFromAlkisId(alkisId) {
  //alkisId is always starting with 05 in germany
  //throw 05 away

  //check whether this is the case here and throw it away
  let alkisIdWithout05;
  if (alkisId.substring(0, 2) !== "05") {
    alkisIdWithout05 = alkisId.substring(2);
  } else {
    alkisIdWithout05 = alkisId;
  }

  const splitted = alkisIdWithout05.split("-");

  const gemId = splitted[0].substring(2);
  const flur = splitted[1];
  const fstck = splitted[2];

  return { gemId, flur, fstck };
}
