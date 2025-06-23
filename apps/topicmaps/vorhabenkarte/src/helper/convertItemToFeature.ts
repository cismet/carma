import { addSVGToProps } from "react-cismap/tools/svgHelper";

export const shortenText = (
  text: string,
  showDots = true,
  maxChars = 100
): string => {
  if (typeof text !== "string") {
    text = String(text);
  }

  return text.length <= maxChars
    ? text
    : text.slice(0, maxChars) + (showDots ? "…" : "");
};

const getSignature = (properties) => {
  if (properties.thema.signatur === "Icon_Verkehr.svg") {
    return "Icon_Mobilitaet.svg";
  }

  return properties.thema.signatur;
};

const adjustFeatureColors = (color) => {
  if (color === "#de0000") {
    return "#CF4647";
  }

  return color;
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

  const headerColor = adjustFeatureColors(item.thema.farbe);
  if (item.fotos && item.fotos.length > 0 && item.fotos[0].url.includes(".")) {
    item.foto =
      // "https://www.wuppertal.de/geoportal/vorhabenkarte/fotos/" +
      "https://wunda-geoportal-docs.cismet.de/vorhabenkarte/fotos/" +
      item.fotos[0].url;
    item.originalPhotos = item.fotos;
  }

  if (item.fotos && item.fotos.length > 0) {
    item.fotos = item.fotos.map(
      (photo) =>
        "https://wunda-geoportal-docs.cismet.de/vorhabenkarte/fotos/" +
        photo.url
    );
  }

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
        subtitle: item.buergerbeteiligung
          ? "Das Vorhaben wird mit Bürgerbeteiligung umgesetzt"
          : shortenText(item.beschreibung),
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
