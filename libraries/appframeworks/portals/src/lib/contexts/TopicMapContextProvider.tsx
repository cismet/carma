import React, { useRef } from "react";
import { useImmer } from "use-immer";
import FeatureCollectionContextProvider from "./FeatureCollectionContextProvider";
import ResponsiveTopicMapContextProvider from "./ResponsiveTopicMapContextProvider";
import TopicMapStylingContextProvider from "./TopicMapStylingContextProvider";
import LightBoxContextProvider from "./LightBoxContextProvider";

import UIContextProvider from "./UIContextProvider";
import proj4 from "proj4";
import { projectionData } from "../constants/gis";
import { createHashHistory } from "history";
import localforage from "localforage";
import { getType } from "@turf/invariant";
import envelope from "@turf/envelope";
import { convertBBox2Bounds } from "../tools/gisHelper";
import { MappingConstants } from "..";
import { OfflineLayerCacheContextProvider } from "./OfflineLayerCacheContextProvider";

const defaultState = {
  location: undefined,
  boundingBox: undefined,
  routedMapRef: undefined,
  titleFactory: undefined,
};

const StateContext = React.createContext();
const DispatchContext = React.createContext();
const history = createHashHistory();

const TopicMapContextProvider = ({
  referenceSystem = MappingConstants.crs3857,
  referenceSystemDefinition = projectionData[3857].def,
  mapEPSGCode = "3857",
  maskingPolygon,
  maskingPolygon25832 = "POLYGON((292872.70820260537 5734812.567828996,454766.33411074313 5734812.567828996,454766.33411074313 5622450.136249692,292872.70820260537 5622450.136249692,292872.70820260537 5734812.567828996))",
  maskingPolygon3857 = "POLYGON((668010.063156992 6750719.23021889,928912.612468322 6757273.20343972,930494.610325512 6577553.43685138,675236.835570551 6571367.64964125,668010.063156992 6750719.23021889))",
  children,
  featureCollectionEnabled = true,
  lightBoxEnabled = true,
  responsiveContextEnabled = true,
  stylingContextEnabled = true,
  uiContextEnabled = true,
  offlineLayerCacheContextEnabled = true,
  getFeatureStyler,
  additionalStylingInfo,
  featureTooltipFunction,
  getColorFromProperties,
  alwaysShowAllFeatures = false,
  clusteringEnabled = true,
  clusteringOptions,
  getSymbolSVG,
  featureItemsURL,
  createFeatureItemsDictionary,
  items,
  convertItemToFeature,
  convertItemToFeatureProgressCallback,
  featureCollectionName,
  itemFilterFunction,
  filterFunction,
  filterState,
  classKeyFunction,
  additionalLayerConfiguration,
  appMode,
  baseLayerConf,
  appKey = "TopicMapBaseLibrary",
  persistenceSettings = {
    ui: ["appMenuVisible", "appMenuActiveMenuSection", "collapsedInfoBox"],
    featureCollection: ["filterState", "filterMode", "clusteringEnabled"],
    responsive: [],
    styling: [
      "activeAdditionalLayerKeys",
      "namedMapStyle",
      "selectedBackground",
      "markerSymbolSize",
    ],
    offlinelayers: ["vectorLayerOfflineEnabled"],
  },
  titleFactory = ({ featureCollectionContext }) => {
    let themenstadtplanDesc = "?";
    if (
      featureCollectionContext?.filteredItems?.length ===
      featureCollectionContext?.items?.length
    ) {
      themenstadtplanDesc = undefined;
    }
    if (featureCollectionContext?.filteredItems?.length === 0) {
      return (
        <div>
          <b>Keine Objekte gefunden!</b> Bitte überprüfen Sie Ihre
          Filtereinstellungen.
        </div>
      );
    }
    if (themenstadtplanDesc) {
      return (
        <div>
          <b>gefilterte Objektdarstellung</b>
        </div>
      );
    } else {
      return undefined;
    }
  },
  backgroundConfigurations,
  backgroundModes,
  infoBoxPixelWidth,
  searchBoxPixelWidth,
  offlineCacheConfig,
  initialLoadingDelay,
  nextFeature,
  prevFeature,
  deriveSecondarySelection,
}) => {
  const [state, dispatch] = useImmer({
    ...defaultState,
    history,
    appKey,
    titleFactory,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon:
      maskingPolygon ||
      (referenceSystem === MappingConstants.crs25832
        ? maskingPolygon25832
        : maskingPolygon3857),
    mapEPSGCode,
    appMode,
  });
  const realRoutedMapRef = useRef(null);

  const contextKey = "topicmap";
  const set = (prop, noTest) => {
    return (x) => {
      dispatch((state) => {
        if (
          noTest === true ||
          JSON.stringify(state[prop]) !== JSON.stringify(x)
        ) {
          if (persistenceSettings[contextKey]?.includes(prop)) {
            localforage.setItem(
              "@" + appKey + "." + contextKey + "." + prop,
              x
            );
          }
          state[prop] = x;
        }
      });
    };
  };

  const convenienceFunctions = {
    setBoundingBox: set("boundingBox"),
    setLocation: set("location"),
    setRoutedMapRef: set("routedMapRef", true),
    setAppMode: set("appMode", true),
  };

  const fitBBox = (bbox, refDefOfBBox) => {
    dispatch((state) => {
      if (state?.routedMapRef?.leafletMap?.leafletElement?.fitBounds && bbox) {
        state.routedMapRef.leafletMap.leafletElement.fitBounds(
          convertBBox2Bounds(bbox, refDefOfBBox || referenceSystemDefinition)
        );
      }
    });
  };

  return (
    <StateContext.Provider value={{ ...state, realRoutedMapRef }}>
      <DispatchContext.Provider
        value={{
          dispatch,
          ...convenienceFunctions,
          zoomToFeature: (feature) => {
            let zoomlevel;
            if (referenceSystem === MappingConstants.crs25832) {
              zoomlevel = 15;
            } else {
              zoomlevel = 18;
            }
            let refDef;
            if (feature.crs) {
              const code = feature?.crs?.properties?.name?.split("EPSG::")[1];
              refDef = projectionData[code].def;
            } else {
              refDef = referenceSystemDefinition;
            }

            if (state.routedMapRef !== undefined) {
              const type = getType(feature);
              if (type === "Point") {
                const pos = proj4(refDef, proj4.defs("EPSG:4326"), [
                  feature.geometry.coordinates[0],
                  feature.geometry.coordinates[1],
                ]);

                state.routedMapRef.leafletMap.leafletElement.setView(
                  [pos[1], pos[0]],
                  zoomlevel
                );
              } else {
                state.routedMapRef.leafletMap.leafletElement.fitBounds(
                  convertBBox2Bounds(envelope(feature).bbox, refDef)
                );
              }
            }
          },
          fitBBox,

          gotoHome: () => {
            if (state.routedMapRef !== undefined) {
              state.routedMapRef.leafletMap.leafletElement.setView(
                [
                  state.routedMapRef.props.fallbackPosition.lat,
                  state.routedMapRef.props.fallbackPosition.lng,
                ],
                state.routedMapRef.props.fallbackZoom
              );
            }
          },
        }}
      >
        <TopicMapStylingContextProvider
          enabled={stylingContextEnabled}
          additionalLayerConfiguration={additionalLayerConfiguration}
          baseLayerConf={baseLayerConf}
          backgroundConfigurations={backgroundConfigurations}
          backgroundModes={backgroundModes}
          appKey={appKey}
          persistenceSettings={persistenceSettings}
          additionalStylingInfo={additionalStylingInfo}
        >
          <FeatureCollectionContextProvider
            enabled={featureCollectionEnabled}
            getFeatureStyler={getFeatureStyler}
            getColorFromProperties={getColorFromProperties}
            alwaysShowAllFeatures={alwaysShowAllFeatures}
            clusteringEnabled={clusteringEnabled}
            clusteringOptions={clusteringOptions}
            getSymbolSVG={getSymbolSVG}
            itemsURL={featureItemsURL}
            createItemsDictionary={createFeatureItemsDictionary}
            items={items}
            convertItemToFeature={convertItemToFeature}
            convertItemToFeatureProgressCallback={
              convertItemToFeatureProgressCallback
            }
            featureCollectionName={featureCollectionName}
            itemFilterFunction={itemFilterFunction}
            filterFunction={filterFunction}
            filterState={filterState}
            classKeyFunction={classKeyFunction}
            appKey={appKey}
            persistenceSettings={persistenceSettings}
            featureTooltipFunction={featureTooltipFunction}
            appMode={appMode}
            nextFeature={nextFeature}
            prevFeature={prevFeature}
            deriveSecondarySelection={deriveSecondarySelection}
          >
            <ResponsiveTopicMapContextProvider
              enabled={responsiveContextEnabled}
              appKey={appKey}
              persistenceSettings={persistenceSettings}
              infoBoxPixelWidth={infoBoxPixelWidth}
              searchBoxPixelWidth={searchBoxPixelWidth}
            >
              <OfflineLayerCacheContextProvider
                enabled={offlineLayerCacheContextEnabled}
                appKey={appKey}
                persistenceSettings={persistenceSettings}
                offlineCacheConfig={offlineCacheConfig}
                initialLoadingDelay={initialLoadingDelay}
              >
                <UIContextProvider
                  enabled={uiContextEnabled}
                  appKey={appKey}
                  persistenceSettings={persistenceSettings}
                >
                  <LightBoxContextProvider
                    enabled={lightBoxEnabled}
                    appKey={appKey}
                    persistenceSettings={persistenceSettings}
                  >
                    {children}
                  </LightBoxContextProvider>
                </UIContextProvider>
              </OfflineLayerCacheContextProvider>
            </ResponsiveTopicMapContextProvider>
          </FeatureCollectionContextProvider>
        </TopicMapStylingContextProvider>
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
};

export default TopicMapContextProvider;

export {
  TopicMapContextProvider,
  StateContext as TopicMapContext,
  DispatchContext as TopicMapDispatchContext,
};
