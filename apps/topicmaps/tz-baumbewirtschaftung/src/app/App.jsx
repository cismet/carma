import { createContext, useContext, useEffect, useState } from "react";
import localforage from "localforage";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
import LoginForm from "./components/LoginForm";
import TitleControl from "./components/TitleControl";
import { APP_CONFIG } from "../config/appConfig";
import { SyncProvider } from "@carma-providers/syncing";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./App.css";
import Map from "./Map";
import "./index.css";
import {
  backgroundConfWithFastOrtho2024,
  useProgress,
} from "@carma-appframeworks/portals";

// Context for display modes
export const DisplayModesContext = createContext();
export const useDisplayModes = () => useContext(DisplayModesContext);

// Helper to get URL param from hash
const getUrlParam = (param) => {
  const hashParams = window.location.hash.split("?")[1];
  if (hashParams) {
    return new URLSearchParams(hashParams).has(param);
  }
  return new URLSearchParams(window.location.search).has(param);
};

// Extract username from JWT
const getUserFromJWT = (jwt) => {
  try {
    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    return payload.preferred_username || payload.sub || null;
  } catch {
    return null;
  }
};

if (typeof global === "undefined") {
  window.global = window;
}
export const offlineConfig = {
  rules: [
    {
      origin: "https://omt.map-hosting.de/fonts/Metropolis Medium Italic,Noto",
      cachePath: "fonts/Open",
    },
    {
      origin: "https://omt.map-hosting.de/fonts/Klokantech Noto",
      cachePath: "fonts/Open",
    },
    {
      origin: "https://omt.map-hosting.de/fonts",
      cachePath: "fonts",
    },
    {
      origin: "https://omt.map-hosting.de/styles",
      cachePath: "styles",
    },

    {
      origin: "https://omt.map-hosting.de/data/v3",
      cachePath: "tiles",
    },

    {
      origin: "https://omt.map-hosting.de/data/gewaesser",
      cachePath: "tiles.gewaesser",
    },

    {
      origin: "https://omt.map-hosting.de/data/kanal",
      cachePath: "tiles.kanal",
    },

    {
      origin: "https://omt.map-hosting.de/data/brunnen",
      cachePath: "tiles.brunnen",
      // realServerFallback: true, //this can override the globalsetting
    },
  ],
  dataStores: [
    {
      name: "Vektorkarte für Wuppertal",
      key: "wuppBasemap",
      url: "https://offline-data.cismet.de/offline-data/wupp.zip",
    },
  ],
  offlineStyles: [
    "https://omt.map-hosting.de/styles/cismet-light/style.json",
    "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
    "https://omt.map-hosting.de/styles/dark-matter/style.json",
    "https://omt.map-hosting.de/styles/klokantech-basic/style.json",
  ],
  realServerFallback: true, //should be true in production
  consoleDebug: false && process.env.NODE_ENV !== "production",
  optional: true,
  initialActive: false, //todo set to true in production
};

const baseLayerConf = { ...defaultLayerConf };
if (!baseLayerConf.namedLayers.osmBrightOffline) {
  baseLayerConf.namedLayers.osmBrightOffline = {
    type: "vector",
    style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
    offlineAvailable: true,
    offlineDataStoreKey: "wuppBasemap",
    pane: "backgroundvectorLayers",
  };
}

const backgroundModes = [
  {
    title: "Stadtplan (Tag)",
    mode: "default",
    layerKey: "stadtplan",
  },
  {
    title: "Stadtplan (Nacht)",
    mode: "night",
    layerKey: "stadtplan",
  },
  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
  {
    title: "Vektor-Stadtplan",
    mode: "default",
    layerKey: "vectorCityMap",
    offlineDataStoreKey: "wuppBasemap",
  },
];

const bgConf = {
  ...backgroundConfWithFastOrtho2024,
  vectorCityMap: {
    layerkey: "osmBrightOffline",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};
function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();
  const [auth, setAuth] = useState({ checked: false, jwt: null });
  const [loginInfo, setLoginInfo] = useState();
  const [connectionError, setConnectionError] = useState(!navigator.onLine);
  const [followMode, setFollowMode] = useState(getUrlParam("followMode"));
  const [crossHair, setCrossHair] = useState(getUrlParam("crossHair"));

  // Listen for browser online/offline events
  useEffect(() => {
    const handleOnline = () => setConnectionError(false);
    const handleOffline = () => setConnectionError(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    document.title = "Teilzwilling Baumbewirtschaftung Wuppertal";
  }, []);

  // Load and verify JWT from storage on mount
  useEffect(() => {
    (async () => {
      const stored = await localforage.getItem(
        "@tz.baumbewirtschaftung.auth.jwt"
      );
      if (stored) {
        // Optimistically set JWT first to prevent modal flicker
        setAuth({ checked: false, jwt: stored });

        // Verify JWT via a lightweight GraphQL request
        try {
          const res = await fetch(APP_CONFIG.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${stored}`,
            },
            body: JSON.stringify({ query: "query{__typename}" }),
          });
          if (res.ok) {
            setAuth({ checked: true, jwt: stored });
          } else {
            await localforage.removeItem("@tz.baumbewirtschaftung.auth.jwt");
            setAuth({ checked: true, jwt: undefined });
          }
        } catch (e) {
          await localforage.removeItem("@tz.baumbewirtschaftung.auth.jwt");
          setAuth({ checked: true, jwt: undefined });
        }
      } else {
        setAuth({ checked: true, jwt: undefined });
      }
    })();
  }, []);

  // Persist JWT on change (store when set, remove when cleared)
  useEffect(() => {
    if (!auth.checked) return; // Skip persistence during initial load

    (async () => {
      const key = "@tz.baumbewirtschaftung.auth.jwt";
      if (auth.jwt) {
        await localforage.setItem(key, auth.jwt);
      } else {
        await localforage.removeItem(key);
      }
    })();
  }, [auth.jwt, auth.checked]);

  const login = auth.jwt ? getUserFromJWT(auth.jwt) : null;

  // Custom task formatter for tree actions
  const taskFormatter = (doc, params) => {
    let actionStatus = "unknown";
    if (
      params.status === "open" ||
      params.status === "done" ||
      params.status === "exception"
    ) {
      actionStatus = params.status;
    }

    return {
      actionStatus,
      fachobjekt: params.fk_tree ? `Baum ${params.fk_tree}` : "Baum",
      beschreibung: params.description || params.status_reason || doc.action,
    };
  };

  return (
    <DisplayModesContext.Provider
      value={{ followMode, setFollowMode, crossHair, setCrossHair }}
    >
      <SyncProvider
        jwt={auth.jwt}
        login={login}
        config={APP_CONFIG.sync}
        taskFormatter={taskFormatter}
      >
        <TopicMapContextProvider
          appKey="tz.baumbewirtschaftung"
          backgroundConfigurations={bgConf}
          backgroundModes={backgroundModes}
          baseLayerConf={baseLayerConf}
          offlineCacheConfig={offlineConfig}
        >
          {auth.checked && auth.jwt === undefined && (
            <LoginForm
              setJWT={(token) => setAuth({ checked: true, jwt: token })}
              loginInfo={loginInfo}
              setLoginInfo={setLoginInfo}
            />
          )}
          <TitleControl
            jwt={auth.jwt}
            logout={() => {
              setAuth({ checked: true, jwt: undefined });
            }}
            connectionError={connectionError}
          />
          <Map
            jwt={auth.jwt}
            login={login}
            followMode={followMode}
            crossHair={crossHair}
            onAuthError={() => {
              setAuth({ checked: true, jwt: undefined });
              setLoginInfo({
                color: "#F9D423",
                text: "Bitte melden Sie sich erneut an.",
              });
              setTimeout(() => setLoginInfo(), 2500);
            }}
            onConnectionError={(hasError) => setConnectionError(hasError)}
          />
        </TopicMapContextProvider>
      </SyncProvider>
    </DisplayModesContext.Provider>
  );
}

export default App;
