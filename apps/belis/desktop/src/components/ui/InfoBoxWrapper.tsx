import { useSelector } from "react-redux";
import {
  getFeatureCollection,
  getSelectedFeature,
} from "../../store/slices/featureCollection";
import { InfoBox } from "@carma-appframeworks/portals";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import { getVCard } from "@carma-appframeworks/belis";
import { MEASUREMENT_FEATUREKIND } from "../../store/slices/measurements";

// Build an InfoBox vcard for a measurement feature locally — keeps the
// generic getVCard in @carma-appframeworks/belis Fachobjekt-only. Returns
// the same { infobox: { header, title, subtitle, more } } shape getVCard
// exposes, so the renderer below can stay branch-free.
const buildMeasurementVCard = (feature: any) => {
  const geomType = feature?.geometry?.type;
  const id = feature?.id != null ? String(feature.id) : "?";
  const shortId = id.startsWith("measurement.") ? id.slice(12, 20) : id;
  let title = "Messung";
  let subtitle = "";
  if (geomType === "Point") {
    title = "Punkt";
    const coords = feature.geometry?.coordinates;
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      subtitle = `${coords[0].toFixed(2)} / ${coords[1].toFixed(2)}`;
    }
  } else if (geomType === "LineString" || geomType === "MultiLineString") {
    title = "Linie";
    const label = feature.properties?.title;
    if (typeof label === "string") subtitle = label;
  } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
    title = "Fläche";
    const label = feature.properties?.title;
    if (typeof label === "string") subtitle = label;
  }
  return {
    infobox: {
      header: "Messung",
      title: `${title} ${shortId}`,
      subtitle,
      more: undefined,
    },
  };
};

const InfoBoxWrapper = ({ mapWidth }) => {
  const featureCollection = useSelector(getFeatureCollection);
  const selectedFeature = useSelector(getSelectedFeature);
  const config = {
    city: "gesamtem Bereich verfügbar",
    header: "Information zum Objekt",
    navigator: {
      noun: {
        singular: "Objekt",
        plural: "Objekte",
      },
    },
    noCurrentFeatureTitle: "Keine Objekte gefunden",
    noCurrentFeatureContent: "",
    displaySecondaryInfoAction: false,
  };

  const headerColor = "#dddddd";

  let vcard;

  let header = <span>Feature title</span>;
  let title = "feature title";
  let subtitle = "feature subtitle";
  let additionalInfo = "";

  if (selectedFeature !== undefined && selectedFeature !== null) {
    vcard =
      selectedFeature.featurekind === MEASUREMENT_FEATUREKIND
        ? buildMeasurementVCard(selectedFeature)
        : getVCard(selectedFeature);
    header = <span>{vcard?.infobox?.header || config.header}</span>;
    title = vcard?.infobox?.title;
    subtitle = vcard?.infobox?.subtitle;
    // additionalInfo = vcard?.infobox?.more;
  }

  if (!selectedFeature) {
    return <></>;
  }

  return (
    <div className="map-info-box-belis-wrapper">
      <ControlLayout ifStorybook={false}>
        <InfoBox
          isCollapsible={false}
          infoStyle={{}}
          pixelwidth={350}
          header={header}
          headerColor={headerColor}
          title={title}
          subtitle={subtitle}
          currentFeature={selectedFeature}
          featureCollection={[]}
          hideNavigator={true}
          additionalInfo={additionalInfo}
          mapWidth={mapWidth}
          infoBoxBottomResMargin={mapWidth - 25 - 350 - 300 <= 0 ? 38 : 0}
        />
      </ControlLayout>
    </div>
  );
};

export default InfoBoxWrapper;
