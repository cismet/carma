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
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { DOMAIN, REST_SERVICE } from "../../constants/belis";
import type { UnknownAction } from "redux";
import { GenericInfoBoxFromFeature, InfoBox } from "@carma-apps/portals";

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
  const selectedFeature = useSelector(getSelectedFeature);
  //   const featureCollectionMode = useSelector(getFeatureCollectionMode);
  //   const loadingState = useSelector(getLoadingState);
  //   const connectionMode = useSelector(getConnectionMode);
  //   const zoom = useSelector(getZoom);
  //   const inPaleMode = useSelector(isPaleModeActive);
  const handleSelectedFeature = (feature) => {
    console.log("xxx feature", feature);
    dispatch(setSelectedFeature(feature));
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

  const header = <span>{selectedFeature.id}</span>;

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
        handleSelectedFeature={handleSelectedFeature}
        MODES={MODES}
        zoom={15}
        fcMode="OBJECTS"
        initIndex={() => {}}
        activeBackgroundLayer={activeBackgroundLayer}
        backgroundLayerOpacities={backgroundLayerOpacities}
        filter={filter}
      >
        {selectedFeature !== undefined && selectedFeature !== null ? (
          <ControlLayout ifStorybook={false}>
            <InfoBox
              isCollapsible={false}
              infoStyle={{}}
              // colorizer={{}}
              currentFeature={selectedFeature}
              featureCollection={[]}
              pixelwidth={350}
              header={header}
              hideNavigator={true}
              // headerColor={headerColor}
              // links={links}
              // title={title}
              // next={config.next}
              // previous={config.previous}
              // subtitle={subtitle}
            />
          </ControlLayout>
        ) : (
          <></>
        )}
      </BelisMap>
    </div>
  );
};

export default BelisMapLibWrapper;
