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
const host = "https://wupp-topicmaps-data.cismet.de";

async function getConfig(slugName, configType, server, path) {
  try {
    const u = server + path + slugName + "/" + configType + ".json";
    console.debug("try to read rconfig at ", u);
    const result = await fetch(u);
    const resultObject = await result.json();
    console.debug("config: loaded " + slugName + "/" + configType);
    return resultObject;
  } catch (ex) {
    console.debug(
      "no config found at ",
      server + path + slugName + "/" + configType + ".json"
    );
  }
}
async function getMarkdown(slugName, configType, server, path) {
  try {
    const u = server + path + slugName + "/" + configType + ".md";
    console.debug("try to read markdown at ", u);
    const result = await fetch(u);
    const resultObject = await result.text();
    console.debug("config: loaded " + slugName + "/" + configType);
    return resultObject;
  } catch (ex) {
    console.debug(
      "no markdown found at ",
      server + path + slugName + "/" + configType + ".md"
    );
  }
}

export const getGazData = async (
  topics = [
    "bpklimastandorte",
    "pois",
    "kitas",
    "bezirke",
    "quartiere",
    "adressen",
  ]
) => {
  const prefix = "GazDataForStories";
  const sources = {};

  sources.adressen = await md5FetchText(
    prefix,
    host + "/data/3857/adressen.json"
  );
  sources.bezirke = await md5FetchText(
    prefix,
    host + "/data/3857/bezirke.json"
  );
  sources.quartiere = await md5FetchText(
    prefix,
    host + "/data/3857/quartiere.json"
  );
  sources.pois = await md5FetchText(prefix, host + "/data/3857/pois.json");
  sources.kitas = await md5FetchText(prefix, host + "/data/3857/kitas.json");
  sources.bpklimastandorte = await md5FetchText(
    prefix,
    host + "/data/3857/bpklimastandorte.json"
  );

  const gazData = getGazDataForTopicIds(sources, topics);

  return gazData;
};
function App({
  name,
  // configPath = "/", //"/dev/",
  // configServer = "http://localhost:3000", //
  configPath = "/dev/",
  configServer = "https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config", //"https://raw.githubusercontent.com/cismet/wupp-generic-topic-map-config",
}) {
  const [initialized, setInitialized] = useState(false);
  const [config, setConfig] = useState({});
  const [gazData, setGazData] = useState([]);

  useEffect(() => {
    (async () => {
      const path = configPath;
      const server = configServer;
      const slugName = slugify(name, { lower: true });
      const config = await getConfig(slugName, "config", server, path);

      const featureDefaultProperties = await getConfig(
        slugName,
        "featureDefaultProperties",
        server,
        path
      );
      const featureDefaults = await getConfig(
        slugName,
        "featureDefaults",
        server,
        path
      );
      const helpTextBlocks = await getConfig(
        slugName,
        "helpTextBlocks",
        server,
        path
      );
      const simpleHelpMd = await await getMarkdown(
        slugName,
        "simpleHelp",
        server,
        path
      );
      const simpleHelp = await await getConfig(
        slugName,
        "simpleHelp",
        server,
        path
      );
      const infoBoxConfig = await getConfig(
        slugName,
        "infoBoxConfig",
        server,
        path
      );
      const features = await getConfig(slugName, "features", server, path);

      if (helpTextBlocks !== undefined) {
        config.helpTextblocks = helpTextBlocks;
      } else if (simpleHelpMd !== undefined) {
        config.simpleHelpObject = { type: "MARKDOWN", content: simpleHelpMd };
        config.helpTextblocks = getSimpleHelpForGenericTM(
          document.title,
          config.simpleHelpObject
        );
      } else {
        config.helpTextblocks = getSimpleHelpForGenericTM(
          document.title,
          simpleHelp
        );
      }
      if (features !== undefined) {
        config.features = features;
      }

      if (infoBoxConfig !== undefined) {
        config.info = infoBoxConfig;
      }

      const fc = [];
      let i = 0;
      for (const f of config.features) {
        const ef = { ...featureDefaults, ...f };
        ef.id = i;
        i++;
        ef.properties = { ...featureDefaultProperties, ...ef.properties };
        fc.push(ef);
      }
      config.features = fc;

      //Backwards conmpatibility
      config.tm.gazetteerSearchPlaceholder =
        config.tm.gazetteerSearchBoxPlaceholdertext;
      config.info.city = config.city;
      const gazData = await getGazData(config.tm.gazetteerTopicsList);
      const featureGazData = [];

      if (config?.tm?.addGazetteerElementsPerFeature === true) {
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
          featureGazData.push(gazEntry);
        }
      }
      setGazData([...featureGazData, ...gazData]);

      setConfig(config);

      setInitialized(true);
    })();
  }, [name]);

  if (initialized === true) {
    return (
      <TopicMapContextProvider
        appKey="GenericTopicMap.Playground"
        items={config.features}
        getFeatureStyler={getGTMFeatureStyler}
        getColorFromProperties={getColorFromProperties}
        clusteringEnabled={config?.tm?.clusteringEnabled}
        clusteringOptions={{
          iconCreateFunction: getClusterIconCreatorFunction(
            30,
            (props) => props.color
          ),
          ...config.tm.clusterOptions,
        }}
      >
        <Map config={config} gazData={gazData} />
      </TopicMapContextProvider>
    );
  }
}

export default App;
