import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { RoutedMapLocateControl } from "@carma-mapping/components";
import useLeafletZoomControls from "../hooks/useLeafletZoomControls";

const Baederkarte = () => {
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);

  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const homeControlLeaflet = () => {
    if (homeCenter && routedMap?.leafletMap?.leafletElement) {
      //console.debug("topicMapHomeClick", homeCenter, homePosition);
      routedMap.leafletMap.leafletElement.flyTo(homeCenter, HOME_ZOOM);
    }
  };

  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.kid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, [100]);
  };

  return (
    <>
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <div className="flex flex-col">
              {/* <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right"> */}
              <ControlButtonStyler
                onClick={zoomInLeaflet}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
                title="Maßstab vergrößern (Zoom in)"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
              {/* <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right"> */}
              <ControlButtonStyler
                onClick={zoomOutLeaflet}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
                title="Maßstab verkleinern (Zoom out)"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
            </div>
          </Control>
          <Control position="topleft" order={50}>
            {/* <Tooltip
              title={
                document.fullscreenElement
                  ? "Vollbildmodus ausschalten"
                  : "Vollbildmodus einschalten"
              }
              placement="right"
            > */}
            <ControlButtonStyler
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              dataTestId="full-screen-control"
              title={
                document.fullscreenElement
                  ? "Vollbildmodus ausschalten"
                  : "Vollbildmodus einschalten"
              }
            >
              <FontAwesomeIcon
                icon={document.fullscreenElement ? faCompress : faExpand}
              />
            </ControlButtonStyler>
            {/* </Tooltip> */}
          </Control>
          {/* <Control position="topleft" order={60}>
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={!isMode2d}
              nativeTooltip={true}
            />
          </Control> */}

          <Control position="topleft" order={70}>
            {/* <Tooltip
              title={
                "Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"
              }
              placement="right"
            > */}
            <ControlButtonStyler
              onClick={homeControlLeaflet}
              dataTestId="home-control"
              title={
                "Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"
              }
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </ControlButtonStyler>
            {/* </Tooltip> */}
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <LibFuzzySearch
                gazData={gazData}
                //referenceSystem={referenceSystem}
                //referenceSystemDefinition={referenceSystemDefinition}
                pixelwidth={pixelwidth}
                onSelection={onGazetteerSelection}
                placeholder="Stadtteil | Adresse | POI"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        modalMenu={<Menu />}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString="Einstellungen | Kompaktanleitung"
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        contactButtonEnabled={false}
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            config={{
              displaySecondaryInfoAction: false,
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "Bad",
                  plural: "Bäder",
                },
              },
              noCurrentFeatureTitle: "Keine Bäder gefunden",
              noCurrentFeatureContent: (
                <span>
                  Für mehr Bäder Ansicht mit verkleinern oder mit dem
                  untenstehenden Link auf das komplette Stadtgebiet zoomen.
                </span>
              ),
            }}
          />
        }
      >
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
      </TopicMapComponent>
      {/* <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          pixelwidth={pixelwidth}
          placeholder="Stadtteil | Adresse | POI"
        />
      </div> */}
    </>
  );
};

export default Baederkarte;
