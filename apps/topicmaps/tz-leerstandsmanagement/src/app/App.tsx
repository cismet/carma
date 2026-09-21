import { useEffect, useState } from "react";
import localforage from "localforage";
import { ConfigProvider } from "antd";
import deDE from "antd/locale/de_DE";
import dayjs from "dayjs";
import "dayjs/locale/de";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
import { backgroundConfWithFastOrtho2024 } from "@carma-appframeworks/portals";
import { LibreContextProvider } from "@carma-mapping/engines/maplibre";

import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "../styles.css";

import { APP_CONFIG } from "../config/appConfig";
import { LoginForm, type LoginInfo } from "./components/LoginForm";
import { TitleControl } from "./components/TitleControl";
import { Map } from "./Map";
import { getUserFromJWT } from "./helper/auth";
import { GraphQLRequestError, gql } from "./helper/graphql";

if (typeof (globalThis as { global?: unknown }).global === "undefined") {
  (window as unknown as { global: Window }).global = window;
}

// German month names in the month picker
dayjs.locale("de");

// antd pieces (month picker, messages, search) in the font stack and navy of the design
const antdTheme = {
  token: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    colorPrimary: "#123B5E",
  },
};

const backgroundModes = [
  { title: "Stadtplan (Tag)", mode: "default", layerKey: "stadtplan" },
  { title: "Stadtplan (Nacht)", mode: "night", layerKey: "stadtplan" },
  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
];

interface AuthState {
  checked: boolean;
  jwt?: string;
}

const App = () => {
  const [auth, setAuth] = useState<AuthState>({ checked: false });
  const [loginInfo, setLoginInfo] = useState<LoginInfo>();
  const [connectionError, setConnectionError] = useState(!navigator.onLine);

  useEffect(() => {
    // the datasheet footer (collab Attribution) prefixes "Teilzwilling" itself
    document.title = "Leerstandsmanagement Wuppertal";
  }, []);

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

  // Restore the stored JWT and check it with a trivial query. A 401 drops the
  // token, any other failure keeps it and only flags the connection.
  useEffect(() => {
    (async () => {
      const stored = await localforage.getItem<string>(APP_CONFIG.jwtStorageKey);
      if (!stored) {
        setAuth({ checked: true });
        return;
      }
      setAuth({ checked: false, jwt: stored });
      try {
        await gql(stored, "{ __typename }");
        setAuth({ checked: true, jwt: stored });
      } catch (e) {
        if (e instanceof GraphQLRequestError && e.status === 401) {
          await localforage.removeItem(APP_CONFIG.jwtStorageKey);
          setAuth({ checked: true });
        } else {
          setAuth({ checked: true, jwt: stored });
          setConnectionError(true);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!auth.checked) return;
    if (auth.jwt) {
      localforage.setItem(APP_CONFIG.jwtStorageKey, auth.jwt);
    } else {
      localforage.removeItem(APP_CONFIG.jwtStorageKey);
    }
  }, [auth]);

  const user = auth.jwt ? getUserFromJWT(auth.jwt) : null;
  const logout = () => setAuth({ checked: true });

  return (
    <ConfigProvider theme={antdTheme} locale={deDE}>
      <TopicMapContextProvider
        appKey={APP_CONFIG.appKey}
        backgroundConfigurations={backgroundConfWithFastOrtho2024}
        backgroundModes={backgroundModes}
        baseLayerConf={defaultLayerConf}
      >
        {auth.checked && !auth.jwt && (
          <LoginForm
            onJwt={(jwt) => setAuth({ checked: true, jwt })}
            loginInfo={loginInfo}
            setLoginInfo={setLoginInfo}
          />
        )}
        <TitleControl user={user} onLogout={logout} connectionError={connectionError} />
        <LibreContextProvider>
          <Map
            jwt={auth.jwt}
            user={user}
            onAuthError={() => {
              logout();
              setLoginInfo({ color: "#F9D423", text: "Bitte melden Sie sich erneut an." });
              setTimeout(() => setLoginInfo(undefined), 2500);
            }}
            onConnectionError={setConnectionError}
          />
        </LibreContextProvider>
      </TopicMapContextProvider>
    </ConfigProvider>
  );
};

export default App;
