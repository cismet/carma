import { useSelector } from "react-redux";
import {
  getFeatureCollection,
  getSelectedFeature,
} from "../../store/slices/featureCollection";
import { getMeasurements } from "../../store/slices/measurements";
import { InfoBox } from "@carma-appframeworks/portals";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import { getVCard } from "@carma-appframeworks/belis";
import {
  MEASUREMENT_FEATUREKIND,
  buildMeasurementInfo,
  getMeasurementOrder,
} from "@carma-mapping/measurements";

const InfoBoxWrapper = ({ mapWidth }) => {
  const featureCollection = useSelector(getFeatureCollection);
  const selectedFeature = useSelector(getSelectedFeature);
  const measurements = useSelector(getMeasurements);
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

  let header = <span>Feature title</span>;
  let title = "feature title";
  let subtitle = "feature subtitle";
  const additionalInfo = "";

  if (selectedFeature !== undefined && selectedFeature !== null) {
    if (selectedFeature.featurekind === MEASUREMENT_FEATUREKIND) {
      const order = getMeasurementOrder(measurements, selectedFeature);
      const info = buildMeasurementInfo(selectedFeature, order);
      header = <span>{info.header || config.header}</span>;
      title = info.title;
      subtitle = info.subtitle;
    } else {
      // getVCard's declared return type is `{ list: {}, infobox: {} }`; the
      // actual runtime keys are populated by the Fachobjekt switch inside.
      const vcard = getVCard(selectedFeature) as {
        infobox?: { header?: string; title?: string; subtitle?: string };
      };
      header = <span>{vcard?.infobox?.header || config.header}</span>;
      title = vcard?.infobox?.title;
      subtitle = vcard?.infobox?.subtitle;
    }
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
