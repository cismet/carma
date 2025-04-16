import { useContext, useState } from "react";

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
  const [feature, setFeature] = useState(undefined);
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
              <FuzzySearchWrapper featureGazData={featureGazData} />
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
        infoBox={
          config.tm.vectorStyle ? (
            <FeatureInfobox selectedFeature={feature} />
          ) : (
            <GenericInfoBoxFromFeature config={config.info} />
          )
        }
        modalMenu={
          <DefaultAppMenu
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
            sections={{
              xx_last_twin: <GenericDigitalTwinReferenceSection />,
            }}
          ></DefaultAppMenu>
        }
      >
        {config.tm.vectorStyle ? (
          <CismapLayer
            type="vector"
            style={config.tm.vectorStyle}
            additionalLayerUniquePane="vector"
            additionalLayersFreeZOrder={0}
            selectionEnabled={true}
            onSelectionChanged={(e) => {
              const mapping = config.tm.infoboxMapping;
              if (e.hits && mapping) {
                const selectedVectorFeature = e.hits[0];
                const feature = createVectorFeature(
                  mapping,
                  selectedVectorFeature
                );

                setFeature(feature);
              } else {
                setFeature(undefined);
              }
            }}
          />
        ) : (
          <>
            <TopicMapSelectionContent />
            <FeatureCollection />
          </>
        )}
      </TopicMapComponent>
    </>
  );
};

export default Map;
