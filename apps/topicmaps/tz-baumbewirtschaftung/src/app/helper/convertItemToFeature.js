import { addSVGToProps } from "react-cismap/tools/svgHelper";
import Color from "color";
import { getColorForProperties } from "./styler";

const getSignature = (properties) => {
  if (properties.signatur) {
    return properties.signatur;
  } else {
    return "Icon_Freibad_farbig.svg";
  }
};

const convertItemToFeature = async (itemIn, poiColors) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));


  let item = clonedItem; // = await addSVGToProps(clonedItem, (i) => getSignature(i));
  const headerColor = Color(getColorForProperties(item));

  const info = {
    header: `Baumbewirtschaftung`,
    title: item.baumart_botanisch + " (" + item.standort_nr + "." + item.zusatz + "." + item.lfd_nr_str + ")",
    additionalInfo: " (*" + item.pflanzjahr + " / " + item.standalter_jahr + ")" + "\n\n" + item.hoehe_m + "m / " + item.stammumfang_cm + "cm / ",
    subtitle: item.ortlicher_bezug,
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
        name: "urn:ogc:def:crs:EPSG::3857",
      },
    },
    properties: item,
  };
};

export default convertItemToFeature;

export const getConvertItemToFeatureWithPOIColors = (poiColors) => {
  return async (itemIn) => {
    return await convertItemToFeature(itemIn, poiColors);
  };
};
