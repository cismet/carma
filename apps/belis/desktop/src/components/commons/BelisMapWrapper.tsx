import {
  BelisMap,
  loadObjectsIntoFeatureCollection,
} from "@carma-apps/belis-library";
import { useDispatch, useSelector } from "react-redux";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
} from "../../store/slices/mapSettings";
import {
  getFeatureCollection,
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
  const storedJWT = useSelector(getJWT);
  const featureCollection = useSelector(getFeatureCollection);
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

  const handleLoadObjects = (settings) => {
    dispatch(
      loadObjectsIntoFeatureCollection(
        settings,
        REST_SERVICE,
        DOMAIN,
        setFeatureCollection
      ) as unknown as UnknownAction
    );
  };

  return (
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
    >
      <></>
    </BelisMap>
  );
};

export default BelisMapLibWrapper;
