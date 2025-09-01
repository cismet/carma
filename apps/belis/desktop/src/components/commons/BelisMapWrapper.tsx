import {
  BelisMap,
  loadObjectsIntoFeatureCollection,
  MapBlocker,
} from "@carma-appframeworks/belis";
import { useDispatch, useSelector } from "react-redux";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getZoom,
  isInPaleMode,
  isInWishedSearchMode,
  isSearchForbidden,
  searchMinimumZoomThreshhold,
  setSearchMode,
  setZoom,
} from "../../store/slices/mapSettings";
import {
  getDone,
  getFeatureCollection,
  getFilter,
  getSelectedFeature,
  isInFocusMode,
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
  const inFocusMode = useSelector(isInFocusMode);
  const inPaleMode = useSelector(isInPaleMode);
  const filter = useSelector(getFilter);
  const fcIsDone = useSelector(getDone);
  const inWishedSearchMode = useSelector(isInWishedSearchMode);

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
        setDone,
        isSearchForbidden
      ) as unknown as UnknownAction
    );
  };
  const handleSetZoom = (z) => {
    dispatch(setZoom(z));
    if (z < searchMinimumZoomThreshhold) {
      dispatch(setSearchMode(false));
    }

    if (z >= searchMinimumZoomThreshhold && inWishedSearchMode) {
      dispatch(setSearchMode(true));
    }
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
        setZoom={handleSetZoom}
        loadObjects={handleLoadObjects}
        featureCollection={featureCollection}
        inFocusMode={inFocusMode}
        selectedFeature={selectedFeature}
        loadingState={false}
        featureCollectionMode={"OBJECTS"}
        connectionMode={"ONLINE"}
        background={""}
        inPaleMode={inPaleMode}
        handleSelectedFeature={handleSelectedFeature}
        MODES={MODES}
        zoom={19}
        fcMode="OBJECTS"
        initIndex={() => {}}
        activeBackgroundLayer={activeBackgroundLayer}
        backgroundLayerOpacities={backgroundLayerOpacities}
        filter={filter}
        isShowSearch={true}
      >
        <InfoBoxWrapper mapWidth={mapSizes.width} />
      </BelisMap>
    </div>
  );
};

export default BelisMapLibWrapper;
