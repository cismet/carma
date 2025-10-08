import { useContext, useEffect, useState } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import Modal from "./Modal";
import SetStatusDialog from "./SetStatusDialog";
import {
  createVectorFeature,
  FeatureInfobox,
  SandboxedEvalProvider,
  TopicMapSelectionContent,
  useSelectionTopicMap,
  getInfoBoxControlObjectFromMappingAndVectorFeature,
} from "@carma-appframeworks/portals";
import {
  defaultTypeInference,
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import CismapLayer from "react-cismap/CismapLayer";
import versionData from "../version.json";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useTreeStyle } from "./hooks/useTreeStyle";
import {
  createInfoBoxControlObject,
  enrichFeatureCollection,
} from "./helper/treeHelper";

const baseUrl = window.location.origin + window.location.pathname;

const TZBaumbewirtschaftung = () => {
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);
  const [selectedFeature, setSelectedFeature] = useState();
  const [featureCollection, setFeatureCollection] = useState();
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  useSelectionTopicMap();
  const { appKey } = useContext(TopicMapContext);
  const dataUrl =
    import.meta.env.VITE_WUPP_ASSET_BASEURL +
    "/data/4326/tz_baumbewirtschaftung.json";
  useEffect(() => {
    (async () => {
      const fc = await md5FetchJSON(appKey, dataUrl);

      const enriched = enrichFeatureCollection(fc); // Helper function
      setFeatureCollection(enriched);
    })();
  }, []);

  const treeStyle = useTreeStyle(featureCollection, markerSymbolSize);

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <SandboxedEvalProvider>
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
            <div style={{ marginTop: "4px" }}>
              <LibFuzzySearch
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder="Stadtteil | Adresse | POI"
                priorityTypes={[
                  "pois",
                  "poisAlternativeNames",
                  "bezirke",
                  "quartiere",
                  "adressen",
                  "streets",
                  "schulen",
                  "kitas",
                ]}
                typeInference={defaultTypeInference}
              />
            </div>
          </Control>
          <TopicMapComponent
            modalMenu={<Menu />}
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            applicationMenuTooltipString="Einstellungen | Kompaktanleitung"
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            infoBox={
              <FeatureInfobox
                selectedFeature={selectedFeature}
                versionData={versionData}
                bigMobileIconsInsteadOfCollapsing={true}
                Modal={Modal}
              />
            }
            contactButtonEnabled={false}
          >
            <TopicMapSelectionContent />

            {featureCollection && (
              <CismapLayer
                key={`tree-layer-${markerSymbolSize}`}
                pane="additionalLayers0"
                selectionEnabled={true}
                manualSelectionManagement={false}
                logMapLibreErrors={true}
                onSelectionChanged={(e) => {
                  (async () => {
                    const feature = e.hit;
                    if (feature) {
                      // if it is confuigured in a string array (comes form vectorlayer metadata)
                      // const infoBoxControlObject =
                      //   await getInfoBoxControlObjectFromMappingAndVectorFeature(
                      //     {
                      //       mapping: infoBoxMapping,
                      //       selectedVectorFeature: hit,
                      //     }
                      //   );

                      // add infoBoxControlObject
                      feature.properties.info = createInfoBoxControlObject(
                        feature,
                        baseUrl,
                        setShowStatusDialog
                      );

                      setSelectedFeature(feature);
                    } else {
                      setSelectedFeature(undefined);
                    }
                  })();
                }}
                style={treeStyle}
                type="vector"
              />
            )}
          </TopicMapComponent>
        </ControlLayout>
      </SandboxedEvalProvider>
      {showStatusDialog && (
        <SetStatusDialog
          feature={selectedFeature}
          close={() => setShowStatusDialog(false)}
          onCancel={() => {
            console.log("Status dialog cancelled");
          }}
          onClose={(parameter) => {
            console.log("Status changed:", parameter);
            // Mock: Update feature status
            if (selectedFeature) {
              console.log(
                "Would update feature:",
                selectedFeature.id,
                "with:",
                parameter
              );
            }
          }}
        />
      )}
    </div>
  );
};

export default TZBaumbewirtschaftung;
