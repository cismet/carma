import {
  BelisMap,
  loadObjectsIntoFeatureCollection,
  MapBlocker,
} from "@carma-apps/belis-library";
import { useDispatch, useSelector } from "react-redux";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
} from "../../store/slices/mapSettings";
import {
  getDone,
  getFeatureCollection,
  getFilter,
  getSelectedFeature,
  setDone,
  setFeatureCollection,
  setSelectedFeature,
} from "../../store/slices/featureCollection";
import { AppDispatch } from "../../store";
import { DOMAIN, REST_SERVICE } from "../../constants/belis";
import type { UnknownAction } from "redux";
import InfoBoxWrapper from "../ui/InfoBoxWrapper";

const MODES = {
  OBJECTS: "OBJECTS",
  TASKLISTS: "TASKLISTS",
  PROTOCOLS: "PROTOCOLS",
} as const;
const BelisMapLibWrapper = ({ refRoutedMap, jwt, mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();
  const featureCollection = useSelector(getFeatureCollection);
  const selectedFeature = useSelector(getSelectedFeature);

  const filter = useSelector(getFilter);
  const fcIsDone = useSelector(getDone);
  const handleSelectedFeature = (feature) => {
    if (feature) {
      const updatedFeature = { ...feature, selected: true };
      dispatch(setSelectedFeature(updatedFeature));
    }
  };

  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const setDoneHandler = (done) => {
    dispatch(setDone(done));
  };
  const handleLoadObjects = (settings) => {
    dispatch(
      loadObjectsIntoFeatureCollection(
        settings,
        REST_SERVICE,
        DOMAIN,
        setFeatureCollection,
        filter,
        setDone
      ) as unknown as UnknownAction
    );
  };

  return (
    <div className="relative">
      <MapBlocker
        blocking={fcIsDone === false}
        visible={true}
        width={mapSizes.width}
        height={mapSizes.height}
        setDone={setDoneHandler}
      />
      <BelisMap
        refRoutedMap={refRoutedMap}
        width={mapSizes.width}
        height={mapSizes.height}
        jwt={jwt}
        setBounds={() => {}}
        setMapRef={() => {}}
        setZoom={() => {}}
        loadObjects={handleLoadObjects}
        featureCollection={featureCollection}
        inFocusMode={false}
        selectedFeature={selectedFeature}
        loadingState={false}
        featureCollectionMode={"OBJECTS"}
        connectionMode={"ONLINE"}
        background={""}
        inPaleMode={false}
        handleSelectedFeature={handleSelectedFeature}
        MODES={MODES}
        zoom={15}
        fcMode="OBJECTS"
        initIndex={() => {}}
        activeBackgroundLayer={activeBackgroundLayer}
        backgroundLayerOpacities={backgroundLayerOpacities}
        filter={filter}
      >
        <InfoBoxWrapper />
      </BelisMap>
    </div>
  );
};

export default BelisMapLibWrapper;
