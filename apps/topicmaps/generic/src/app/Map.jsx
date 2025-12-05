import { useContext, useEffect, useState, useMemo } from "react";

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
import {
  getApplicationVersion,
  getHashParams,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "@carma-commons/utils";
import versionData from "../version.json";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import {
  FeatureInfobox,
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchWrapper from "./components/FuzzySearchWrapper";
import { createFilterButtons } from "./components/GenericFilterButtonsFactory";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import CismapLayer from "react-cismap/CismapLayer";
import Menu from "./components/Menu";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import md5 from "md5";
import { createVectorFeature } from "@carma-appframeworks/portals";

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

// CHeck wheter urlParams for configPath and configServer are set and store dem in oberrideConfigPath and overrideConfigServer

const hashParams = getHashParams();
const overrideConfigPath = hashParams.configPath;
const overrideConfigServer = hashParams.configServer;
// console.log("xxx ", { hashParams, overrideConfigPath, overrideConfigServer });
// console.log("xxx configPath", import.meta.env.VITE_GTM_CONFIG_PATH);

const configPath =
  overrideConfigPath || import.meta.env.VITE_GTM_CONFIG_PATH || "/dev/"; //uses the dev folder in public to debug local stuff when no ENV is set
const configServer =
  overrideConfigServer || import.meta.env.VITE_GTM_CONFIGSERVER || ""; //uses the local server when no ENV is set

// console.log("xxx ", { configPath, configServer });
// Helper to get the style for a layer from various possible sources
function getLayerStyle(layer, layerInformation) {
  // Try direct style on layer
  if (layer.style) return layer.style;
  // Try style in layerInformation
  const info = layerInformation?.[layer.capabilitiesLayer];
  if (!info) return undefined;
  if (info.style) return info.style;
  if (info.carmaConf && info.carmaConf.vectorStyle)
    return info.carmaConf.vectorStyle;
  return undefined;
}

// Function to render vector layers
function renderCismapLayers(
  config,
  markerSymbolSize,
  setGlobalHits,
  initialVisualSelection,
  layerInformation,
  setMaplibreMap
) {
  return (
    <>
      {(Array.isArray(config.tm.vectorLayers)
        ? config.tm.vectorLayers
        : config.tm.vectorLayers) &&
        (Array.isArray(config.tm.vectorLayers)
          ? config.tm.vectorLayers
          : config.tm.vectorLayers
        ).map((layer, index) => {
          let style = getLayerStyle(layer, layerInformation);
          if (typeof layer.styleManipulation === "function") {
            style = layer.styleManipulation(markerSymbolSize, style);
          }
          const cl_key =
            "cismapLayer." +
            md5(JSON.stringify(style || { noStyle: true })) +
            "." +
            (layer.id || index);

          return (
            <CismapLayer
              key={cl_key}
              type="vector"
              {...layer}
              style={style}
              initialVisualSelection={initialVisualSelection}
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
              onMapLibreCoreMapReady={(map) => {
                if (setMaplibreMap) {
                  setMaplibreMap(map);
                }
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
  slugName,
}) => {
  const [feature, setFeature] = useState(undefined);
  const { selectedFeature } = useContext(FeatureCollectionContext);
  const [globalHits, setGlobalHits] = useState({});
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const [cl_key, setClKey] = useState("");
  const { routedMapRef } = useSelectionTopicMap() ?? {};
  const [selectedVectorObject, setSelectedVectorObject] = useState(undefined);
  const [maplibreMap, setMaplibreMap] = useState(null);

  // Memoize the filter buttons component to prevent re-creation on every render
  const FilterButtonsComponent = useMemo(() => {
    if (config?.tm?.filterConfig) {
      return createFilterButtons(config.tm.filterConfig);
    }
    return null;
  }, [config?.tm?.filterConfig]);
  // console.log("xxx markerSymbolSize", markerSymbolSize);

  // lets assume we will only have vector layers
  useEffect(() => {
    const getFeature = async (infoboxMapping, hit) => {
      console.log("xxx infoboxMapping", infoboxMapping);
      const feature = await createVectorFeature(infoboxMapping, hit);

      // console.log("xxx a2c setFeature", feature);

      setFeature(feature);
    };

    if (globalHits && config?.tm?.vectorLayers) {
      const layers = config.tm.vectorLayers;
      //iterate layers in reverse order
      const reversedLayers = [...layers].reverse();

      for (const layer of reversedLayers) {
        if (globalHits[layer.id] && globalHits[layer.id].length > 0) {
          const hit = globalHits[layer.id][0];
          setSelectedVectorObject({
            source: hit.source,
            sourceLayer: hit.sourceLayer,
            id: hit.id,
          });
          try {
            hit.setSelection(true);
          } catch (e) {}

          const infoboxMapping =
            layer.infoboxMapping ||
            layerInformation[layer.capabilitiesLayer]?.carmaConf
              ?.infoboxMapping;

          if (infoboxMapping) {
            getFeature(infoboxMapping, hit);
          }
          return;
        }
      }
      setFeature(undefined);
    }
  }, [globalHits, layerInformation]);
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  // Compute getSymbolSVG only if a settingsSymbol is present
  let getSymbolSVG;
  const vectorLayerWithSymbol = config.tm?.vectorLayers?.find(
    (l) => l.settingsSymbol
  );
  // Try to get slugName from config, else guess from configPath
  // Compute slugName

  const endsWithSlug =
    configPath.replace(/\/+$/, "").endsWith("/" + slugName) ||
    configPath.replace(/\/+$/, "").endsWith(slugName);
  if (vectorLayerWithSymbol && vectorLayerWithSymbol.settingsSymbol) {
    getSymbolSVG = (size, color) => {
      let symbol = vectorLayerWithSymbol.settingsSymbol;
      let symbolPath = null;
      if (symbol.startsWith("@")) {
        const filename = symbol.substring(1);
        const path = configPath.endsWith("/") ? configPath : configPath + "/";
        const server = configServer.endsWith("/")
          ? configServer.slice(0, -1)
          : configServer;
        if (configServer && configServer.length > 0) {
          symbolPath = `${server}${path}${slugName}/${filename}`;
        } else {
          symbolPath = `${path}${slugName}/${filename}`;
        }
      } else {
        symbolPath = symbol;
      }
      return (
        <img
          width={size}
          src={symbolPath}
          style={color ? { filter: `drop-shadow(0 0 0 ${color})` } : {}}
          alt="symbol"
        />
      );
    };
  } else {
    getSymbolSVG = undefined;
  }

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
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
            <div style={{ marginTop: "4px" }}>
              <FuzzySearchWrapper
                featureGazData={featureGazData}
                placeholder={config.tm.gazetteerSearchBoxPlaceholdertext}
                clickAfterGazetteerHit={config.tm.clickAfterGazetteerHit}
              />
            </div>
          </Control>
        )}

        {FilterButtonsComponent && (
          <Control position="topcenter" order={10}>
            <FilterButtonsComponent
              maplibreMap={maplibreMap}
              selectedFeature={feature}
              setSelectedFeature={setFeature}
            />
          </Control>
        )}

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
              <FeatureInfobox
                selectedFeature={feature}
                versionData={versionData}
              />
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
              previewChildren={renderCismapLayers(
                config,
                markerSymbolSize,
                setGlobalHits,
                selectedVectorObject,
                layerInformation,
                null
              )}
              previewFeatureCollectionCount={
                config?.tm?.previewFeatureCollectionCount
              }
              {...(getSymbolSVG ? { getSymbolSVG } : {})}
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
          {renderCismapLayers(
            config,
            markerSymbolSize,
            setGlobalHits,
            selectedVectorObject,
            layerInformation,
            setMaplibreMap
          )}
          {config.tm.noFeatureCollection !== true && (
            <>
              <FeatureCollection />
            </>
          )}
          <TopicMapSelectionContent />
        </TopicMapComponent>
      </ControlLayout>
    </div>
  );
};

export default Map;
