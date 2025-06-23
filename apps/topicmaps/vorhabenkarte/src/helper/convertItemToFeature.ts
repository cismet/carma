import { addSVGToProps } from "react-cismap/tools/svgHelper";
import * as turf from "@turf/turf";

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
  const text = item.titel;

  // Handle colors
  const headerColor = adjustFeatureColors(item.thema.farbe);
  item.color = headerColor;

  // Handle photos
  if (item.fotos && item.fotos.length > 0) {
    item.fotos = item.fotos.map(
      (photo) =>
        "https://wunda-geoportal-docs.cismet.de/vorhabenkarte/fotos/" +
        photo.url
    );
  }

  // Create base properties
  const baseProperties = {
    ...item,
    info: {
      title: text,
      subtitle: item.buergerbeteiligung
        ? "Das Vorhaben wird mit Bürgerbeteiligung umgesetzt"
        : shortenText(item.beschreibung),
      header: item.thema.name,
    },
    tel: item.kontakt.telefon,
    email: item.kontakt.mail,
    genericLinks: [],
  };

  // If it's a polygon, create two features
  if (item.geojson?.type === "Polygon" || item.geojson?.type === "MultiPolygon") {
    const centroid = turf.centroid(item.geojson);
    
    // Return array of features - polygon and point
    return [
      {
        id: id + "_polygon",
        type,
        selected,
        geometry: item.geojson,
        properties: {
          ...baseProperties,
          isPolygon: true
        },
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
      },
      {
        id: id + "_point",
        type,
        selected,
        geometry: centroid.geometry,
        properties: {
          ...baseProperties,
          isPoint: true
        },
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
      }
    ];
  }

  // For non-polygon features, return single feature
  return {
    id,
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
