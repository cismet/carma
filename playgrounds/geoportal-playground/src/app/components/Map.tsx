import { useContext, useEffect, useRef, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { useSelector } from "react-redux";
import { getGazData, paramsToObject } from "../helper/helper";
import {
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getShowFullscreenButton,
  getShowHamburgerMenu,
  getShowLocatorButton,
} from "../store/slices/mapping";
import LayerWrapper from "./layers/LayerWrapper";
import InfoBoxMeasurement from "./map-measure/InfoBoxMeasurement";
import PaleOverlay from "react-cismap/PaleOverlay";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import { useSearchParams } from "react-router-dom";
import getBackgroundLayers from "../helper/layer";
import { getMode, getShowLayerButtons } from "../store/slices/ui";
import CismapLayer from "react-cismap/CismapLayer";
import GazetteerSearchComponent from "react-cismap/GazetteerSearchComponent";
import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma-commons/types";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

const Map = () => {
  // const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const mode = useSelector(getMode);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const focusMode = useSelector(getFocusMode);
  const [urlParams, setUrlParams] = useSearchParams();

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;

  useEffect(() => {
    // getGazData(setGazData);
  }, []);

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setHeight(wrapperRef.current.clientHeight);
        setWidth(wrapperRef.current.clientWidth);
      }
    };

    window.addEventListener("resize", handleResize);

    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="h-full w-full" ref={wrapperRef}>
      <TopicMapComponent
        gazData={gazData}
        hamburgerMenu={showHamburgerMenu}
        locatorControl={showLocatorButton}
        fullScreenControl={showFullscreenButton}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        minZoom={5}
        backgroundlayers="empty"
        mappingBoundsChanged={(boundingbox) => {
          // console.log('xxx bbox', createWMSBbox(boundingbox));
        }}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(urlParams), ...location };
          setUrlParams(newParams);
        }}
        // gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        infoBox={
          mode === "measurement" ? (
            <InfoBoxMeasurement key={mode} />
          ) : (
            <div></div>
          )
        }
      >
        <TopicMapSelectionContent />

        {backgroundLayer.visible &&
          getBackgroundLayers({ layerString: backgroundLayer.layers })}
        {focusMode && <PaleOverlay />}
        {showLayerButtons && <LayerWrapper />}
        {layers.map((layer, i) => {
          if (layer.visible) {
            switch (layer.layerType) {
              case "wmts":
                return (
                  <CismapLayer
                    key={`${focusMode}_${i}_${layer.id}`}
                    url={layer.props.url}
                    maxZoom={26}
                    layers={layer.props.name}
                    format="image/png"
                    tiled={true}
                    transparent="true"
                    pane="additionalLayers1"
                    opacity={layer.opacity.toFixed(1) || 0.7}
                    type={"wmts"}
                  />
                );
              case "vector":
                return (
                  <CismapLayer
                    key={`${focusMode}_${i}_${layer.id}_${layer.opacity}`}
                    style={layer.props.style}
                    maxZoom={26}
                    pane={`additionalLayers${i}`}
                    opacity={layer.opacity || 0.7}
                    type="vector"
                  />
                );
            }
          } else {
            return <></>;
          }
        })}
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          pixelwidth={pixelwidth}
          placeholder="Stadtteil | Adresse | POI"
        />
      </div>
    </div>
  );
};

export default Map;
