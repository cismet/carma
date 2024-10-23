import Color from "color";
import React, { useContext } from "react";
import { addSVGToProps } from "react-cismap/tools/svgHelper";

import { getColorForProperties } from "./styler";
import { constants } from "./constants";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faUser } from "@fortawesome/free-solid-svg-icons";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import Icon from "react-cismap/commons/Icon";

const getSignature = (properties) => {
  if (properties.signatur) {
    return properties.signatur;
  } else if (properties.mainlocationtype.signatur) {
    return properties.mainlocationtype.signatur;
  }
  return "Platz.svg"; //TODO sinnvoller default
};

const getAgeString = (properties) => {
  switch (constants.ALTER[properties.alter]) {
    case constants.ALTER_UNTER2:
      return "unter 2 Jahre";
    case constants.ALTER_AB2:
      return "ab 2 Jahre";
    case constants.ALTER_AB3:
      return "ab 3 Jahre";
    default:
      return "keine Angabe";
  }
};

const getHoursString = (properties) => {
  switch (constants.STUNDEN[properties.stunden]) {
    case constants.STUNDEN_NUR_35:
      return "nur 35h pro Woche";
    case constants.STUNDEN_NUR_35_u_45:
      return "35h oder 45h pro Woche";
    case constants.STUNDEN_NUR_45:
      return "nur 45h pro Woche";
    default:
      return "keine Angabe";
  }
};

const convertItemToFeature = async (itemIn) => {
  let clonedItem = JSON.parse(
    JSON.stringify({
      ...itemIn,
      mainlocationtype: {
        id: -99,
        name: "Kita",
        signatur: "child.svg",
        lebenslagen: ["Kinderbetreuung"],
      },
      info: `Kindertageseinrichtung mit ${itemIn.plaetze} Plätzen in ${
        constants.TRAEGERTEXT[itemIn.traegertyp]
      }`,
    }),
  );

  let item = await addSVGToProps(clonedItem, (i) => getSignature(i));
  const headerColor = Color(getColorForProperties(item));
  const alter = getAgeString(item);
  const stunden = getHoursString(item);
  const info = {
    title: item.name,
    additionalInfo: item.info,
    subtitle: () => (
      <>
        <p>{item?.adresse}</p>
        <p>
          <Icon
            style={{
              color: "grey",
              width: "30px",
              textAlign: "center",
            }}
            size="2x"
            name={"user"}
          />
          {alter}
          <Icon
            style={{
              color: "grey",
              width: "40px",
              textAlign: "center",
            }}
            size="2x"
            name={"calendar"}
          />
          {stunden}
        </p>
      </>
    ),
  };
  item.info = info;
  item.color = headerColor;
  const id = item.id;
  const type = "Feature";
  const selected = false;
  const geometry = item.geojson;
  const text = item.name;

  return {
    id,
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
