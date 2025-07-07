import { BelisMap } from "@carma-apps/belis-library";
import { useDispatch, useSelector } from "react-redux";

const BelisMapLibWrapper = ({ refRoutedMap, width, height, jwt }) => {
  //   const featureCollection = useSelector(getFeatureCollection);
  //   const inFocusMode = useSelector(isInFocusMode);
  //   const selectedFeature = useSelector(getSelectedFeature);
  //   const featureCollectionMode = useSelector(getFeatureCollectionMode);
  //   const loadingState = useSelector(getLoadingState);
  //   const connectionMode = useSelector(getConnectionMode);
  //   const zoom = useSelector(getZoom);
  //   const inPaleMode = useSelector(isPaleModeActive);
  //   const background = useSelector(getBackground);

  const dispatch = useDispatch();
  const MODES = {
    OBJECTS: "OBJECTS",
    TASKLISTS: "TASKLISTS",
    PROTOCOLS: "PROTOCOLS",
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
      loadObjects={() => {}}
      featureCollection={[]}
      inFocusMode={false}
      selectedFeature={{}}
      loadingState={false}
      featureCollectionMode={""}
      connectionMode={"ONLINE"}
      background={""}
      inPaleMode={false}
      handleSelectedFeature={() => {}}
      MODES={MODES}
      zoom={15}
      fcMode={""}
      initIndex={() => {}}
    >
      <></>
    </BelisMap>
  );
};

export default BelisMapLibWrapper;
