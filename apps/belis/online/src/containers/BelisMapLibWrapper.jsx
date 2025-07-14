import { BelisMap } from "@carma-apps/belis-library";
import { useDispatch, useSelector } from "react-redux";
import { setBounds } from "../core/store/slices/mapInfo";
import { setMapRef } from "../core/store/slices/map";
import { getZoom, setZoom } from "../core/store/slices/zoom";
import {
  getFeatureCollection,
  getFeatureCollectionMode,
  getGazetteerHit,
  getOverlayFeature,
  getSelectedFeature,
  isInFocusMode,
  isSecondaryInfoVisible,
  loadObjects,
  MODES,
  setSelectedFeature,
} from "../core/store/slices/featureCollection";
import { getLoadingState, initIndex } from "../core/store/slices/spatialIndex";
import { getConnectionMode } from "../core/store/slices/app";
import { getBackground } from "../core/store/slices/background";
import { isPaleModeActive } from "../core/store/slices/paleMode";
import InfoBox from "../components/commons/InfoBox";

const BelisMapLibWrapper = ({ refRoutedMap, width, height, jwt }) => {
  const featureCollection = useSelector(getFeatureCollection);
  const inFocusMode = useSelector(isInFocusMode);
  const selectedFeature = useSelector(getSelectedFeature);
  const featureCollectionMode = useSelector(getFeatureCollectionMode);
  const loadingState = useSelector(getLoadingState);
  const connectionMode = useSelector(getConnectionMode);
  const zoom = useSelector(getZoom);
  const inPaleMode = useSelector(isPaleModeActive);
  const background = useSelector(getBackground);

  const dispatch = useDispatch();
  const handleSetBounds = (mapBounds) => {
    dispatch(setBounds(mapBounds));
  };
  const handleSetMapRef = (mapRef) => {
    dispatch(setMapRef(mapRef));
  };
  const handleSetZoom = (z) => {
    dispatch(setZoom(z));
  };
  const handleLoadObjects = (obj) => {
    dispatch(loadObjects(obj));
  };
  const handleInitIndexObjects = (setIndexInitialized) => {
    dispatch(
      initIndex(() => {
        setIndexInitialized(true);
      })
    );
  };

  const handleSelectedFeature = (feature) => {
    dispatch(setSelectedFeature(feature));
  };

  return (
    <BelisMap
      refRoutedMap={refRoutedMap}
      width={width}
      height={height}
      jwt={jwt}
      setBounds={handleSetBounds}
      setMapRef={handleSetMapRef}
      setZoom={handleSetZoom}
      loadObjects={handleLoadObjects}
      featureCollection={featureCollection}
      inFocusMode={inFocusMode}
      selectedFeature={selectedFeature}
      loadingState={loadingState}
      featureCollectionMode={featureCollectionMode}
      connectionMode={connectionMode}
      background={background}
      inPaleMode={inPaleMode}
      handleSelectedFeature={handleSelectedFeature}
      MODES={MODES}
      zoom={zoom}
      fcMode={featureCollectionMode}
      initIndex={handleInitIndexObjects}
    >
      {selectedFeature !== undefined && selectedFeature !== null ? (
        <InfoBox refRoutedMap={refRoutedMap} />
      ) : (
        <></>
      )}
    </BelisMap>
  );
};

export default BelisMapLibWrapper;
