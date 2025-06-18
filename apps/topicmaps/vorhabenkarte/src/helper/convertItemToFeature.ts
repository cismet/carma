import { addSVGToProps } from "react-cismap/tools/svgHelper";
import Color from "color";
import { getColorForProperties } from "./styler";

const getSignature = (properties) => {
  if (properties.thema.signatur === "Icon_Verkehr.svg") {
    return "Icon_Mobilitaet.svg";
  }

  return properties.thema.signatur;
};

const convertItemToFeature = async (itemIn, poiColors) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  let item = await addSVGToProps(
    clonedItem,
    (i) => getSignature(i),
    import.meta.env.VITE_WUPP_ASSET_BASEURL + "/poi-signaturen/vorhaben/"
  );

  const id = item.id;
  const type = "Feature";
  const selected = false;
  const geometry = item.geojson;
  const text = item.titel;

  // const headerColor = item.thema.farbe + item.thema.fuellung;
  const headerColor = item.thema.farbe;
  if (item.fotos && item.fotos.length > 0 && item.fotos[0].url.includes(".")) {
    item.foto =
      "https://www.wuppertal.de/geoportal/vorhabenkarte/fotos/" +
      item.fotos[0].url;
  }

  // item.color = headerColor + item.thema.fuellung;
  item.color = headerColor;

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
    properties: {
      ...item,
      info: {
        title: text,
        // subtitle: item.beschreibung,
        subtitle: "auf 100 Zeichen gekürzt",
        header: item.thema.name,
      },
      tel: item.kontakt.telefon,
      email: item.kontakt.mail,
      genericLinks: [],
    },
  };
};

export default convertItemToFeature;

export const getConvertItemToFeatureWithPOIColors = (poiColors) => {
  return async (itemIn) => {
    return await convertItemToFeature(itemIn, poiColors);
  };
};
