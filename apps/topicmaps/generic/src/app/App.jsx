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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { layer } from "@fortawesome/fontawesome-svg-core";

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

function getUrlSearchParamsForHash(_hash) {
  // Extract the full geoportalLink from the hash/query string, even if it contains & and =
  try {
    const hash = _hash || window.location.hash || "";
    let query = "";
    const hashParts = hash.split("?");
    if (hashParts.length > 1) {
      query = hashParts.slice(1).join("?");
    }

    const params = new URLSearchParams(query);
    return params;
  } catch (e) {
    return null;
  }
}

function getGeoportalLinkFromUrl() {
  // Extract the full geoportalLink from the hash/query string, even if it contains & and =
  try {
    const hash = window.location.hash || "";
    // Look for geoportalLink= and grab everything after it
    const match = hash.match(/geoportalLink=([^&]*)/);
    if (match && match[1]) {
      // decodeURIComponent in case it's encoded
      return decodeURIComponent(match[1]);
    }
    return null;
  } catch (e) {
    return null;
  }
}

function App({ name }) {
  const defaultStarterConfig = `{
    "tm": {
      "noFeatureCollection": true,
      "vectorLayers": []
    }
  }`;
  const [showCopied, setShowCopied] = useState(false);
  const [geoportalConfig, setGeoportalConfig] = useState();
  const [starterConfig, setStarterConfig] = useState(defaultStarterConfig);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [geoportalLinkInput, setGeoportalLinkInput] = useState("");

  // Listen for URL changes and update geoportalLink accordingly
  useEffect(() => {
    const onUrlChange = () => {
      if (!window.location.hash.includes("geoportalLink=")) {
        return;
      } else {
        const geoportalLink = window.location.hash.split("geoportalLink=")[1];

        let config;
        if (geoportalLink.startsWith("http")) {
          const params = new URLSearchParams(
            getUrlSearchParamsForHash(geoportalLink)
          );
          config = params.get("config");
          const hash = window.location.hash;
          const newHash = hash.replace(geoportalLink, config);
          window.location.replace(
            window.location.pathname + window.location.search + newHash
          );
        } else {
          config = geoportalLink;
        }

        setGeoportalConfig(config);
      }
    };
    window.addEventListener("popstate", onUrlChange);
    window.addEventListener("hashchange", onUrlChange);
    window.addEventListener("urlchange", onUrlChange);
    onUrlChange();
    return () => {
      window.removeEventListener("popstate", onUrlChange);
      window.removeEventListener("hashchange", onUrlChange);
      window.removeEventListener("urlchange", onUrlChange);
    };
  }, []);

  // Effect: If geoportalLink contains a config param, fetch config and build starterConfig
  useEffect(() => {
    // need to extract the config from the hashGeoportalLink

    try {
      const fetchUrl = `https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/${geoportalConfig}`;
      fetch(fetchUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || !Array.isArray(data.layers)) return;
          // Always output legacy config: vectorLayers
          const vectorLayers = data.layers.map((layer) => {
            let layerType =
              layer.layerType ||
              layer.other?.layerType ||
              (layer.ceepr && layer.ceepr.layerType);
            const layerObj = {
              name: layer.title,
              layer:
                (layer.other?.layerName || "") +
                "@" +
                (layer.other?.capabilitiesUrl || ""),
              addMetaInfoToHelp: true,
              ...(layerType ? { layerType } : {}),
            };
            const styleVal = layer.conf?.vectorStyle;
            if (styleVal && styleVal !== "") {
              layerObj.style = styleVal;
            }
            // Add url and layers for wmts/wms
            if (layerType === "wmts") {
              if (layer.props && layer.props.url) {
                layerObj.url = layer.props.url;
              }
              if (layer.other?.layerName) {
                layerObj.layers = layer.other.layerName;
              }
            } else if (layerType === "wms") {
              if (layer.service && layer.service.url) {
                layerObj.url = layer.service.url;
              }
              if (layer.other?.layerName) {
                layerObj.layers = layer.other.layerName;
              }
            }
            layerObj.opacity = layer.opacity;

            return layerObj;
          });
          setStarterConfig(
            JSON.stringify(
              {
                tm: {
                  noFeatureCollection: true,
                  vectorLayers,
                },
              },
              null,
              2
            )
          );
        });
    } catch (e) {
      setStarterConfig(defaultStarterConfig);
    }
  }, [geoportalConfig]);
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
  const slugName = slugify(name, { lower: true });

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
      log(`... projectConfig:`, projectConfig);
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
      // Use tm.layers if present, otherwise fallback to tm.vectorLayers (backward compatibility)
      // Declare vectorLayers ONCE after projectConfig is set
      const vectorLayers = Array.isArray(projectConfig?.tm?.vectorLayers)
        ? projectConfig.tm.vectorLayers
        : [];
      vectorLayers.forEach((layerObj) => {
        if (!layerObj.id) {
          if (layerObj.name) {
            layerObj.id = slugify(layerObj.name);
          } else {
            layerObj.id = md5(JSON.stringify(layerObj));
          }
        }
      });
      // Backwards compatibility: apply tm.infoboxMapping, layer, capabilities, capabilitiesLayer to every layer if defined and not already set
      if (Array.isArray(projectConfig.tm.infoboxMapping)) {
        vectorLayers.forEach((layerObj) => {
          if (!layerObj.infoboxMapping) {
            layerObj.infoboxMapping = projectConfig.tm.infoboxMapping;
          }
        });
      }
      if (projectConfig.tm.layer) {
        vectorLayers.forEach((layerObj) => {
          if (!layerObj.layer) {
            layerObj.layer = projectConfig.tm.layer;
          }
        });
      }
      if (projectConfig.tm.capabilities) {
        vectorLayers.forEach((layerObj) => {
          if (!layerObj.capabilities) {
            layerObj.capabilities = projectConfig.tm.capabilities;
          }
        });
      }
      if (projectConfig.tm.capabilitiesLayer) {
        vectorLayers.forEach((layerObj) => {
          if (!layerObj.capabilitiesLayer) {
            layerObj.capabilitiesLayer = projectConfig.tm.capabilitiesLayer;
          }
        });
      }

      // Per-layer capabilities: build a layerInformation object keyed by capabilitiesLayer
      const layerInfoObj = {};
      if (!vectorLayers.length) {
        log("No layers found in projectConfig.tm.vectorLayers");
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

      if (config?.tm?.windowtitle) {
        document.title = config.tm.windowtitle;
      }

      // --- Style Manipulation: Fetch style JSON if needed ---
      // Use a different variable name to avoid redeclaration
      const vectorLayersConfig = Array.isArray(config?.tm?.vectorLayers)
        ? config.tm.vectorLayers
        : [];
      if (vectorLayersConfig.length > 0) {
        const styleFetchPromises = vectorLayersConfig.map(async (layer) => {
          if (
            typeof layer.styleManipulation !== "undefined" &&
            layer.style &&
            typeof layer.style === "string" &&
            (layer.style.startsWith("http://") ||
              layer.style.startsWith("https://"))
          ) {
            try {
              const resp = await fetch(layer.style);
              if (!resp.ok)
                throw new Error(`Failed to fetch style: ${resp.status}`);
              const json = await resp.json();
              layer.style = json;
            } catch (e) {
              log(
                `Failed to fetch/parse style for layer ${
                  layer.name || layer.id
                }: ${e}`
              );
            }
          }
        });
        await Promise.all(styleFetchPromises);

        // --- Style Manipulation: Load manipulation function from JS file if needed ---
        function getStyleManipulationUrl(
          styleManipulation,
          configServer,
          configPath,
          slugName
        ) {
          if (
            typeof styleManipulation === "string" &&
            styleManipulation.startsWith("@")
          ) {
            const filename = styleManipulation.slice(1);
            const path = configPath.endsWith("/")
              ? configPath
              : configPath + "/";
            const server = configServer.endsWith("/")
              ? configServer.slice(0, -1)
              : configServer;
            // Insert slugName as a path component
            return `${server}${path}${slugName}/${filename}`;
          }
          return null;
        }
        async function loadStyleManipulation(
          layer,
          configServer,
          configPath,
          slugName
        ) {
          if (
            layer.styleManipulation &&
            typeof layer.styleManipulation === "string" &&
            layer.styleManipulation.startsWith("@")
          ) {
            const url = getStyleManipulationUrl(
              layer.styleManipulation,
              configServer,
              configPath,
              slugName
            );
            try {
              const code = await fetch(url).then((r) => r.text());
              // The JS file must define a function named styleManipulation
              const func = new Function(code + "; return styleManipulation;")();
              layer.styleManipulation = func;
            } catch (e) {
              log(
                `Failed to fetch/parse styleManipulation for layer ${
                  layer.name || layer.id
                }: ${e}`
              );
            }
          }
        }
        const manipulationPromises = config.tm.vectorLayers.map((layer) =>
          loadStyleManipulation(layer, configServer, configPath, slugName)
        );
        await Promise.all(manipulationPromises);
      }

      // Normalize layers: if only 'layer' is present, extract 'capabilitiesLayer' and 'capabilities'
      if (vectorLayers.length > 0) {
        vectorLayers.forEach((layerObj) => {
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
        config.simpleHelpObject.content = x;
      }

      console.log("... simpleHelpMd", config.simpleHelpMd);

      if (config.simpleHelpMd !== undefined && config.simpleHelpMd !== "") {
        config.simpleHelpObject = {
          type: "MARKDOWN",
          content: config.simpleHelpMd,
        };
      }

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
  }, [slugName, name]);

  useEffect(() => {
    const vectorLayers = Array.isArray(config?.tm?.vectorLayers)
      ? config.tm.vectorLayers
      : Array.isArray(config?.tm?.vectorLayers)
      ? config.tm.vectorLayers
      : [];
    if (vectorLayers.length > 0) {
      //check if every layer which has addMetaInfoToHelp turned on
      // is ready (shown in doneWithFetchingAdditionalInfo)
      let readyForProduction = false;
      vectorLayers.forEach((layer) => {
        const info = layerInformation[layer.capabilitiesLayer];
        if (
          (info &&
            info.addMetaInfoToHelp === true &&
            info.doneWithFetchingAdditionalInfo === true) ||
          (info && info.addMetaInfoToHelp === false)
        ) {
          readyForProduction = true;
        } else {
          readyForProduction = false;
        }
      });

      if (readyForProduction === true) {
        const layerBlocks = [];
        vectorLayers.forEach((layer) => {
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
  }, [config?.tm?.vectorLayers, config?.tm?.vectorLayers, layerInformation]);

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
                minWidth: 340,
                width: "auto",
                height: "auto",
                maxHeight: "80vh",
                textAlign: "left",
                background: "#f8f8f8",
                borderRadius: 8,
                padding: 16,
                boxShadow: "0 2px 6px #0001",
                fontSize: 14,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <>
                <div style={{ position: "relative" }}>
                  <h2 style={{ marginBottom: 24, background: "none" }}>
                    {getGeoportalLinkFromUrl()
                      ? `Starter for ${
                          slugName.charAt(0).toUpperCase() + slugName.slice(1)
                        }`
                      : "Problems loading configuration files"}
                  </h2>
                </div>
                <div
                  style={{
                    background: "rgba(240,240,240,0.95)",
                    color: "#444",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    padding: 10,
                    marginBottom: 12,
                    fontSize: 13,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    maxHeight: "30vh",
                    overflowY: "auto",
                  }}
                >
                  {faultLog.join("\n")}
                </div>
                {!getGeoportalLinkFromUrl() && (
                  <div style={{ marginBottom: 20 }}>
                    <button
                      onClick={() => setShowLinkInput(true)}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: "bold",
                      }}
                    >
                      <FontAwesomeIcon
                        icon="share-alt"
                        style={{ marginRight: 8 }}
                      />{" "}
                      I have a geoportal share link
                    </button>

                    {showLinkInput && (
                      <div
                        style={{
                          marginTop: 16,
                          padding: 16,
                          backgroundColor: "#f0f0f0",
                          borderRadius: 4,
                          border: "1px solid #ddd",
                        }}
                      >
                        <div style={{ marginBottom: 10, fontWeight: "bold" }}>
                          Insert geoportal link:
                        </div>
                        <div style={{ display: "flex" }}>
                          <input
                            type="text"
                            value={geoportalLinkInput}
                            onChange={(e) =>
                              setGeoportalLinkInput(e.target.value)
                            }
                            placeholder="Geoportal Link"
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              fontSize: 14,
                              border: "1px solid #ccc",
                              borderRadius: 4,
                              marginRight: 8,
                            }}
                          />
                          <button
                            onClick={() => {
                              if (geoportalLinkInput) {
                                // Get the current URL
                                let currentUrl = window.location.href;

                                // Remove any existing geoportalLink parameter
                                if (currentUrl.includes("geoportalLink=")) {
                                  // Simple string replacement to remove the parameter
                                  currentUrl = currentUrl.replace(
                                    /[&?]geoportalLink=[^&]*(&|$)/,
                                    function (match, p1) {
                                      return p1 === "&" ? "&" : "";
                                    }
                                  );
                                }

                                // Add the separator
                                const separator = currentUrl.includes("?")
                                  ? "&"
                                  : "?";

                                // Add the geoportalLink parameter
                                const newUrl = `${currentUrl}${separator}geoportalLink=${geoportalLinkInput}`;

                                // Reset the input field
                                setGeoportalLinkInput("");

                                // Close the input section
                                setShowLinkInput(false);

                                // Navigate to the new URL
                                window.location.href = newUrl;
                              }
                            }}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#28a745",
                              color: "white",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => setShowLinkInput(false)}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#6c757d",
                              color: "white",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 14,
                              marginLeft: 8,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {getGeoportalLinkFromUrl() && (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      we will add a minimal config.json for the developer to
                      start
                    </div>
                    <pre style={{ fontWeight: "bold", marginBottom: 8 }}>
                      config.json
                      {(() => {
                        const geoportalLink = getGeoportalLinkFromUrl();
                        if (
                          geoportalLink &&
                          !geoportalLink.startsWith("http") &&
                          geoportalConfig
                        ) {
                          const fetchUrl = `https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/${geoportalConfig}`;
                          return (
                            <span>
                              {" "}
                              (based on{" "}
                              <a
                                href={fetchUrl}
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open(fetchUrl, "_config");
                                }}
                                role="link"
                                tabIndex={0}
                                style={{
                                  wordBreak: "break-all",
                                  color: "#007bff",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                }}
                              >
                                {geoportalLink}
                              </a>
                              )
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </pre>

                    <div
                      style={{
                        position: "relative",
                        marginBottom: 16,
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        minHeight: 0,
                        height: "100%",
                      }}
                    >
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(starterConfig);
                          setShowCopied(true);
                          setTimeout(() => setShowCopied(false), 1200);
                        }}
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          zIndex: 10,
                          background: "#fff",
                          border: "1px solid #bbb",
                          borderRadius: 4,
                          padding: "4px 10px",
                          fontSize: 13,
                          cursor: "pointer",
                          boxShadow: "0 1px 4px #0001",
                          opacity: 0.85,
                        }}
                        title="Copy config.json to clipboard"
                      >
                        {showCopied ? (
                          <FontAwesomeIcon icon="check" />
                        ) : (
                          <FontAwesomeIcon icon="copy" />
                        )}
                      </button>
                      <div
                        style={{
                          height: "40vh",
                          maxHeight: "40vh",
                          overflowY: "auto",
                        }}
                      >
                        <CodeMirror
                          value={starterConfig}
                          height="100%"
                          extensions={[javascript({ jsx: true })]}
                          readOnly={true}
                          theme="light"
                          style={{
                            background: "rgba(220,220,220,0.85)",
                            borderRadius: 8,
                            border: "1px solid #888",
                            padding: 2,
                            fontWeight: "bold",
                            fontSize: 14,
                            margin: 0,
                            height: "100%",
                          }}
                          basicSetup={{ lineNumbers: false }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 20, marginBottom: 20 }}>
                      <button
                        onClick={() => setShowLinkInput(true)}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: "bold",
                        }}
                      >
                        <FontAwesomeIcon
                          icon="share-alt"
                          style={{ marginRight: 8 }}
                        />{" "}
                        I have a another geoportal share link
                      </button>

                      {showLinkInput && (
                        <div
                          style={{
                            marginTop: 16,
                            padding: 16,
                            backgroundColor: "#f0f0f0",
                            borderRadius: 4,
                            border: "1px solid #ddd",
                          }}
                        >
                          <div style={{ marginBottom: 10, fontWeight: "bold" }}>
                            Insert geoportal link:
                          </div>
                          <div style={{ display: "flex" }}>
                            <input
                              type="text"
                              value={geoportalLinkInput}
                              onChange={(e) =>
                                setGeoportalLinkInput(e.target.value)
                              }
                              placeholder="Geoportal Link"
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                fontSize: 14,
                                border: "1px solid #ccc",
                                borderRadius: 4,
                                marginRight: 8,
                              }}
                            />
                            <button
                              onClick={() => {
                                if (geoportalLinkInput) {
                                  // Get the current URL
                                  let currentUrl = window.location.href;

                                  // Remove any existing geoportalLink parameter
                                  if (currentUrl.includes("geoportalLink=")) {
                                    // Simple string replacement to remove the parameter
                                    currentUrl = currentUrl.replace(
                                      /[&?]geoportalLink=[^&]*(&|$)/,
                                      function (match, p1) {
                                        return p1 === "&" ? "&" : "";
                                      }
                                    );
                                  }

                                  // Add the separator
                                  const separator = currentUrl.includes("?")
                                    ? "&"
                                    : "?";

                                  // Add the geoportalLink parameter
                                  const newUrl = `${currentUrl}${separator}geoportalLink=${geoportalLinkInput}`;

                                  // Reset the input field
                                  setGeoportalLinkInput("");

                                  // Close the input section
                                  setShowLinkInput(false);

                                  // Navigate to the new URL
                                  window.location.href = newUrl;
                                }
                              }}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#28a745",
                                color: "white",
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: 14,
                              }}
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => setShowLinkInput(false)}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#6c757d",
                                color: "white",
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: 14,
                                marginLeft: 8,
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
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
                slugName={slugName}
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
