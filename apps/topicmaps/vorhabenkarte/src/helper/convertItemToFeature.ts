import { addSVGToProps } from "react-cismap/tools/svgHelper";
import Panel from "react-cismap/commons/Panel";

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

const MULTI_POLY_COORDS: GeoJSON.MultiPolygon = [
  [
    [
      [376149.8829, 5681869.9617],
      [376137.9509, 5681848.3526],
      [376097.1671, 5681858.0553],
      [376149.8829, 5681869.9617],
    ],
  ],
  [
    [
      [378149.8829, 5683869.9617],
      [378137.9509, 5683848.3526],
      [378097.1671, 5683858.0553],
      [378149.8829, 5683869.9617],
    ],
  ],
];

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
  let geometry = item.geojson;
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

  if (itemIn.id === 2) {
    console.log("xxx multi");
    geometry = {
      type: "MultiPolygon",
      crs: item.crs,
      coordinates: MULTI_POLY_COORDS,
    } as GeoJSON.MultiPolygon;
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
