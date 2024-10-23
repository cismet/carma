import { addSVGToProps, DEFAULT_SVG } from "react-cismap/tools/svgHelper";
const convertBPKlimaItemsToFeature = async (itemIn) => {
  let item = await addSVGToProps(itemIn, (i) => i.thema.icon);
  const text = item?.standort?.name || "Kein Standort";
  const type = "Feature";
  const selected = false;
  const geometry = item?.standort?.geojson;
  const color = item?.thema?.farbe;
  // item.svg=DEFAULT_SVG.code;
  item.color = item?.thema.farbe;
  const info = {
    header: item.thema.name,
    title: text,
    additionalInfo: item?.beschreibung,
    subtitle: (
      <span>
        {item?.standort?.strasse} {item?.standort?.hausnummer}
        <br />
        {item?.standort?.plz} {item?.standort?.stadt}
      </span>
    ),
  };
  item.info = info;
  item.url = item?.website;
  if (item.bild) {
    item.foto = "https://www.wuppertal.de/geoportal/standort_klima/fotos/" + item.bild;
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

export default convertBPKlimaItemsToFeature;
