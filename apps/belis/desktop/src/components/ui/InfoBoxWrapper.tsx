import { useSelector } from "react-redux";
import {
  getFeatureCollection,
  getSelectedFeature,
} from "../../store/slices/featureCollection";
import { InfoBox } from "@carma-apps/portals";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import { getVCard } from "@carma-apps/belis-library";

const InfoBoxWrapper = () => {
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
    vcard = getVCard(selectedFeature);
    header = <span>{vcard?.infobox?.header || config.header}</span>;
    title = vcard?.infobox?.title;
    subtitle = vcard?.infobox?.subtitle;
    // additionalInfo = vcard?.infobox?.more;
  }

  if (!selectedFeature) {
    return <></>;
  }

  return (
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
      />
    </ControlLayout>
  );
};

export default InfoBoxWrapper;
