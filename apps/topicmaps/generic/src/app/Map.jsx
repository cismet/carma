import { useContext, useEffect, useState } from "react";

import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import DefaultAppMenu from "react-cismap/topicmaps/menu/DefaultAppMenu";
import SecondaryInfoModal from "./SecondaryInfoModal";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { MenuFooter } from "@carma-collab/wuppertal/commons";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../version.json";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchWrapper from "./components/FuzzySearchWrapper";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import CismapLayer from "react-cismap/CismapLayer";
import { createVectorFeature } from "./helper";
import FeatureInfobox from "./components/FeatureInfobox";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import Menu from "./components/Menu";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import md5 from "md5";
const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const downloadText = (text, filename) => {
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};
const configPath = import.meta.env.VITE_GTM_CONFIG_PATH || "/dev/"; //uses the dev folder in public to debug local stuff when no ENV is set
const configServer = import.meta.env.VITE_GTM_CONFIGSERVER || ""; //uses the local server when no ENV is set
// Function to render vector layers
function renderVectorLayers(config, markerSymbolSize, setGlobalHits) {
  return (
    <>
      {config.tm.vectorLayers &&
        config.tm.vectorLayers.map((layer, index) => {
          let style = layer.style;
          if (typeof layer.styleManipulation === "function") {
            style = layer.styleManipulation(markerSymbolSize, layer.style);
          }
          const cl_key =
            "cismapLayer." +
            md5(JSON.stringify(style)) +
            "." +
            (layer.id || index);

          return (
            <CismapLayer
              key={cl_key}
              type="vector"
              {...layer}
              style={style}
              additionalLayerUniquePane={"vector." + index}
              additionalLayersFreeZOrder={index}
              selectionEnabled={true}
              manualSelectionManagement={true}
              maxSelectionCount={1}
              onSelectionChanged={(e) => {
                setGlobalHits((old) => {
                  const ret = { ...old, [layer.id]: e.hits };
                  return ret;
                });
              }}
            />
          );
        })}
    </>
  );
}

const Map = ({
  config,
  featureGazData = [],
  layerInformation = {},
  layerHelpBlocks,
}) => {
  const [feature, setFeature] = useState(undefined);
  const { selectedFeature } = useContext(FeatureCollectionContext);
  const [globalHits, setGlobalHits] = useState({});
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const [cl_key, setClKey] = useState("");

  // console.log("xxx markerSymbolSize", markerSymbolSize);

  // lets assume we will only have vector layers
  useEffect(() => {
    if (globalHits && config?.tm?.vectorLayers) {
      const layers = config.tm.vectorLayers;
      //iterate layers in reverse order
      const reversedLayers = [...layers].reverse();

      for (const layer of reversedLayers) {
        if (globalHits[layer.id] && globalHits[layer.id].length > 0) {
          const hit = globalHits[layer.id][0];
          hit.setSelection(true);
          console.log("layer", layer);

          const infoboxMapping =
            layer.infoboxMapping ||
            layerInformation[layer.capabilitiesLayer]?.carmaConf
              ?.infoboxMapping;
          if (infoboxMapping) {
            const feature = createVectorFeature(infoboxMapping, hit);
            setFeature(feature);
          }
          return;
        }
      }
    }
  }, [globalHits, layerInformation]);
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  const getSymbolSVG = (size, color) => {
    return (
      <img
        width={size}
        src={
          "http://localhost:4200/dev/trinkbrunnenkarte_wuppertal/tw_outdoor.svg"
        }
      />
    );
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
          {config?.tm?.zoomControls && (
            <Control position="topleft" order={10}>
              <ZoomControl />
            </Control>
          )}

          {config?.tm?.fullScreenControl && (
            <Control position="topleft" order={50}>
              <FullscreenControl />
            </Control>
          )}
          {config?.tm?.locatorControl && (
            <Control position="topleft" order={60} title="Mein Standort">
              <RoutedMapLocateControl
                tourRefLabels={null}
                disabled={false}
                nativeTooltip={true}
              />
            </Control>
          )}
          {config?.tm?.gazetteerSearchBox && (
            <Control position="bottomleft" order={10}>
              <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
                <FuzzySearchWrapper
                  featureGazData={featureGazData}
                  placeholder={config.tm.gazetteerSearchBoxPlaceholdertext}
                  clickAfterGazetteerHit={config.tm.clickAfterGazetteerHit}
                />
              </div>
            </Control>
          )}
        </ControlLayout>
      </div>
      <SecondaryInfoModal
        feature={selectedFeature}
        footer={
          <MenuFooter
            version={getApplicationVersion(versionData)}
            setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
          />
        }
      />
      <TopicMapComponent
        {...config.tm}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        gazetteerSearchComponent={EmptySearchComponent}
        infoBox={
          config.tm.vectorLayers && config.tm.noFeatureCollection === true ? (
            <FeatureInfobox selectedFeature={feature} />
          ) : (
            <>
              {config.tm.noFeatureCollection !== true && (
                <GenericInfoBoxFromFeature config={config.info} />
              )}
            </>
          )
        }
        hamburgerMenu={config?.tm?.applicationMenu}
        modalMenu={
          <Menu
            menuTitle={config?.tm?.applicationMenuTitle}
            checkBoxSettingsSectionTitle={null}
            skipClusteringSettings={
              config?.tm?.applicationMenuSkipClusteringSettings
            }
            skipSymbolsizeSetting={
              config?.tm?.applicationMenuSkipSymbolsizeSetting
            }
            simpleHelp={config?.simpleHelpObject}
            previewMapPosition={config?.tm?.previewMapPosition}
            previewChildren={renderVectorLayers(
              config,
              markerSymbolSize,
              setGlobalHits
            )}
            previewFeatureCollectionCount={
              config?.tm?.previewFeatureCollectionCount
            }
            getSymbolSVG={getSymbolSVG}
            previewChildrenKey={cl_key}
            introductionMarkdown={
              config?.tm?.applicationMenuIntroductionMarkdown
            }
            sectionmapping={
              config?.tm?.applicationMenuIntroductionMarkdownSectionMapping
            }
            menuIcon={config?.tm?.applicationMenuIconname}
            menuFooter={
              config?.tm?.applicationMenuFooter || (
                <MenuFooter
                  version={getApplicationVersion(versionData)}
                  setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
                />
              )
            }
            sections={[<GenericDigitalTwinReferenceSection />]}
            layerHelpBlocks={layerHelpBlocks}
          />
        }
      >
        {renderVectorLayers(config, markerSymbolSize, setGlobalHits)}
        {config.tm.noFeatureCollection !== true && (
          <>
            <FeatureCollection />
          </>
        )}
        <TopicMapSelectionContent />
      </TopicMapComponent>
    </>
  );
};

export default Map;
