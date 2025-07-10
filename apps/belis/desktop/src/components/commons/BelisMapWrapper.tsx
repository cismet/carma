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
  setDone,
  setFeatureCollection,
} from "../../store/slices/featureCollection";
import { AppDispatch } from "../../store";
import { getJWT } from "../../store/slices/auth";
import { DOMAIN, REST_SERVICE } from "../../constants/belis";
import type { UnknownAction } from "redux";

const MODES = {
  OBJECTS: "OBJECTS",
  TASKLISTS: "TASKLISTS",
  PROTOCOLS: "PROTOCOLS",
} as const;
const BelisMapLibWrapper = ({ refRoutedMap, width, height, jwt }) => {
  const dispatch: AppDispatch = useDispatch();
  const featureCollection = useSelector(getFeatureCollection);
  const filter = useSelector(getFilter);
  const fcIsDone = useSelector(getDone);
  //   const inFocusMode = useSelector(isInFocusMode);
  //   const selectedFeature = useSelector(getSelectedFeature);
  //   const featureCollectionMode = useSelector(getFeatureCollectionMode);
  //   const loadingState = useSelector(getLoadingState);
  //   const connectionMode = useSelector(getConnectionMode);
  //   const zoom = useSelector(getZoom);
  //   const inPaleMode = useSelector(isPaleModeActive);
  //   const background = useSelector(getBackground);

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
        width={width}
        height={height}
        setDone={setDoneHandler}
      />
      <BelisMap
        refRoutedMap={refRoutedMap}
        width={width}
        height={height}
        jwt={jwt}
        setBounds={() => {}}
        setMapRef={() => {}}
        setZoom={() => {}}
        loadObjects={handleLoadObjects}
        featureCollection={featureCollection}
        inFocusMode={false}
        selectedFeature={{}}
        loadingState={false}
        featureCollectionMode={"OBJECTS"}
        connectionMode={"ONLINE"}
        background={""}
        inPaleMode={false}
        handleSelectedFeature={() => {}}
        MODES={MODES}
        zoom={15}
        fcMode="OBJECTS"
        initIndex={() => {}}
        activeBackgroundLayer={activeBackgroundLayer}
        backgroundLayerOpacities={backgroundLayerOpacities}
        filter={filter}
      >
        <></>
      </BelisMap>
    </div>
  );
};

export default BelisMapLibWrapper;
