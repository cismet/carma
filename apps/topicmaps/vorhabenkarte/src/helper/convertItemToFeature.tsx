import { addSVGToProps, DEFAULT_SVG } from "react-cismap/tools/svgHelper";
import { assetsBaseUrl } from "../constants/constants";

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
  const baseSignature =
    properties.thema.signatur === "Icon_Verkehr.svg"
      ? "Icon_Mobilitaet.svg"
      : properties.thema.signatur;

  if (properties.buga) {
    return baseSignature.replace(/^Icon_/, "Icon_BuGa_");
  }
  if (properties.stadtweit) {
    properties.thema.signatur = `Stadtweit_${baseSignature}`;
    return properties.thema.signatur;
  }

  return baseSignature;
};

const adjustFeatureColors = (color) => {
  if (color === "#de0000") {
    return "#CF4647";
  }

  return color;
};

const convertItemToFeature = async (itemIn, poiColors) => {
  let clonedItem = JSON.parse(JSON.stringify(itemIn));

  const signatureBaseUrl =
    import.meta.env.VITE_WUPP_ASSET_BASEURL + "/poi-signaturen/vorhaben/";

  let item = await addSVGToProps(
    clonedItem,
    (i) => getSignature(i),
    signatureBaseUrl
  );

  if (clonedItem.buga && item.svgBadge === DEFAULT_SVG.code) {
    // BuGa icon not available: fall back to the regular theme icon
    item = await addSVGToProps(
      clonedItem,
      (i) => getSignature({ ...i, buga: false }),
      signatureBaseUrl
    );
  }

  const id = item.id;
  const type = "Feature";
  const selected = false;
  let geometry = item.geojson;
  const text = item.titel;

  const headerColor = adjustFeatureColors(item.thema.farbe);
  if (item.fotos && item.fotos.length > 0) {
    item.fotos.sort((a, b) => a.url.localeCompare(b.url));
  }

  if (item.fotos && item.fotos.length > 0 && item.fotos[0].url.includes(".")) {
    item.foto = assetsBaseUrl + "fotos/" + item.fotos[0].url;
    item.originalPhotos = item.fotos;
  }

  if (item.fotos && item.fotos.length > 0) {
    item.fotos = item.fotos.map(
      (photo) => assetsBaseUrl + "fotos/" + photo.url
    );
  }

  item.color = headerColor;

  const subtitleText = item.buergerbeteiligung
    ? shortenText(item.beschreibung) +
      "\n\n" +
      "Das Vorhaben wird mit Bürgerbeteiligung umgesetzt."
    : shortenText(item.beschreibung);

  const urlPrefix = window.location.origin + window.location.pathname;

  const subtitle = item.buga ? (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img
        src="https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/vorhaben/BUGA31_Logo.svg"
        alt="BUGA31 Wuppertal"
        style={{ width: 48, flexShrink: 0 }}
      />
      <span>{subtitleText}</span>
    </span>
  ) : (
    subtitleText
  );

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
        title: item.abgeschlossen ? text + " (abgeschlossen)" : text,
        subtitle,
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
