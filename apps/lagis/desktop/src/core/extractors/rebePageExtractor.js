import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { selectedFeatureFitBounds } from "../tools/helper";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const dateFormat = "DD.MM.YYYY";
export function rebePageExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  } else {
    const rebe = dataIn;
    if (rebe.length > 0) {
      const rebeGreenColors = ["#009c1a", "#22b600", "#26cc00", "#7be382"];
      const rebeOrangeColors = ["#f0750f", "#f48020", "#f09537", "#f0a150"];
      const data = rebe.map((r, idx) => {
        let formattedEintragung;
        if (r.datum_eintragung) {
          const dateEintragung = dayjs(r.datum_eintragung).toDate();
          formattedEintragung = dayjs(dateEintragung).format("DD.MM.YYYY");
        } else {
          formattedEintragung = null;
        }
        let formattedLoschung;
        if (r.datum_loeschung) {
          const dateLoschung = dayjs(r.datum_loeschung).toDate();
          formattedLoschung = dayjs(dateLoschung).format("DD.MM.YYYY");
        } else {
          formattedLoschung = null;
        }
        return {
          id: idx,
          recht: r.ist_recht,
          art: r.rebe_art?.bezeichnung || "",
          artrecht: r.beschreibung,
          nummer: r.nummer,
          eintragung: formattedEintragung,
          loschung: formattedLoschung,
          bemerkung: r.bemerkung ? r.bemerkung : "",
          extendedGeom: r.extended_geom,
          color: r.ist_recht
            ? rebeGreenColors[idx % rebeGreenColors.length]
            : rebeOrangeColors[idx % rebeOrangeColors.length],
        };
      });
      return data;
    }

    return [];
  }
}

export const mapRebeExtractor = ({
  landparcel,
  geometry,
  extraGeom,
  selectedTableRowId,
  inspectMode = true,
  ondblclick = (event, map, features) => {
    const selectedFeature = features.filter((f) => f.selectedTableGeom);
    selectedFeatureFitBounds(map, selectedFeature[0]);
  },
}) => {
  if (extraGeom && geometry) {
    const feature = {
      type: "Feature",
      featureType: "landparcel",
      id: "landparcel." + landparcel?.id || "noIdBCtmpGeom",
      geometry: geometry,
      featuretype: landparcel ? "lagis" : "private",
      crs: geometry?.crs,
      properties: {
        id: landparcel?.id,
      },
      tableId: selectedTableRowId,
      isCommonGeometry: true,
      selectedTableGeom: false,
      color: inspectMode ? "#eaddd7" : "#26ADE4",
    };

    const features = [feature];
    extraGeom.forEach((rent, idx) => {
      const { extendedGeom, id: tableId, color } = rent;
      const feature = {
        type: "Feature",
        featureType: "landparcel",
        id: "landparcel." + landparcel?.id || "noIdBCtmpGeom",
        geometry: {
          ...extendedGeom.geo_field,
        },
        featuretype: landparcel ? "lagis" : "private",
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
        properties: {
          id: landparcel?.id,
        },
        tableId,
        selectedTableGeom: selectedTableRowId === tableId,
        isCommonGeometry: false,
        color,
      };

      features.push(feature);
    });

    return {
      homeCenter: [51.272570027476256, 7.19963690266013],
      homeZoom: 16,
      featureCollection: features,
      styler: (feature) => {
        const style = {
          color: inspectMode ? "#6e6e6e" : "#005F6B",
          weight: feature.selectedTableGeom ? 3 : inspectMode ? 2 : 1,
          opacity: feature.selectedTableGeom ? 0.6 : inspectMode ? 0.6 : 0.3,
          fillColor: feature.selectedTableGeom
            ? feature.color
            : inspectMode
            ? "#ffff"
            : feature.color,
          fillOpacity: feature.selectedTableGeom ? 0.6 : inspectMode ? 0 : 0.6,
          className: "landparcel-" + feature.properties.id,
        };
        return style;
      },
      ondblclick,
    };
  } else {
    return {
      homeCenter: [51.272570027476256, 7.19963690266013],
      homeZoom: 13,
      featureCollection: [],
      ondblclick,
    };
  }
};
