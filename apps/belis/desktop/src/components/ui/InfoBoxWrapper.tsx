import { useSelector } from "react-redux";
import {
  getFeatureCollection,
  getSelectedFeature,
} from "../../store/slices/featureCollection";
import { GenericInfoBoxFromFeature, InfoBox } from "@carma-apps/portals";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";

const InfoBoxWrapper = () => {
  const featureCollection = useSelector(getFeatureCollection);
  const selectedFeature = useSelector(getSelectedFeature);
  const header = <span>{selectedFeature.id}</span>;

  if (!selectedFeature) {
    return <></>;
  }

  return (
    <ControlLayout ifStorybook={false}>
      <InfoBox
        isCollapsible={false}
        infoStyle={{}}
        currentFeature={selectedFeature}
        featureCollection={useSelector(getFeatureCollection)}
        pixelwidth={350}
        header={header}
        hideNavigator={true}
      />
    </ControlLayout>
  );
};

export default InfoBoxWrapper;
