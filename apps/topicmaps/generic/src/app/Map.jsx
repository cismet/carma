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
const Map = ({ config, featureGazData = [], layerInformation = {} }) => {
  const [feature, setFeature] = useState(undefined);
  const { selectedFeature } = useContext(FeatureCollectionContext);
  const [globalHits, setGlobalHits] = useState({});
  console.log("layerInformation", layerInformation);
  // lets assume we will only have vector layers
  useEffect(() => {
    if (globalHits) {
      const layers = config.tm.vectorLayers;
      //iterate layers in reverse order
      const reversedLayers = [...layers].reverse();

      for (const layer of reversedLayers) {
        if (globalHits[layer.id] && globalHits[layer.id].length > 0) {
          const hit = globalHits[layer.id][0];
          hit.setSelection(true);

          const infoBoxMapping =
            layerInformation[layer.capabilitiesLayer]?.carmaConf
              ?.infoboxMapping;
          if (infoBoxMapping) {
            const feature = createVectorFeature(infoBoxMapping, hit);
            setFeature(feature);
          }
          return;
        }
      }
    }
  }, [globalHits, layerInformation]);
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

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
            previewFeatureCollectionCount={
              config?.tm?.previewFeatureCollectionCount
            }
            introductionMarkdown={
              config?.tm?.applicationMenuIntroductionMarkdown
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
          />
        }
      >
        {config.tm.vectorLayers &&
          config.tm.vectorLayers.map((layer, index) => {
            // Use style from layerInformation if not already set
            const info = layerInformation[layer.capabilitiesLayer];
            const style = layer.style || info?.carmaConf?.vectorStyle;
            // Use a key that changes with style to force remount
            const layerKey = `${layer.id}-${style || "nostyle"}`;
            return (
              <CismapLayer
                key={layerKey}
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
