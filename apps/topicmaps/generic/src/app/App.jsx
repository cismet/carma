import { useEffect, useState } from "react";

import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";
import { pointOnFeature } from "@turf/point-on-feature";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import { getSimpleHelpForGenericTM } from "react-cismap/tools/genericTopicMapHelper";
import getGTMFeatureStyler, {
  getColorFromProperties,
} from "react-cismap/topicmaps/generic/GTMStyler";
import slugify from "slugify";
import Map from "./Map";
import Menu from "./components/Menu";
import { MappingConstants } from "react-cismap";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { gazDataConfig } from "../config/gazData";
import WMSCapabilities from "wms-capabilities";

import merge from "lodash/merge";
import defaultConfig from "../assets/gtmDefaulConfig.json";
import { getAllLeafLayers } from "@carma-mapping/layers";
import { extractCarmaConfig, extractInformation } from "@carma-commons/utils";
import md5 from "md5";
import {
  createMetaHelpBlock,
  getConfig,
  getMarkdown,
  gtmComponentResolver,
} from "./helper";

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;

const parser = new WMSCapabilities();

const errorConfig = {
  tm: {
    fullScreenControl: false,
    locatorControl: false,
    zoomControls: false,
    noFeatureCollection: true,
    gazetteerSearchBox: false,
    applicationMenu: false,
  },
};

function App({ name }) {
  // --- Fault log state and helper ---
  const [faultLog, setFaultLog] = useState([]);
  const log = (msg, attachment) => {
    if (attachment) {
      console.log(msg, attachment);
      setFaultLog((prev) => [...prev, msg + attachment]);
    } else {
      console.log(msg);
      setFaultLog((prev) => [...prev, msg]);
    }
  };

  const configPath = import.meta.env.VITE_GTM_CONFIG_PATH || "/dev/"; //uses the dev folder in public to debug local stuff when no ENV is set
  const configServer = import.meta.env.VITE_GTM_CONFIGSERVER || ""; //uses the local server when no ENV is set

  const [initialized, setInitialized] = useState(false);
  const [config, setConfig] = useState({});
  const [layerInformation, setLayerInformation] = useState({});
  const [layerHelpBlocks, setLayerHelpBlocks] = useState([]);
  const [featureGazData, setFeatureGazData] = useState([]);
  const [faultyConfig, setFaultyConfig] = useState(false);
  const [projectConfigFound, setProjectConfigFound] = useState(true);
  useEffect(() => {
    log(
      `... where i get my config from: ${JSON.stringify({
        configServer,
        configPath,
      })}`
    );
  }, []);

  useEffect(() => {
    (async () => {
      const path = configPath;
      const server = configServer;
      const slugName = slugify(name, { lower: true });
      // Start with a deep clone of the default config
      let config = JSON.parse(JSON.stringify(defaultConfig));
      // Fetch project-specific config
      let projectConfig = await getConfig(
        slugName,
        "config",
        server,
        path,
        log
      );
      log(`... projectConfig: ${projectConfig}`);
      let found = true;
      if (!projectConfig) {
        found = false;
        projectConfig = errorConfig;
      }
      setProjectConfigFound(found);

      // Normalize vectorLayers: if only 'layer' is present, extract 'capabilitiesLayer' and 'capabilities'
      if (Array.isArray(projectConfig?.tm?.vectorLayers)) {
        projectConfig.tm.vectorLayers.forEach((layerObj) => {
          if (
            layerObj.layer &&
            (!layerObj.capabilities || !layerObj.capabilitiesLayer)
          ) {
            const atIdx = layerObj.layer.indexOf("@");
            if (atIdx > 0) {
              const capLayer = layerObj.layer.substring(0, atIdx);
              const caps = layerObj.layer.substring(atIdx + 1);
              if (!layerObj.capabilitiesLayer)
                layerObj.capabilitiesLayer = capLayer;
              if (!layerObj.capabilities) layerObj.capabilities = caps;
            }
          }
        });
      }

      // If a layer has no id, set it to md5 hash of the full config string
      if (Array.isArray(projectConfig?.tm?.vectorLayers)) {
        const configHash = md5(JSON.stringify(projectConfig));
        projectConfig.tm.vectorLayers.forEach((layerObj) => {
          if (!layerObj.id) {
            layerObj.id = configHash;
          }
        });
        // Backwards compatibility: apply tm.infoboxMapping, layer, capabilities, capabilitiesLayer to every vectorLayer if defined and not already set
        if (Array.isArray(projectConfig.tm.infoboxMapping)) {
          projectConfig.tm.vectorLayers.forEach((layerObj) => {
            if (!layerObj.infoboxMapping) {
              layerObj.infoboxMapping = projectConfig.tm.infoboxMapping;
            }
          });
        }
        if (projectConfig.tm.layer) {
          projectConfig.tm.vectorLayers.forEach((layerObj) => {
            if (!layerObj.layer) {
              layerObj.layer = projectConfig.tm.layer;
            }
          });
        }
        if (projectConfig.tm.capabilities) {
          projectConfig.tm.vectorLayers.forEach((layerObj) => {
            if (!layerObj.capabilities) {
              layerObj.capabilities = projectConfig.tm.capabilities;
            }
          });
        }
        if (projectConfig.tm.capabilitiesLayer) {
          projectConfig.tm.vectorLayers.forEach((layerObj) => {
            if (!layerObj.capabilitiesLayer) {
              layerObj.capabilitiesLayer = projectConfig.tm.capabilitiesLayer;
            }
          });
        }
      }

      // Per-layer capabilities: build a layerInformation object keyed by capabilitiesLayer
      const layerInfoObj = {};
      const vectorLayers = projectConfig.tm?.vectorLayers;
      if (!vectorLayers || !Array.isArray(vectorLayers)) {
        log("No vectorLayers found in projectConfig.tm.vectorLayers");
      } else {
        // Fast-path: Add minimal info for layers with style property
        for (const layer of vectorLayers) {
          if (layer.style) {
            layerInfoObj[layer.capabilitiesLayer] = {
              ...(layer.id ? { id: layer.id } : {}),
              ...(layer.style ? { style: layer.style } : {}),
              ...(layer.infoboxMapping
                ? { infoboxMapping: layer.infoboxMapping }
                : {}),
              ...(layer.opacity ? { opacity: layer.opacity } : {}),
              // Add any other config-provided info you want to be immediately available
            };
          }
        }
        setLayerInformation(layerInfoObj); // Initial render with minimal info
        // Async enrichment: fetch capabilities and merge
        for (const layer of vectorLayers) {
          if (layer.capabilities && layer.capabilitiesLayer) {
            (async () => {
              try {
                const capabilitiesText = await fetch(layer.capabilities).then(
                  (response) => response.text()
                );
                const fetchedCapabilities = parser.toJSON(capabilitiesText);
                const allLayers = getAllLeafLayers(fetchedCapabilities);
                const targetLayer = allLayers.find(
                  (l) => l.Name === layer.capabilitiesLayer
                );
                if (targetLayer) {
                  const extractedCarmaConf = extractCarmaConfig(
                    targetLayer.KeywordList
                  );
                  const links = [
                    {
                      link: layer.capabilities,
                      label:
                        "Inhaltsverzeichnis des Kartendienstes (WMS Capabilities)",
                    },
                    extractedCarmaConf?.opendata
                      ? {
                          link: extractedCarmaConf?.opendata,
                          label: "Datenquelle im Open-Data-Portal Wuppertal",
                        }
                      : undefined,
                  ].filter((l) => l !== undefined);
                  const extractedInformation = await extractInformation(
                    targetLayer
                  );
                  setLayerInformation((prev) => ({
                    ...prev,
                    [layer.capabilitiesLayer]: {
                      ...prev[layer.capabilitiesLayer], // Preserve fast-path info
                      ...extractedInformation,
                      links,
                      carmaConf: extractedCarmaConf,
                      ...(layer.id ? { id: layer.id } : {}),
                      ...(layer.name ? { name: layer.name } : {}), // Add name property from config
                      ...(typeof layer.addMetaInfoToHelp !== "undefined"
                        ? { addMetaInfoToHelp: layer.addMetaInfoToHelp }
                        : {}), // Add addMetaInfoToHelp property from config
                      doneWithFetchingAdditionalInfo: true,
                    },
                  }));
                }
              } catch (e) {
                log(
                  `Failed to fetch capabilities for ${layer.capabilitiesLayer}: ${e}`
                );
              }
            })();
          }
        }
      }

      if (projectConfig?.tm?.noFeatureCollection === true) {
        config.tm.applicationMenuSkipFilterTitleSettings = true;
        config.tm.applicationMenuSkipClusteringSettings = true;
        config.tm.applicationMenuSkipSymbolsizeSetting = true;
      }
      // Deep-merge project config into default config
      merge(config, projectConfig);

      // Normalize vectorLayers: if only 'layer' is present, extract 'capabilitiesLayer' and 'capabilities'
      if (Array.isArray(config?.tm?.vectorLayers)) {
        config.tm.vectorLayers.forEach((layerObj) => {
          if (
            layerObj.layer &&
            (!layerObj.capabilities || !layerObj.capabilitiesLayer)
          ) {
            const atIdx = layerObj.layer.indexOf("@");
            if (atIdx > 0) {
              const capLayer = layerObj.layer.substring(0, atIdx);
              const caps = layerObj.layer.substring(atIdx + 1);
              if (!layerObj.capabilitiesLayer)
                layerObj.capabilitiesLayer = capLayer;
              if (!layerObj.capabilities) layerObj.capabilities = caps;
            }
          }
        });
      }

      console.log(`... mergedConfig:`, config);

      if (config.tm.noFeatureCollection !== true) {
        config.featureDefaultProperties = await getConfig(
          slugName,
          "featureDefaultProperties",
          server,
          path,
          log
        );
        config.featureDefaults = await getConfig(
          slugName,
          "featureDefaults",
          server,
          path,

          log
        );
        config.infoBoxConfig = await getConfig(
          slugName,
          "infoBoxConfig",
          server,
          path,
          log
        );
        config.features = await getConfig(
          slugName,
          "features",
          server,
          path,
          log
        );
        const fc = [];
        let i = 0;
        for (const f of config.features) {
          const ef = { ...config.featureDefaults, ...f };
          ef.id = i;
          i++;
          ef.properties = {
            ...config.featureDefaultProperties,
            ...ef.properties,
          };
          fc.push(ef);
        }
        config.features = fc;
      }

      config.simpleHelpMd = await getMarkdown(
        slugName,
        "simpleHelp",
        server,
        path
      );
      config.simpleHelpObject = await getConfig(
        slugName,
        "simpleHelp",
        server,
        path,
        log
      );

      if (config?.simpleHelpObject?.type === "REACTCOMP") {
        const x = gtmComponentResolver(config.simpleHelpObject.content, {});
        console.log("xxx x", x);
        config.simpleHelpObject.content = x;
      }

      console.log("... simpleHelpMd", config.simpleHelpMd);

      if (config.simpleHelpMd !== undefined && config.simpleHelpMd !== "") {
        config.simpleHelpObject = {
          type: "MARKDOWN",
          content: config.simpleHelpMd,
        };
      }

      console.log("... simpleHelpObject", config.simpleHelpObject);

      if (config.infoBoxConfig !== undefined) {
        config.info = config.infoBoxConfig;
        config.info.city = config.city;
      }

      //Backwards conmpatibility
      config.tm.gazetteerSearchPlaceholder =
        config.tm.gazetteerSearchBoxPlaceholdertext;

      const featureGaz = [];

      if (
        config?.tm?.addGazetteerElementsPerFeature === true &&
        config.tm.noFeatureCollection !== true
      ) {
        for (const f of config.features) {
          const pof = pointOnFeature(f);
          const x = pof.geometry.coordinates[0];
          const y = pof.geometry.coordinates[1];

          const gazEntry = {
            sorter: 0,
            string: f.text,
            glyph: "star",
            x,
            y,
            more: {
              zl: 18,
              pid: f.id,
            },
            type: "genericFeature",
          };
          featureGaz.push(gazEntry);
        }
      }
      // setGazData([...featureGazData, ...gazData]);

      setFeatureGazData(featureGaz);

      setConfig(config);

      setInitialized(true);
    })();
  }, [name]);

  useEffect(() => {
    if (config?.tm?.vectorLayers) {
      //check if every layer which has addMetaInfoToHelp turned on
      // is ready (shown in doneWithFetchingAdditionalInfo)
      let readyForProduction = false;
      config.tm.vectorLayers.forEach((layer) => {
        const info = layerInformation[layer.capabilitiesLayer];
        if (
          (info &&
            info.addMetaInfoToHelp === true &&
            info.doneWithFetchingAdditionalInfo === true) ||
          info.addMetaInfoToHelp === false
        ) {
          readyForProduction = true;
        } else {
          readyForProduction = false;
        }
      });

      if (readyForProduction === true) {
        const layerBlocks = [];
        config.tm.vectorLayers.forEach((layer) => {
          const info = layerInformation[layer.capabilitiesLayer];

          if (
            info &&
            info.doneWithFetchingAdditionalInfo &&
            info.addMetaInfoToHelp
          ) {
            const helpBlock = createMetaHelpBlock(layer.name, layer.name, info);
            layerBlocks.push(helpBlock);
          }
        });
        setLayerHelpBlocks(layerBlocks);
      }
    }
  }, [config?.tm?.vectorLayers, layerInformation]);

  if (initialized === true) {
    const refConfig = {};
    if (config?.tm?.srs || 3857 === 3857) {
      //this is default, so no config is needed
    } else if (config?.tm?.srs === 25832) {
      refConfig.referenceSystemDefinition = MappingConstants.proj4crs25832def;
      refConfig.mapEPSGCode = "25832";
      refConfig.referenceSystem = MappingConstants.crs25832;
    }

    const baseLayerConf = JSON.parse(JSON.stringify(defaultLayerConf));
    if (config?.tm?.namedLayers) {
      for (const layerkey of Object.keys(config?.tm?.namedLayers)) {
        baseLayerConf.namedLayers[layerkey] = config?.tm?.namedLayers[layerkey];
      }
    }

    const cpConfig = {};
    if (config.noFeatureCollection !== true) {
      cpConfig.featureTooltipFunction = (feature) =>
        feature?.properties?.hoverString || feature?.text;

      cpConfig.getFeatureStyler = getGTMFeatureStyler;
      cpConfig.getColorFromProperties = getColorFromProperties;
      cpConfig.clusteringEnabled = config?.tm?.clusteringEnabled;
      cpConfig.clusteringOptions = {
        iconCreateFunction: getClusterIconCreatorFunction(
          30,
          (props) => props.color
        ),
        ...config.tm.clusterOptions,
      };
      cpConfig.items = config.features;
    }

    return (
      <>
        {!projectConfigFound && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(255,255,255,0.4)",
              zIndex: 2000,
              color: "#222",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
              padding: 32,
            }}
          >
            <div
              style={{
                maxWidth: 800,
                textAlign: "left",
                background: "#f8f8f8",
                borderRadius: 8,
                padding: 16,
                boxShadow: "0 2px 6px #0001",
                fontSize: 14,
              }}
            >
              <h2 style={{ marginBottom: 24 }}>
                Probleme beim Laden der Konfigurationsdateien
              </h2>
              <pre>{faultLog.join("\n")}</pre>
            </div>
          </div>
        )}
        <GazDataProvider config={gazDataConfig}>
          <SelectionProvider>
            <TopicMapContextProvider
              {...refConfig}
              {...cpConfig}
              baseLayerConf={baseLayerConf}
              backgroundConfigurations={config?.tm?.backgroundConfigurations}
              backgroundModes={config?.tm?.backgroundModes}
              appKey="GenericTopicMap"
            >
              <Map
                config={config}
                featureGazData={featureGazData || []}
                layerInformation={layerInformation}
                layerHelpBlocks={layerHelpBlocks}
              />
            </TopicMapContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </>
    );
  }
}

export default App;
