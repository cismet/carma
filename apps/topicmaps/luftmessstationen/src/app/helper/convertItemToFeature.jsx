import { addSVGToProps } from "react-cismap/tools/svgHelper";

import {
  LOOKUP,
  MONTHS,
  getLastMeasurement,
} from "@carma-collab/wuppertal/luftmessstationen/helper";

import { getStatus } from "@carma-collab/wuppertal/luftmessstationen/helper";

const getSignature = (item) => {
  const status = getStatus(item);
  return LOOKUP[status].signature;
};

const getAdditionalInfo = (item) => {
  const allAvgYears = Object.keys(item?.mittelwerte);

  allAvgYears.sort();
  const last2Years = allAvgYears.slice(-2);

  const currentYear = new Date().getFullYear();
  const threshold = currentYear - 2;

  const avgYears = last2Years.filter((year) => parseInt(year) >= threshold);

  let ret = "";
  avgYears.sort(function (a, b) {
    return parseInt(b) - parseInt(a);
  });
  if (avgYears.length === 0) {
    ret =
      "Kein gewichteter Jahresmittelwert aus dem vergangenen Kalenderjahr vorhanden.";
  } else if (avgYears.length === 1) {
    ret = "Gewichteter Jahresmittelwert:";
  } else {
    ret = "Gewichtete Jahresmittelwerte:";
  }
  for (const year of avgYears) {
    ret = ret + "\n" + item?.mittelwerte[year] + " µg/m³ (" + year + ")";
  }

  return ret;
};

const getTitle = (item) => {
  const lm = getLastMeasurement(item);

  if (item?.bis) {
    const demontage = new Date(item?.bis);

    return `Diese Messstation ist seit ${
      MONTHS[demontage.getMonth()].name
    } ${demontage.getFullYear()} abmontiert.`;
  } else {
    if (lm) {
      if (lm.value !== -9999) {
        return (
          lm.value +
          " µg/m³ (" +
          MONTHS[lm.monthIndex].name +
          " " +
          lm.year +
          ")"
        );
      } else {
        return (
          "Für " +
          MONTHS[lm.monthIndex].name +
          " " +
          lm.year +
          " liefert diese Messstation keinen Messwert"
        );
      }
    } else {
      return "Diese Messstation ist abmontiert";
    }
  }
};

const convertItemToFeature = async (itemIn) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));
  let rawWerte = clonedItem.werte;
  let newWerte = {};
  for (const year of Object.keys(rawWerte)) {
    newWerte[year] = [];
    for (const monthIndex of Object.keys(rawWerte[year])) {
      newWerte[year][parseInt(monthIndex - 1)] = rawWerte[year][monthIndex];
    }
  }

  clonedItem.werte = newWerte;

  let item = await addSVGToProps(clonedItem, (i) => "luft/" + getSignature(i));
  item.status = getStatus(item);

  const text =
    item?.strasse +
    " " +
    (item?.hausnummer || "") +
    (item?.zusatzinfo !== undefined ? " (" + item?.zusatzinfo + ")" : "");

  const type = "Feature";
  const selected = false;
  const geometry = item?.geojson;
  item.color = LOOKUP[item.status].color;

  const info = {
    header: LOOKUP[item.status].header,
    title: getTitle(item),
    additionalInfo: getAdditionalInfo(item),
    subtitle: (
      <span>
        {item?.strasse} {item?.hausnummer}{" "}
        {item?.zusatzinfo && <span>({item?.zusatzinfo})</span>}
      </span>
    ),
  };
  item.info = info;
  if (item?.bild) {
    item.foto =
      "https://www.wuppertal.de/geoportal/luftmessstationen/fotos/" + item.bild;
  }

  return {
    text,
    type,
    selected,
    geometry,
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
      },
    },
    properties: item,
  };
};
export default convertItemToFeature;
