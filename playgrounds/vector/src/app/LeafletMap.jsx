import { useContext, useEffect } from "react";

import "./App.css";
import { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";

import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import getGTMFeatureStyler from "react-cismap/topicmaps/generic/GTMStyler";
import { MappingConstants } from "react-cismap";
import queryString from "query-string";
import CrossTabCommunicationContextProvider from "react-cismap/contexts/CrossTabCommunicationContextProvider";
import CismapLayer from "react-cismap/CismapLayer";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import { Button } from "antd";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
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
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;

const baseLayerConf = { ...defaultLayerConf };

if (!baseLayerConf.namedLayers.amtlichRVR) {
  baseLayerConf.namedLayers.amtlichRVR = {
    type: "tiles",
    maxNativeZoom: 20,
    maxZoom: 22,
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    pane: "backgroundLayers",
  };
}

function App({ vectorStyles = [] }) {
  const [syncToken, setSyncToken] = useState(null);
  const [layers, setLayers] = useState("");
  useEffect(() => {
    const params = queryString.parse(window.location.hash);

    if (params.sync) {
      setSyncToken(params.sync);
    }
    if (params.layers) {
      setLayers(params.layers);
    }
  }, []);

  const backgroundConfigurations = {
    stadtplan: {
      layerkey: "wupp-plan-live",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Stadtplan",
    },
    stadtplanTiled: {
      layerkey: "amtlichRVR",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Karte (wie im Geoportal)",
    },
    lbk: {
      layerkey: "trueOrtho2020@75|OMT_Klokantech_basic@50",
      src: "/images/rain-hazard-map-bg/ortho.png",
      title: "Luftbildkarte",
    },
    basemap: {
      layerkey: "basemap_relief@10",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "basemap",
    },

    vector1: {
      layerkey: "OMT_Klokantech_basic@100",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Stadtplan",
    },
    vector2: {
      layerkey: "OMT_OSM_bright@100",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Stadtplan",
    },
  };
  const backgroundModes = [
    {
      title: "Stadtplan (RVR, tiled, wie im Geoportal)",
      mode: "default",
      layerKey: "stadtplanTiled",
    },
    {
      title: "Stadtplan (RVR, zum Vergleich)",
      mode: "default",
      layerKey: "stadtplan",
    },
    {
      title: "Vektorbasierter Layer (Basemap.de)",
      mode: "default",
      layerKey: "basemap",
    },
    {
      title: "Vektorbasierter Layer (OSM bright)",
      mode: "default",
      layerKey: "vector2",
    },

    { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
  ];
  console.log("vectorStyles", vectorStyles);

  const content = (
    <TopicMapContextProvider
      baseLayerConf={baseLayerConf}
      appKey="VectorPlaygroundWuppertal.TopicMap"
      backgroundConfigurations={backgroundConfigurations}
      backgroundModes={backgroundModes}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      titleFactory={(feature) => (
        <span style={{ margin: 2 }}>
          <Button style={{ margin: 2 }}>Layer</Button>
        </span>
      )}
    >
      <Map layers={layers} vectorStyles={vectorStyles} />
    </TopicMapContextProvider>
  );

  console.log("xxx sycn", syncToken);

  return syncToken ? (
    <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
      {content}
    </CrossTabCommunicationContextProvider>
  ) : (
    content
  );
}

export default App;

const Map = ({ layers, vectorStyles }) => {
  const [selectedFeature, setSelectedFeature] = useState(undefined);
  const { zoomToFeature, gotoHome } = useContext(TopicMapDispatchContext);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;

  let links = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displayZoomToFeature: true,
      zoomToFeature: () => {
        if (selectedFeature) {
          const f = JSON.stringify(selectedFeature, null, 2);
          const pf = JSON.parse(f);
          pf.crs = {
            type: "name",
            properties: {
              name: "urn:ogc:def:crs:EPSG::4326",
            },
          };
          console.log("xxx zoomToFeature", pf);

          zoomToFeature(pf);
        }
      },
    });
  }

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
  };

  return (
    <>
      <TopicMapComponent
        key={JSON.stringify(vectorStyles)}
        maxZoom={22}
        locatorControl={true}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        infoBox={
          selectedFeature && (
            <InfoBox
              pixelwidth={350}
              currentFeature={selectedFeature}
              hideNavigator={true}
              header="kjshd"
              headerColor="#ff0000"
              {...selectedFeature?.properties}
              noCurrentFeatureTitle="nix da"
              noCurrentFeatureContent="nix da"
              links={links}
              secondaryInfoBoxElements={[
                <InfoBoxFotoPreview
                  currentFeature={selectedFeature}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                />,
              ]}
            />
          )
        }
      >
        <TopicMapSelectionContent />
        {vectorStyles.map((style, index) => {
          return (
            <CismapLayer
              {...{
                type: "vector",
                style: style,
                pane: "additionalLayers" + index,
                opacity: 1,
                maxSelectionCount: 1,
                selectionEnabled: true,
                onSelectionChanged: (e) => {
                  const selectedFeature = e.hits[0];
                  console.log(
                    "xxxy selectedFeature",
                    JSON.stringify(selectedFeature, null, 2)
                  );

                  const p = selectedFeature.properties;

                  if (p.infobox_info) {
                    selectedFeature.properties = {
                      ...selectedFeature.properties,
                      ...JSON.parse(p.infobox_info),
                    };
                    setSelectedFeature(selectedFeature);
                  } else {
                    //if style has /poi/ in it, then it is a POI layer
                    if (style?.indexOf && style.indexOf("/poi/") > -1) {
                      console.log("xxxx style ", style);

                      const createInfoBoxInfo = (p) => {
                        const identifications = JSON.parse(p.identifications);
                        const mainlocationtype =
                          identifications[0].identification;
                        const info = {
                          title: p.geographicidentifier,
                          // additionalInfo: "bbb",
                          subtitle: p.strasse,
                          headerColor: p.schrift,
                          header: mainlocationtype,
                          url: p.url,
                          tel: p.telefon,
                        };
                        return info;
                      };

                      selectedFeature.properties = {
                        ...selectedFeature.properties,
                        ...createInfoBoxInfo(p),
                      };

                      setSelectedFeature(selectedFeature);
                    }
                    //if style has /sgk_hausnummer/ in it
                    else if (
                      style?.indexOf &&
                      style.indexOf("/sgk_hausnummern/") > -1
                    ) {
                      console.log("xxx------");

                      const conf = [
                        "title:p.name+' '+p.hnummer",
                        "header:'Adresse ('+p.adressart+')'",
                        "headerColor:({1: '#006622', 2: '#0000CC', 3: '#FF6600', 4: '#CC0000', 5: '#7030A0'}[p.adresstyp] || '#000000')",
                      ];
                      // // Create the function as a string
                      let functionString = `(function(p) {
                                          const info = {`;

                      conf.forEach((rule) => {
                        functionString += `${rule.trim()},\n`;
                      });

                      functionString += `
                                          };
                                          return info;
                    })`;
                      console.log("xxx functionString", functionString);

                      const tmpInfo = eval(functionString)(p);

                      console.log("xxx tmpInfo", tmpInfo);

                      selectedFeature.properties = {
                        ...selectedFeature.properties,
                        ...tmpInfo,
                      };

                      setSelectedFeature(selectedFeature);
                    }
                  }
                },
              }}
            />
          );
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
    </>
  );
};
