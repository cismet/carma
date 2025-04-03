import { useContext } from "react";

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
const Map = ({ config, featureGazData = [] }) => {
  const { selectedFeature } = useContext(FeatureCollectionContext);

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
          <Control position="topleft" order={10}>
            <ZoomControl />
          </Control>

          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <FuzzySearchWrapper featureGazData={featureGazData} />≈{" "}
            </div>
          </Control>
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
        infoBox={<GenericInfoBoxFromFeature config={config.info} />}
        modalMenu={
          <DefaultAppMenu
            menuTitle={config?.tm?.applicationMenuTitle}
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
            sections={{
              xx_last_twin: <GenericDigitalTwinReferenceSection />,
            }}
          ></DefaultAppMenu>
        }
      >
        <TopicMapSelectionContent />
        <FeatureCollection />
        {/* <div className="leaflet-top leaflet-right" style={{ paddingTop: 46 }}>
          <div className="leaflet-control">
            <a
              style={{ margin: 5 }}
              className="styleaslink"
              onClick={() => {
                downloadText(
                  JSON.stringify(configFromFile, null, 2),
                  "config.json"
                );
                downloadText(
                  JSON.stringify(featureDefaultProperties, null, 2),
                  "featureDefaultProperties.json"
                );
                downloadText(
                  JSON.stringify(featureDefaults, null, 2),
                  "featureDefaults.json"
                );
                downloadText(
                  JSON.stringify(features, null, 2),
                  "features.json"
                );
                // downloadText(JSON.stringify(infoBoxConfig, null, 2), "infoBoxConfig.json");
                downloadText(
                  JSON.stringify(simpleHelp, null, 2),
                  "simpleHelp.json"
                );
              }}
            >
              <Icon name="cog" />
              <Icon name="download" />
            </a>
          </div>
        </div> */}
      </TopicMapComponent>
    </>
  );
};

export default Map;
