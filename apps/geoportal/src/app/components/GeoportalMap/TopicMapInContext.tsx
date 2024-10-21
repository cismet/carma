import { useContext, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/geoportal";

import configuredStore from "../../store";
import { getShowHamburgerMenu } from "../../store/slices/mapping";
import {
  getUIMode,
  setTopicMapAppMenuVisible,
  UIMode,
} from "../../store/slices/ui";

import "../leaflet.css";

import { onClickTopicMap } from "./topicmap.utils.ts";
import InfoBoxMeasurement from "../map-measure/InfoBoxMeasurement.jsx";
import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import { selectViewerIsMode2d } from "@carma-mapping/cesium-engine";
import { useWindowSize } from "../../hooks/useWindowSize.ts";
import TopicMapContent from "./TopicMapContent.tsx";
import {
  setLeafletElement,
  setMaskingPolygon,
  setReferenceSystem,
  setReferenceSystemDefinition,
} from "../../store/slices/topicmap.ts";
import { ErrorBoundary } from "react-error-boundary";
import AppErrorFallback from "../AppErrorFallback.tsx";

export const TopicMapInContext = ({
  backgroundLayer,
  gazData,
  gazetteerHit,
  layers,
  leafletConfig,
  overlayFeature,
  pos,
  setPos,
  tooltipText,
  version,
  wrapperRef,
}) => {
  const dispatch = useDispatch();

  const { width, height } = useWindowSize(wrapperRef);

  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const isMode2d = useSelector(selectViewerIsMode2d);

  const showHamburgerMenu = useSelector(getShowHamburgerMenu);

  const topicMapContext = useContext<typeof TopicMapContext>(TopicMapContext);

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const renderInfoBox = () => {
    if (isMode2d) {
      if (isModeMeasurement) {
        return <InfoBoxMeasurement key={uiMode} />;
      }
      if (isModeFeatureInfo) {
        return <FeatureInfoBox pos={pos} />;
      }
    }
    return <div></div>;
  };

  useEffect(() => {
    setAppMenuVisible && dispatch(setTopicMapAppMenuVisible(setAppMenuVisible));
  }, [setAppMenuVisible, dispatch]);

  useEffect(() => {
    if (topicMapContext.routedMapRef) {
      console.log(
        "HOOK: topic map context changed, topicMapContext",
        topicMapContext.routedMapRef,
      );
      dispatch(
        setLeafletElement(
          topicMapContext.routedMapRef.leafletMap.leafletElement,
        ),
      );
    }
  }, [topicMapContext.routedMapRef, dispatch]);

  useEffect(() => {
    if (
      topicMapContext.referenceSystem &&
      topicMapContext.referenceSystemDefinition
    ) {
      console.log(
        "HOOK: topic map context reference system changed",
        topicMapContext.referenceSystem,
        topicMapContext.referenceSystemDefinition,
      );
      dispatch(setReferenceSystem(topicMapContext.referenceSystem));
      dispatch(
        setReferenceSystemDefinition(topicMapContext.referenceSystemDefinition),
      );
    }
  }, [
    topicMapContext.referenceSystem,
    topicMapContext.referenceSystemDefinition,
    dispatch,
  ]);

  useEffect(() => {
    if (topicMapContext.maskingPolygon) {
      console.log(
        "HOOK: topic map context masking polygon changed",
        topicMapContext.maskingPolygon,
      );
      dispatch(setMaskingPolygon(topicMapContext.maskingPolygon));
    }
  }, [topicMapContext.maskingPolygon, dispatch]);

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <TopicMapComponent
        gazData={gazData}
        modalMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              versionString: version,
            })}
          />
        }
        applicationMenuTooltipString={tooltipText}
        hamburgerMenu={showHamburgerMenu}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        minZoom={5}
        backgroundlayers="empty"
        mappingBoundsChanged={(boundingbox) => {
          // console.log('xxx bbox', createWMSBbox(boundingbox));
        }}
        //locationChangedHandler={(location) => {const newParams = { ...paramsToObject(urlParams), ...location }; setUrlParams(newParams);}}
        onclick={(e) =>
          onClickTopicMap(e, {
            dispatch,
            mode: uiMode,
            store: configuredStore.store,
            setPos,
            zoom: e.target.getZoom(),
          })
        }
        gazetteerSearchComponent={<></>}
        infoBox={renderInfoBox()}
        zoomSnap={leafletConfig.zoomSnap}
        zoomDelta={leafletConfig.zoomDelta}
      >
        <TopicMapContent
          backgroundLayer={backgroundLayer}
          layers={layers}
          overlayFeature={overlayFeature}
          gazetteerHit={gazetteerHit}
          pos={pos}
          setPos={setPos}
        />
      </TopicMapComponent>
    </ErrorBoundary>
  );
};

export default TopicMapInContext;
