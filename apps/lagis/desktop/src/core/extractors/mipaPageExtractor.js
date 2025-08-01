import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { selectedFeatureFitBounds } from "../tools/helper";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
export function mipaPageExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  } else {
    const mipa = dataIn;
    if (mipa.length > 0) {
      let formattedVertragsbeginn;
      let formattedVertragsende;
      const data = mipa.map((m, idx) => {
        if (m.vertragsbeginn) {
          const dateVertragsbeginn = dayjs(m.vertragsbeginn).toDate();
          formattedVertragsbeginn =
            dayjs(dateVertragsbeginn).format("DD.MM.YYYY");
        } else {
          formattedVertragsbeginn = null;
        }
        if (m.vertragsende) {
          const dateVertragsende = dayjs(m.vertragsende).toDate();
          formattedVertragsende = dayjs(dateVertragsende).format("DD.MM.YYYY");
        } else {
          formattedVertragsende = null;
        }
        return {
          id: idx,
          lage: m.lage,
          aktenzeichen: m.aktenzeichen,
          flaeche: m.flaeche,
          nutzung: m.mipa_nutzung.mipa_kategorie.bezeichnung,
          vertragsbegin: formattedVertragsbeginn,
          vertragsende: formattedVertragsende,
          merkmale: m.ar_mipa_merkmaleArray ? m.ar_mipa_merkmaleArray : [],
          querverweise: "",
          note: m.bemerkung ? m.bemerkung : "",
          extendedGeom: m.extended_geom,
        };
      });

      return data;
    }

    return [];
  }
}

export const mapMipaExtractor = ({
  landparcel,
  geometry,
  extraGeom,
  selectedTableRowId,
  inspectMode,
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
      color: "#F2E2C2",
    };

    const mipaColors = ["#AEFFFF", "#07FFFF", "#00B9B9"];

    const features = [feature];
    extraGeom.forEach((rent, idx) => {
      const { extendedGeom, id: tableId } = rent;
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
        color: mipaColors[idx % mipaColors.length],
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
          fillColor: feature.color,
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
