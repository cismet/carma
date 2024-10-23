import "bootstrap/dist/css/bootstrap.min.css";
import Color from "color";
import "leaflet/dist/leaflet.css";
import localforage from "localforage";
import { useEffect, useState } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { getInternetExplorerVersion } from "react-cismap/tools/browserHelper";
import { md5ActionFetchDAQ, md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
import "react-cismap/topicMaps.css";
import "./App.css";
import LoginForm from "./components/LoginForm";
import SteckbriefActionFactory from "./components/SteckbriefActionFactory";
import Title from "./components/TitleControl";
import Waiting from "./components/Waiting";
import PotenzialflaechenOnlineMap from "./PotenzialflaechenOnlineMap";
import convertItemToSimpleFeature from "./utils/convertItemToSimpleFeature";
import itemFilterFunction from "./utils/filterFunction";
import { offlineConfig } from "./offlineConfig";

const baseLayerConf = { ...defaultLayerConf };
baseLayerConf.namedLayers.cismetLight = {
  type: "vector",
  style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
  offlineAvailable: true,
  offlineDataStoreKey: "wuppBasemap",
};

const host = "https://wupp-topicmaps-data.cismet.de";
const selectionColor = new Color("#2664D8");
export const appKey = "Potenzialflaechen.Online.Wuppertal";
export const apiUrl = "https://potenzialflaechen-online-api.cismet.de";
export const dataDaqKey = "potenzialflaechen";
export const gazDaqKey = "potenzialflaechenGaz";
const getGazData = async (setStaticGazData) => {
  const prefix = "GazDataForStories";
  const sources = {};

  sources.adressen = await md5FetchText(prefix, host + "/data/3857/adressen.json");
  sources.bezirke = await md5FetchText(prefix, host + "/data/3857/bezirke.json");
  sources.quartiere = await md5FetchText(prefix, host + "/data/3857/quartiere.json");
  sources.pois = await md5FetchText(prefix, host + "/data/3857/pois.json");
  sources.kitas = await md5FetchText(prefix, host + "/data/3857/kitas.json");

  const gazData = getGazDataForTopicIds(sources, [
    "pois",
    "kitas",
    "bezirke",
    "quartiere",
    "adressen",
  ]);

  setStaticGazData(gazData);
};

function App() {
  const [staticGazData, setStaticGazData] = useState([]);
  const [dynGazData, setDynGazData] = useState([]);
  const [gazData, setGazData] = useState([]);

  useEffect(() => {
    setGazData([...(dynGazData || []), ...staticGazData]);
  }, [staticGazData, dynGazData]);

  useEffect(() => {
    getGazData(setStaticGazData);
    document.title = "Potenzialflächen-Online Wuppertal";
  }, []);

  const [jwt, _setJWT] = useState();
  const [loginInfo, setLoginInfo] = useState();

  const [waiting, setWaiting] = useState();

  const setJWT = (jwt) => {
    /*eslint no-useless-concat: "off"*/
    localforage.setItem("@" + appKey + "." + "auth" + "." + "jwt", jwt);
    _setJWT(jwt);
  };

  useEffect(() => {
    (async () => {
      const jwtInCache = await localforage.getItem("@" + appKey + "." + "auth" + "." + "jwt");
      if (jwtInCache) {
        setJWT(jwtInCache);
      } else {
        setJWT(undefined);
      }
    })();
  }, []);

  useEffect(() => {
    if (jwt) {
      md5ActionFetchDAQ(appKey, apiUrl, jwt, gazDaqKey)
        .then(
          (potenzialflaechenGazResult) => {
            setDynGazData(potenzialflaechenGazResult.data);
          },
          (problem) => {
            if (problem.status === 401) {
              setJWT(undefined);
              setLoginInfo({ color: "#F9D423", text: "Bitte melden Sie sich erneut an." });
              setTimeout(() => {
                setLoginInfo();
              }, 2500);
            }
            setDynGazData([]);
          }
        )
        .catch((e) => {
          console.log("xxx error ", e);
        });
    } else {
      setDynGazData([]);
    }
  }, [jwt]);

  let backgroundModes;
  if (getInternetExplorerVersion() === -1) {
    backgroundModes = [
      {
        title: "Stadtplan (grau)",
        mode: "default",
        layerKey: "stadtplan",
      },
      {
        title: "Stadtplan (Vektordaten light)",
        mode: "default",
        layerKey: "vector",
        offlineDataStoreKey: "wuppBasemap",
      },
      {
        title: "Amtliche Basiskarte",
        mode: "default",
        layerKey: "abkg",
      },
      { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
    ];
  } else {
    backgroundModes = [
      {
        title: "Stadtplan",
        mode: "default",
        layerKey: "stadtplan",
      },
      {
        title: "Amtliche Basiskarte",
        mode: "default",
        layerKey: "abkg",
      },
      { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
    ];
  }
  const backgroundConfigurations = {
    lbk: {
      layerkey: "rvrGrundriss@70|trueOrtho2022@40|rvrSchriftNT@100",
      src: "/images/rain-hazard-map-bg/ortho.png",
      title: "Luftbildkarte",
    },
    stadtplan: {
      layerkey: "rvrGrau@45",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Stadtplan",
    },
    vector: {
      layerkey: "cismetLight",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Stadtplan",
    },
    abkg: {
      layerkey: "bplan_abkg@70",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Amtliche Basiskarte",
    },
  };

  return (
    <TopicMapContextProvider
      appKey={appKey}
      backgroundConfigurations={backgroundConfigurations}
      baseLayerConf={baseLayerConf}
      offlineCacheConfig={offlineConfig}
      backgroundModes={backgroundModes}
      referenceSystem={MappingConstants.crs3857}
      mapEPSGCode='3857'
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      maskingPolygon='POLYGON((668010.063156992 6750719.23021889,928912.612468322 6757273.20343972,930494.610325512 6577553.43685138,675236.835570551 6571367.64964125,668010.063156992 6750719.23021889))'
      getColorFromProperties={(item) => item.kampagne.color}
      itemFilterFunction={itemFilterFunction}
      classKeyFunction={(item) => item?.kampagne?.bezeichnung}
      convertItemToFeature={(_item) => {
        const f = convertItemToSimpleFeature(_item);
        f.properties.genericLinks = [
          SteckbriefActionFactory({ setWaiting, item: f.properties, jwt, setJWT, setLoginInfo }),
        ];
        return f;
      }}
      alwaysShowAllFeatures={false}
      getFeatureStyler={() => {
        return (feature) => {
          const c = new Color(feature.properties.color);
          let borderColor, fillOpacity;
          if (feature.selected === true) {
            fillOpacity = 0.85;
            borderColor = selectionColor;
          } else {
            fillOpacity = 0.6;
            borderColor = c.darken(0.1);
          }
          const style = {
            color: borderColor,
            radius: 5,
            weight: 2,
            opacity: 0.7,
            fillColor: c,
            fillOpacity,
          };
          return style;
        };
      }}
      featureTooltipFunction={(feature) => feature?.text}
    >
      {jwt === undefined && (
        <LoginForm
          key={"login."}
          setJWT={setJWT}
          loginInfo={loginInfo}
          setLoginInfo={setLoginInfo}
        />
      )}
      {jwt !== undefined && (
        <Title
          logout={() => {
            setJWT(undefined);
            setLoginInfo({ color: "#69D2E7", text: "Sie wurden erfolgreich abgemeldet." });
            setTimeout(() => {
              setLoginInfo();
            }, 2500);
          }}
          jwt={jwt}
        />
      )}
      <Waiting waiting={waiting} />

      <PotenzialflaechenOnlineMap
        gazData={gazData}
        jwt={jwt}
        setJWT={setJWT}
        setLoginInfo={setLoginInfo}
      />
    </TopicMapContextProvider>
  );
}

export default App;
